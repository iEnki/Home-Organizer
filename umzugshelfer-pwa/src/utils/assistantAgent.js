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
    super(message || "Tool calling is not supported by the configured model.");
    this.name = "AgentToolsUnsupportedError";
  }
}

const MAX_HISTORY_MESSAGES = 12;
const TOOL_RESULT_MAX_CHARS = 4000;
const ASSISTANT_TOTAL_BUDGET_MS = 180_000;
const ASSISTANT_REQUEST_TIMEOUT_MS = 105_000;

const buildSystemPrompt = ({ appMode, pathname, locale }) => {
  const today = new Date().toISOString().split("T")[0];
  const langInstruction =
    locale === "en-GB" ? "Always answer in English." : "Always answer in German.";
  return [
    "You are the global assistant for a household app (Home Organizer + moving planner).",
    "You answer questions about household data and prepare actions.",
    `Today: ${today}. App mode: ${appMode || "home"}. Current route: ${pathname || "/"}.`,
    langInstruction,
    "",
    "Rules:",
    "- Use tools to look up data instead of guessing. Combine multiple tools for cross-module questions.",
    "- Answer concisely and concretely. Mention numbers, dates and names from tool results.",
    "- For counting questions, ALWAYS use the anzahl_gesamt field from the tool result; lists such as eintraege/rezepte are shortened excerpts. For count or overview questions, call search tools without query.",
    "- If data is missing or a tool reports an error, say so plainly.",
    "- NEVER write directly to the database. To create/update/delete, use only *_vorschlagen tools or aktion_vorschlagen; the user confirms afterwards in chat.",
    "- After a proposal tool, end your turn; do not make further tool calls.",
    "- Medication: you may mention stock, storage location and expiry dates, but do NOT provide medical advice, diagnosis, dosage guidance or interaction information.",
    "- Reminders are tasks (todo_aufgaben) with erinnerungs_datum.",
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
  const deadlineAt = Date.now() + ASSISTANT_TOTAL_BUDGET_MS;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      return {
        finalText:
          locale === "en-GB"
            ? "The AI request took too long. Please try again or narrow down the question."
            : "Die KI-Anfrage hat zu lange gedauert. Bitte versuche es erneut oder grenze die Frage ein.",
        toolTrace,
        proposalCreated,
      };
    }
    let response;
    try {
      response = await client.chat.completions.create({
        model: "gpt-4o",
        context: "assistant",
        messages,
        temperature: 0.2,
        tools,
        tool_choice: "auto",
        max_tokens: 4096,
        timeout_ms: Math.min(ASSISTANT_REQUEST_TIMEOUT_MS, remainingMs),
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
