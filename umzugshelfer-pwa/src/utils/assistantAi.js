import { supabase } from "../supabaseClient";
import { cleanKiJsonResponse, getKiClient, isKiClientReady, KiProxyError } from "./kiClient";
import {
  ASSISTANT_DOMAIN_CONFIG,
  ASSISTANT_ROUTE_MAP,
  buildDomainExtractionPrompt,
  parseAssistantJson,
} from "./assistantDomains";

const ASSISTANT_MODEL_TEMPERATURE = 0.2;

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const mapAssistantModelError = (error) => {
  if (error instanceof KiProxyError) {
    return error;
  }
  return new Error(error?.message || "Die KI-Anfrage konnte nicht verarbeitet werden.");
};

const parseAssistantModelContent = ({ content, expectedType }) => {
  const cleaned = cleanKiJsonResponse(content, "object");

  if (expectedType === "array") {
    try {
      const parsed = parseAssistantJson(cleaned, "object");
      if (Array.isArray(parsed?.items)) return parsed.items;
    } catch {}
    try {
      const arrayStr = cleanKiJsonResponse(content, "array");
      const fallback = parseAssistantJson(arrayStr, "array");
      if (Array.isArray(fallback)) return fallback;
    } catch {}
    throw new Error("Die KI hat kein gueltiges Array geliefert.");
  }

  return parseAssistantJson(cleaned, "object");
};

const callAssistantModel = async ({ userId, messages, expectedType = "object" }) => {
  const { client, model, provider } = await getKiClient(userId);
  if (!client || !isKiClientReady({ client, provider })) {
    throw new Error("KI ist fuer diesen Haushalt nicht konfiguriert.");
  }

  let response;
  try {
    response = await client.chat.completions.create({
      model,
      messages,
      temperature: ASSISTANT_MODEL_TEMPERATURE,
      response_format: { type: "json_object" },
    });
  } catch (error) {
    throw mapAssistantModelError(error);
  }

  const content = response?.choices?.[0]?.message?.content || "";
  try {
    return parseAssistantModelContent({ content, expectedType });
  } catch (error) {
    console.error("[assistantAi] JSON parse failed. expectedType:", expectedType, "Raw content:", content);
    throw new Error(
      expectedType === "array"
        ? "Die KI-Antwort konnte nicht als JSON-Liste gelesen werden."
        : "Die KI-Antwort konnte nicht als JSON-Objekt gelesen werden.",
    );
  }
};

const loadSemanticContext = async (userId, householdId) => {
  const [
    objekteRes,
    vorraeteRes,
    geraeteRes,
    lagerorteRes,
    buecherRes,
    budgetRes,
    wissenRes,
    wartungenRes,
    todosRes,
  ] = await Promise.all([
    supabase
      .from("home_objekte")
      .select("name, kategorie, status, tags")
      .eq("user_id", userId)
      .neq("status", "entsorgt")
      .limit(150),
    supabase
      .from("home_vorraete")
      .select("name, kategorie, bestand, einheit, mindestmenge")
      .eq("user_id", userId)
      .limit(80),
    supabase
      .from("home_geraete")
      .select("name, hersteller, modell, naechste_wartung, kaufdatum, garantie_bis, kategorie")
      .eq("user_id", userId)
      .limit(80),
    supabase
      .from("home_lagerorte")
      .select("name, ort_id, home_orte(name)")
      .eq("user_id", userId)
      .limit(80),
    supabase
      .from("home_buecher")
      .select("id, titel, autor_anzeige, isbn_13, status, verliehen_an_name, rueckgabe_erwartet_am, tags")
      .eq("user_id", userId)
      .limit(120),
    supabase
      .from("budget_posten")
      .select("beschreibung, betrag, datum, kategorie, typ, budget_scope")
      .eq("user_id", userId)
      .order("datum", { ascending: false })
      .limit(240),
    supabase
      .from("home_wissen")
      .select("id, dokument_id, titel, inhalt, kategorie, tags")
      .eq("user_id", userId)
      .limit(120),
    supabase
      .from("home_wartungen")
      .select("datum, typ, beschreibung, home_geraete(name)")
      .eq("user_id", userId)
      .order("datum", { ascending: false })
      .limit(80),
    supabase
      .from("todo_aufgaben")
      .select("beschreibung, kategorie, faelligkeitsdatum")
      .eq("user_id", userId)
      .eq("erledigt", false)
      .limit(80),
  ]);

  const wissen = wissenRes.data || [];
  const wissenRefs = {};
  wissen.forEach((entry, index) => {
    wissenRefs[`W${index + 1}`] = entry;
  });

  const contextSections = [
    (objekteRes.data || []).length > 0 &&
      `## Inventar\n${(objekteRes.data || [])
        .map((item) => `- ${item.name}${item.kategorie ? ` (${item.kategorie})` : ""}${item.tags?.length ? ` [${item.tags.join(", ")}]` : ""}`)
        .join("\n")}`,
    (lagerorteRes.data || []).length > 0 &&
      `## Lagerorte\n${(lagerorteRes.data || [])
        .map((item) => `- ${item.name}${item.home_orte?.name ? ` -> ${item.home_orte.name}` : ""}`)
        .join("\n")}`,
    (vorraeteRes.data || []).length > 0 &&
      `## Vorrate\n${(vorraeteRes.data || [])
        .map((item) => `- ${item.name}: ${item.bestand} ${item.einheit || ""} (Min: ${item.mindestmenge || 0})`)
        .join("\n")}`,
    (geraeteRes.data || []).length > 0 &&
      `## Gerate\n${(geraeteRes.data || [])
        .map((item) => {
          const parts = [item.name];
          const brand = [item.hersteller, item.modell].filter(Boolean).join(" ");
          if (brand) parts.push(`(${brand})`);
          if (item.kategorie) parts.push(`[${item.kategorie}]`);
          if (item.naechste_wartung) parts.push(`Wartung: ${item.naechste_wartung}`);
          if (item.garantie_bis) parts.push(`Garantie bis: ${item.garantie_bis}`);
          return `- ${parts.join(" ")}`;
        })
        .join("\n")}`,
    (buecherRes.data || []).length > 0 &&
      `## Buecher\n${(buecherRes.data || [])
        .map((item) => {
          let line = `- ${item.titel}${item.autor_anzeige ? ` von ${item.autor_anzeige}` : ""}`;
          if (item.status === "verliehen") {
            line += ` [verliehen an ${item.verliehen_an_name || "unbekannt"}${item.rueckgabe_erwartet_am ? `, bis ${item.rueckgabe_erwartet_am}` : ""}]`;
          } else if (item.status) {
            line += ` [${item.status}]`;
          }
          return line;
        })
        .join("\n")}`,
    (budgetRes.data || []).length > 0 &&
      `## Budget\n${(budgetRes.data || [])
        .map((item) => `- ${item.datum} | ${item.beschreibung || "-"} | ${item.typ === "einnahme" ? "+" : "-"}${item.betrag} EUR | ${item.kategorie || "-"} | ${item.budget_scope || "haushalt"}`)
        .join("\n")}`,
    wissen.length > 0 &&
      `## Wissensdatenbank\n${wissen
        .map((entry, index) => {
          let line = `- [W${index + 1}] [${entry.kategorie || "-"}] ${entry.titel}`;
          if (entry.inhalt) line += `: ${entry.inhalt.substring(0, 300)}`;
          if (entry.tags?.length) line += ` [${entry.tags.join(", ")}]`;
          return line;
        })
        .join("\n")}`,
    (wartungenRes.data || []).length > 0 &&
      `## Wartungshistorie\n${(wartungenRes.data || [])
        .map((item) => `- ${item.datum}: ${item.home_geraete?.name || "Geraet"} - ${item.beschreibung || item.typ || "Wartung"}`)
        .join("\n")}`,
    (todosRes.data || []).length > 0 &&
      `## Offene Aufgaben\n${(todosRes.data || [])
        .map((item) => `- ${item.beschreibung}${item.kategorie ? ` (${item.kategorie})` : ""}${item.faelligkeitsdatum ? ` bis ${item.faelligkeitsdatum}` : ""}`)
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    contextText: contextSections || "(Noch keine relevanten Haushaltsdaten vorhanden.)",
    wissenRefs,
  };
};

export const answerSemanticHouseholdQuestion = async ({ userId, householdId, question }) => {
  const { contextText, wissenRefs } = await loadSemanticContext(userId, householdId);
  const result = await callAssistantModel({
    userId,
    expectedType: "object",
    messages: [
      {
        role: "system",
        content:
          'Du bist ein praeziser Haushalts-Assistent. Antworte nur anhand des gelieferten Haushaltskontexts. Wenn Informationen fehlen, sage das klar. Antworte immer als JSON: {"answer":"...","quellen":["W1"]}.',
      },
      {
        role: "user",
        content: `Haushaltskontext:\n${contextText}\n\nFrage: ${question}`,
      },
    ],
  });

  const sources = (result?.quellen || [])
    .map((ref) => wissenRefs[ref])
    .filter(Boolean)
    .map((entry) => ({
      reference: entry.id,
      title: entry.titel,
      documentId: entry.dokument_id || null,
    }));

  return {
    answer: result?.answer || "Keine Antwort verfuegbar.",
    sources,
    payload: isObject(result) ? result : {},
  };
};

export const classifyAssistantInput = async ({ userId, input, appMode, pathname }) => {
  const domainKeys = Object.keys(ASSISTANT_DOMAIN_CONFIG).join(", ");
  const routeKeys = Object.keys(ASSISTANT_ROUTE_MAP).join(", ");
  return callAssistantModel({
    userId,
    expectedType: "object",
    messages: [
      {
        role: "system",
        content: `Du klassifizierst Eingaben fuer einen globalen Assistenten. Antworte AUSSCHLIESSLICH als JSON-Objekt.
Erlaubte intents:
- "extract_records": Nutzer will Daten anlegen oder aktualisieren.
- "semantic_search": Nutzer stellt eine Frage zu vorhandenen Haushaltsdaten.
- "open_flow": Nutzer will gezielt eine Spezialansicht oder einen Scan-/Review-Flow oeffnen.
- "unknown": nicht sicher.
Erlaubte domains fuer extract_records: ${domainKeys}
Erlaubte open_flow keys: ${routeKeys}
Klassifizierungsregeln:
- Fragen wie "wo ist", "was fehlt", "welche Wartung", "wann habe ich zuletzt" -> semantic_search
- Rechnungsscan, Dokumentanalyse -> open_flow
- "Buch hinzufuegen", "Buch gelesen", "habe Buch" -> domain "buecher"
- "Buchscanner starten", "ISBN scannen" -> open_flow, key "buchscanner"
- "Wartung gemacht", "gewartet", "Filter gewechselt", "Inspektion" -> domain "wartungen"
- Neues Geraet, Geraet erfassen, Hersteller/Modell/Kaufdatum erwaehnt -> domain "geraete"
- Inventar, Gegenstand, Objekt, Werkzeug -> domain "inventar"
- Vorraete, Lebensmittel, Bestand -> domain "vorraete"
- Kostenaufteilung, "aufteilen", "split", "wer hat gezahlt/bezahlt", "gemeinsam bezahlt" -> domain "budget_split"
- Ausgleich, "schuldet", "zurueckzahlen", "erstatten" -> domain "budget_settlement"
- Einfacher Budget-Eintrag ohne Aufteilung -> domain "budget"
- Aufgabe, Todo (Umzug) -> domain "todos"; Heimaufgabe/Home-Task -> domain "aufgaben"
Antwortformat (exakt dieses JSON-Schema):
{"intent":"extract_records","domain":"budget","open_flow":null,"reply":"kurze knappe Nutzerantwort","needs_confirmation":true}`,
      },
      {
        role: "user",
        content: `App-Modus: ${appMode}\nAktuelle Route: ${pathname}\nEingabe: ${input}`,
      },
    ],
  });
};

const loadBewohnerNamen = async () => {
  try {
    const { data } = await supabase.rpc("get_bewohner_overview");
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((b) => b.display_name || b.name).filter(Boolean);
  } catch {
    return null;
  }
};

export const extractAssistantDomainItems = async ({ userId, domain, text }) => {
  let contextPrefix = "";

  if (domain === "budget_split" || domain === "budget_settlement") {
    const namen = await loadBewohnerNamen();
    if (namen && namen.length > 0) {
      contextPrefix = `Bekannte Haushaltsmitglieder (verwende EXAKT diese Namen): ${namen.join(", ")}\n\n`;
    }
  }

  if (domain === "wartungen") {
    try {
      const { data: geraete } = await supabase
        .from("home_geraete")
        .select("name")
        .limit(80);
      if (Array.isArray(geraete) && geraete.length > 0) {
        const geraetNamen = geraete.map((g) => g.name).filter(Boolean).join(", ");
        contextPrefix = `Bekannte Geraete (verwende EXAKT diese Namen): ${geraetNamen}\n\n`;
      }
    } catch {}
  }

  const prompt = buildDomainExtractionPrompt(domain, text);
  const items = await callAssistantModel({
    userId,
    expectedType: "array",
    messages: [
      {
        role: "system",
        content:
          'Du bist ein JSON-Extraktor. Antworte ausschliesslich mit einem gueltigen JSON-Objekt im Format {"items":[...]}. Kein Markdown, kein Fliesstext.',
      },
      {
        role: "user",
        content: `${contextPrefix}${prompt}\n\nWICHTIG: Antworte ausschliesslich als JSON-Objekt im Format {"items":[...]} .`,
      },
    ],
  });

  if (!Array.isArray(items)) {
    throw new Error("Die KI hat kein gueltiges Array geliefert.");
  }
  return items;
};
