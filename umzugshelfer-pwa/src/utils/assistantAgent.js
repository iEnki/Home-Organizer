/**
 * assistantAgent.js
 * Agentischer Tool-Calling-Loop fuer den globalen Assistenten.
 *
 * Ablauf pro Nutzereingabe:
 *   1. System-Prompt + History + Eingabe an ki-chat (context: "assistant") mit Tools.
 *   2. Liefert das Modell tool_calls, werden diese client-seitig (RLS/JWT) ausgefuehrt
 *      und die Ergebnisse als role:"tool"-Nachrichten angehaengt.
 *   3. Wiederholen bis Textantwort, Vorschlag (pendingAction) oder Iterations-Cap.
 *
 * Schreibaktionen entstehen NIE direkt: Vorschlags-Tools rufen onProposal auf
 * und beenden den Turn — der Nutzer bestaetigt in der bestehenden Vorschaukarte.
 */

import { getKiClient, KiProxyError } from "./kiClient";
import { toOpenAiTools, truncateToolResult } from "./assistantToolRegistry";

export class AgentToolsUnsupportedError extends Error {
  constructor(message) {
    super(message || "Tool-Calling wird vom konfigurierten Modell nicht unterstuetzt.");
    this.name = "AgentToolsUnsupportedError";
  }
}

const MAX_HISTORY_MESSAGES = 12;
const TOOL_RESULT_MAX_CHARS = 4000;

const buildSystemPrompt = ({ appMode, pathname, locale }) => {
  const today = new Date().toISOString().split("T")[0];
  const langInstruction =
    locale === "en-GB" ? "Antworte immer auf Englisch." : "Antworte immer auf Deutsch.";
  return [
    "Du bist der globale Assistent einer Haushalts-App (Home Organizer + Umzugsplaner).",
    "Du beantwortest Fragen zu allen Haushaltsdaten und bereitest Aktionen vor.",
    `Heutiges Datum: ${today}. App-Modus: ${appMode || "home"}. Aktuelle Route: ${pathname || "/"}.`,
    langInstruction,
    "",
    "Regeln:",
    "- Nutze die Tools, um Daten nachzuschlagen, statt zu raten. Kombiniere mehrere Tools fuer modulübergreifende Fragen.",
    "- Antworte kompakt und konkret. Nenne Zahlen, Daten und Namen aus den Tool-Ergebnissen.",
    "- Fuer Zaehlfragen (\"wie viele ...\") gilt IMMER das Feld anzahl_gesamt aus dem Tool-Ergebnis; die Liste eintraege/rezepte ist nur ein gekuerzter Ausschnitt. Bei Zaehl- oder Uebersichtsfragen rufst du Such-Tools OHNE query auf.",
    "- Wenn Daten fehlen oder ein Tool einen Fehler meldet, sage das ehrlich.",
    "- Du darfst NIEMALS direkt in die Datenbank schreiben. Zum Anlegen/Aendern/Loeschen nutzt du ausschliesslich die *_vorschlagen-Tools bzw. aktion_vorschlagen; der Nutzer bestaetigt danach im Chat.",
    "- Nach einem Vorschlags-Tool beendest du deinen Zug — keine weiteren Tool-Aufrufe.",
    "- Medikamente: Du darfst Bestand, Lagerort und Ablaufdaten nennen, aber KEINE medizinische Beratung, Diagnose, Dosierungs- oder Wechselwirkungsauskunft geben.",
    "- Erinnerungen sind Aufgaben (todo_aufgaben) mit erinnerungs_datum.",
  ].join("\n");
};

const normalizeHistory = (history) =>
  (Array.isArray(history) ? history : [])
    .filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((entry) => ({ role: entry.role, content: entry.content }));

const summarizeResultForTrace = (result) => {
  const text = truncateToolResult(result, 160);
  return text;
};

/**
 * Fuehrt den agentischen Loop aus.
 * @returns {Promise<{ finalText: string, toolTrace: Array, proposalCreated: boolean }>}
 */
export const runAssistantAgent = async ({
  userId,
  session,
  householdId,
  appMode = "home",
  pathname = "/",
  locale = "de",
  input,
  history = [],
  toolSpecs = [],
  maxIterations = 6,
  onToolEvent,
  onProposal,
  client: injectedClient,
} = {}) => {
  const client = injectedClient || (await getKiClient(userId)).client;
  if (!client) {
    throw new Error(
      locale === "en-GB"
        ? "AI is not configured for this household."
        : "KI ist fuer diesen Haushalt nicht konfiguriert.",
    );
  }

  const toolMap = new Map(toolSpecs.map((spec) => [spec.name, spec]));
  const tools = toOpenAiTools(toolSpecs);

  const messages = [
    { role: "system", content: buildSystemPrompt({ appMode, pathname, locale }) },
    ...normalizeHistory(history),
    { role: "user", content: String(input || "").trim() },
  ];

  const toolTrace = [];
  let proposalCreated = false;
  let proposalSummary = "";

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let response;
    try {
      response = await client.chat.completions.create({
        model: "gpt-4o",
        context: "assistant",
        messages,
        temperature: 0.2,
        tools,
        tool_choice: "auto",
      });
    } catch (error) {
      if (error instanceof KiProxyError && error.code === "TOOLS_UNSUPPORTED") {
        throw new AgentToolsUnsupportedError(error.message);
      }
      throw error;
    }

    const message = response?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (toolCalls.length === 0) {
      return {
        finalText: String(message.content || "").trim(),
        toolTrace,
        proposalCreated,
      };
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call?.function?.name || "";
      const spec = toolMap.get(name);
      let args = {};
      try {
        args = JSON.parse(call?.function?.arguments || "{}") || {};
      } catch {
        args = {};
      }

      let result;
      if (!spec) {
        result = { fehler: `Unbekanntes Tool: ${name}` };
      } else {
        onToolEvent?.({ name, args });
        try {
          result = await spec.execute({
            session,
            userId,
            householdId,
            appMode,
            locale,
            args,
            onProposal,
          });
        } catch (error) {
          result = { fehler: error?.message || String(error) };
        }
      }

      if (result && result.__proposal === true) {
        proposalCreated = true;
        proposalSummary = result.zusammenfassung || "";
        result = { status: "vorschlag_erstellt", zusammenfassung: proposalSummary };
      }

      toolTrace.push({ name, args, resultPreview: summarizeResultForTrace(result) });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: truncateToolResult(result, TOOL_RESULT_MAX_CHARS),
      });
    }

    if (proposalCreated) {
      // Nach einem Vorschlag endet der Zug — der Nutzer bestaetigt in der Vorschaukarte.
      return { finalText: proposalSummary, toolTrace, proposalCreated };
    }
  }

  return {
    finalText:
      locale === "en-GB"
        ? "I could not finish the request within the tool budget. Please narrow down the question."
        : "Ich konnte die Anfrage nicht innerhalb des Tool-Budgets abschliessen. Bitte grenze die Frage etwas ein.",
    toolTrace,
    proposalCreated,
  };
};
