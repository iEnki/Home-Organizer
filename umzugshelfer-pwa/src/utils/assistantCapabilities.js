import { supabase } from "../supabaseClient";
import {
  getDefaultHomeBudgetCategories,
  getSelectableHomeBudgetCategoryNames,
  normalizeHomeBudgetCategory,
} from "./homeBudgetCategories";
import { isMedicationAdviceRequest, medicationAdviceRefusal } from "./heimapotheke";

const todayIso = () => new Date().toISOString().split("T")[0];

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("de-DE");

const stripDiacritics = (value) =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const parseMoney = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value).match(/\d+/)?.[0] || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const deMatch = raw.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (deMatch) {
    const day = deMatch[1].padStart(2, "0");
    const month = deMatch[2].padStart(2, "0");
    const yearRaw = deMatch[3] || String(new Date().getFullYear());
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month}-${day}`;
  }

  const lowered = normalizeText(raw);
  if (/\bheute|today\b/.test(lowered)) return todayIso();
  if (/\bgestern|yesterday\b/.test(lowered)) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  }
  if (/\bmorgen|tomorrow\b/.test(lowered)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
};

const splitList = (value) =>
  String(value || "")
    .split(/,|;|\bund\b|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

const extractShoppingItemsFromText = (text) => {
  const cleaned = String(text || "")
    .replace(/^(bitte\s+)?(gib|setze|packe|fuege|f.ge|leg[e]?|erstelle|add)\s+/i, "")
    .replace(/\b(auf|in)\s+(die\s+)?einkaufsliste\b/gi, "")
    .replace(/\b(einkaufsliste|einkaufen|besorgen)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const items = splitList(cleaned);
  return items.map((name) => ({
    original_text: name,
    name,
    normalized_name: name,
  }));
};

const normalizeInvoicePositions = (value) => {
  const source = Array.isArray(value) ? value : splitList(value);
  const seen = new Set();
  return source
    .map((entry) => {
      const description = isObject(entry)
        ? entry.beschreibung || entry.name || entry.titel || entry.original_text
        : entry;
      return String(description || "")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter((description) => {
      if (!description) return false;
      const key = stripDiacritics(description);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((beschreibung) => ({ beschreibung }));
};

const extractInvoicePositionsFromText = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const markerMatch = raw.match(
    /(?:artikel|positionen|produkte|posten|items)\s*(?:sind|waren|:|-)?\s+(.+)/i,
  );
  const shoppingMatch = raw.match(
    /(?:gekauft|eingekauft|besorgt)\s*(?:habe|wurden|waren|:|-)?\s+(.+)/i,
  );
  const supplierRestMatch = raw.match(
    /(?:rechnung|beleg|kassenbon)?\s*(?:von|bei)\s+\S+\s+(.+)/i,
  );

  const candidate = markerMatch?.[1] || shoppingMatch?.[1] || supplierRestMatch?.[1] || raw;
  const cleaned = candidate
    .replace(/\b(?:ueber|Ã¼ber|betrag|gesamt|brutto|summe|am|vom|datum|kategorie)\b.*$/i, "")
    .replace(/^\s*\d+\s+(?:artikel|positionen|produkte|posten|items)\s*[:,-]?\s*/i, "")
    .trim();

  if (!/[;,]|\s(?:und|and)\s/i.test(cleaned)) return [];
  return normalizeInvoicePositions(cleaned);
};

const makeChoices = (items = [], labelKey = "name") =>
  items
    .filter(Boolean)
    .map((item) => ({
      value: item.id || item.value || item[labelKey],
      label: item.label || item[labelKey] || item.name || item.titel || item.beschreibung,
      description: item.description || item.hersteller || item.kategorie || item.sub || "",
      raw: item,
    }))
    .filter((item) => item.value && item.label);

export const HOME_ASSISTANT_CAPABILITIES = {
  rechnung: {
    id: "rechnung",
    domain: "rechnung",
    label: "Rechnung erfassen",
    route: "/home/budget",
    actionKind: "create",
    requiredSlots: ["lieferant_name", "brutto", "beschreibung", "kategorie", "rechnungsdatum"],
    optionalSlots: ["positionen"],
    questions: {
      lieferant_name: "Von welcher Firma ist die Rechnung?",
      brutto: "Welcher Betrag steht auf der Rechnung?",
      beschreibung: "Wofuer war die Ausgabe?",
      kategorie: "Welche Kategorie soll verwendet werden?",
      rechnungsdatum: "Welches Datum hat die Rechnung?",
    },
  },
  wartungen: {
    id: "wartungen",
    domain: "wartungen",
    label: "Wartung erfassen",
    route: "/home/geraete",
    actionKind: "create",
    requiredSlots: ["geraet_id", "datum", "typ"],
    questions: {
      geraet_id: "Fuer welches Geraet soll die Wartung erstellt werden?",
      datum: "An welchem Datum wurde oder wird die Wartung gemacht?",
      typ: "Welche Art von Wartung ist es?",
    },
  },
  rezept_suche: {
    id: "rezept_suche",
    domain: "rezepte",
    label: "Rezept suchen",
    route: "/home/kochbuch",
    actionKind: "search",
    requiredSlots: ["query"],
    questions: {
      query: "Wonach soll ich im Kochbuch suchen?",
    },
  },
  inventar_objekt: {
    id: "inventar_objekt",
    domain: "inventar",
    label: "Objekt erfassen",
    route: "/home/inventar",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Welches Objekt soll ich erfassen?" },
  },
  inventar_ort: {
    id: "inventar_ort",
    domain: "inventar_ort",
    label: "Standort erfassen",
    route: "/home/inventar",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Wie soll der neue Standort heissen?" },
  },
  inventar_lagerort: {
    id: "inventar_lagerort",
    domain: "inventar_lagerort",
    label: "Lagerort erfassen",
    route: "/home/inventar",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Wie soll der neue Lagerort heissen?" },
  },
  vorraete: {
    id: "vorraete",
    domain: "vorraete",
    label: "Vorrat erfassen",
    route: "/home/vorraete",
    actionKind: "create",
    requiredSlots: ["name", "bestand"],
    questions: {
      name: "Welchen Vorrat soll ich erfassen?",
      bestand: "Welche Menge ist vorhanden?",
    },
  },
  medikamente: {
    id: "medikamente",
    domain: "medikamente",
    label: "Heimapotheke bearbeiten",
    route: "/home/heimapotheke",
    actionKind: "create",
    requiredSlots: ["aktion", "name"],
    optionalSlots: ["bestand", "bestand_delta", "lagerort", "ablaufdatum", "wirkstoff", "darreichungsform", "packungsgroesse", "kategorie", "notizen"],
    questions: {
      aktion: "Was soll ich in der Heimapotheke tun?",
      name: "Um welches Medikament geht es?",
      bestand: "Welcher Bestand soll gespeichert werden?",
      bestand_delta: "Um wie viele Packungen soll der Bestand geaendert werden?",
      lagerort: "Wo wird das Medikament gelagert?",
    },
  },
  einkaufliste: {
    id: "einkaufliste",
    domain: "einkaufliste",
    label: "Einkaufsartikel erfassen",
    route: "/home/einkaufliste",
    actionKind: "create",
    requiredSlots: ["items"],
    questions: { items: "Was soll auf die Einkaufsliste?" },
  },
  aufgaben: {
    id: "aufgaben",
    domain: "aufgaben",
    label: "Haushaltsaufgabe erfassen",
    route: "/home/aufgaben",
    actionKind: "create",
    requiredSlots: ["beschreibung"],
    questions: { beschreibung: "Welche Aufgabe soll ich anlegen?" },
  },
  bewohner: {
    id: "bewohner",
    domain: "bewohner",
    label: "Bewohner erfassen",
    route: "/home/bewohner",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Wie heisst der Bewohner?" },
  },
  geraete: {
    id: "geraete",
    domain: "geraete",
    label: "Geraet erfassen",
    route: "/home/geraete",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Welches Geraet soll ich erfassen?" },
  },
  budget: {
    id: "budget",
    domain: "budget",
    label: "Budget-Eintrag erfassen",
    route: "/home/budget",
    actionKind: "create",
    requiredSlots: ["beschreibung", "betrag"],
    questions: {
      beschreibung: "Wofuer ist der Budget-Eintrag?",
      betrag: "Welcher Betrag soll eingetragen werden?",
    },
  },
  budget_split: {
    id: "budget_split",
    domain: "budget_split",
    label: "Kostenaufteilung erfassen",
    route: "/home/budget",
    actionKind: "create",
    requiredSlots: ["beschreibung", "betrag", "payer_member_name", "participants"],
    questions: {
      beschreibung: "Wofuer ist die gemeinsame Ausgabe?",
      betrag: "Wie hoch ist der Gesamtbetrag?",
      payer_member_name: "Wer hat bezahlt?",
      participants: "Wer soll an der Aufteilung teilnehmen?",
    },
  },
  budget_settlement: {
    id: "budget_settlement",
    domain: "budget_settlement",
    label: "Budget-Ausgleich erfassen",
    route: "/home/budget?tab=ausgleich",
    actionKind: "create",
    requiredSlots: ["from_member_name", "to_member_name", "amount"],
    questions: {
      from_member_name: "Wer zahlt den Ausgleich?",
      to_member_name: "Wer bekommt den Ausgleich?",
      amount: "Welcher Betrag wird ausgeglichen?",
    },
  },
  projekte: {
    id: "projekte",
    domain: "projekte",
    label: "Projekt erfassen",
    route: "/home/projekte",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Wie soll das Projekt heissen?" },
  },
  wissen: {
    id: "wissen",
    domain: "wissen",
    label: "Wissenseintrag erfassen",
    route: "/home/wissen",
    actionKind: "create",
    requiredSlots: ["titel", "inhalt"],
    questions: {
      titel: "Welchen Titel soll der Wissenseintrag haben?",
      inhalt: "Was soll im Wissenseintrag stehen?",
    },
  },
  buecher: {
    id: "buecher",
    domain: "buecher",
    label: "Buch erfassen",
    route: "/home/inventar?tab=buecher",
    actionKind: "create",
    requiredSlots: ["titel"],
    questions: { titel: "Welches Buch soll ich erfassen?" },
  },
  rezept: {
    id: "rezept",
    domain: "rezept",
    label: "Rezept erfassen",
    route: "/home/kochbuch",
    actionKind: "create",
    requiredSlots: ["titel"],
    questions: { titel: "Wie heisst das Rezept?" },
  },
  sparziel: {
    id: "sparziel",
    domain: "sparziel",
    label: "Sparziel erfassen",
    route: "/home/budget",
    actionKind: "create",
    requiredSlots: ["name", "ziel_betrag"],
    questions: {
      name: "Wie soll das Sparziel heissen?",
      ziel_betrag: "Welcher Zielbetrag soll erreicht werden?",
    },
  },
  finanzkonto: {
    id: "finanzkonto",
    domain: "finanzkonto",
    label: "Finanzkonto erfassen",
    route: "/home/budget",
    actionKind: "create",
    requiredSlots: ["name"],
    questions: { name: "Wie soll das Finanzkonto heissen?" },
  },
};

export const HOME_ASSISTANT_FLOW_CAPABILITIES = {
  rechnung_scannen: {
    id: "rechnung_scannen",
    label: "Rechnung scannen",
    route: "/home/rechnung-scannen",
    ui_state: { entry: "upload" },
    keywords: ["rechnung scannen", "beleg scannen", "kassenbon scannen", "ocr rechnung", "scan invoice"],
  },
  dokument_upload: {
    id: "dokument_upload",
    label: "Dokument hochladen",
    route: "/home/dokumente",
    ui_state: { startModal: "upload" },
    keywords: ["dokument hochladen", "datei hochladen", "upload dokument", "dokument importieren"],
  },
  dokumente: {
    id: "dokumente",
    label: "Dokumente oeffnen",
    route: "/home/dokumente",
    keywords: ["dokumente", "dokument archiv", "dokumentarchiv"],
  },
  heimapotheke: {
    id: "heimapotheke",
    label: "Heimapotheke oeffnen",
    route: "/home/heimapotheke",
    keywords: [
      "oeffne heimapotheke",
      "offne heimapotheke",
      "heimapotheke oeffnen",
      "heimapotheke offnen",
      "zur heimapotheke",
      "zeige heimapotheke",
      "medikamentenschrank oeffnen",
      "medikamentenschrank offnen",
    ],
  },
  buchscanner: {
    id: "buchscanner",
    label: "Buchscanner oeffnen",
    route: "/home/inventar?tab=buecher",
    ui_state: { tab: "buecher", startModal: "scanner", scannerMode: "einzel" },
    keywords: ["buchscanner", "isbn scannen", "buch scannen"],
  },
  buch_fotoanalyse: {
    id: "buch_fotoanalyse",
    label: "Buch-Fotoanalyse oeffnen",
    route: "/home/inventar?tab=buecher",
    ui_state: { tab: "buecher", startModal: "upload" },
    keywords: ["buch foto", "buchanalyse", "buecher foto"],
  },
  rezept_import: {
    id: "rezept_import",
    label: "Rezept importieren",
    route: "/home/kochbuch",
    ui_state: { startModal: "import" },
    keywords: ["rezept importieren", "rezept von url", "kochvideo", "youtube rezept"],
  },
  budget_filter: {
    id: "budget_filter",
    label: "Budget-Filter oeffnen",
    route: "/home/budget",
    ui_state: { startSheet: "filter" },
    keywords: ["budget filter", "filter budget", "budget ansicht"],
  },
  budget_kategorien: {
    id: "budget_kategorien",
    label: "Budget-Kategorien verwalten",
    route: "/home/budget",
    ui_state: { startModal: "categoryManager" },
    keywords: ["budget kategorie", "kategorien verwalten", "budget kategorien"],
  },
  inventar_qr: {
    id: "inventar_qr",
    label: "Inventar QR-Code",
    route: "/home/inventar",
    ui_state: { startModal: "qr" },
    keywords: ["qr code", "qr-code", "lagerort qr"],
  },
  vertraege: {
    id: "vertraege",
    label: "Vertraege",
    route: "/home/vertraege",
    inactive: true,
    keywords: ["vertrag", "vertraege", "vertrage"],
  },
  versicherungen: {
    id: "versicherungen",
    label: "Versicherungen",
    route: "/home/versicherungen",
    inactive: true,
    keywords: ["versicherung", "polizze", "police"],
  },
};

const CAPABILITY_KEYWORDS = [
  { id: "rechnung", words: ["rechnung", "beleg", "ausgabe erfassen", "kassenbon"] },
  { id: "wartungen", words: ["wartung", "gewartet", "service", "filter gewechselt", "inspektion"] },
  { id: "rezept_suche", words: ["rezept suchen", "suche rezept", "such ein rezept", "kochbuch suchen"] },
  { id: "rezept", words: ["rezept erstellen", "rezept anlegen", "neues rezept"] },
  { id: "inventar_ort", words: ["standort anlegen", "standort erstellen", "neuer standort"] },
  { id: "inventar_lagerort", words: ["lagerort anlegen", "lagerort erstellen", "neuer lagerort"] },
  { id: "inventar_objekt", words: ["objekt", "inventar", "gegenstand"] },
  { id: "vorraete", words: ["vorrat", "vorraete", "vorrate", "bestand"] },
  { id: "medikamente", words: ["medikament", "medikamente", "heimapotheke", "tabletten", "beipackzettel", "apotheke"] },
  { id: "einkaufliste", words: ["einkaufsliste", "einkaufen", "kaufe", "besorgen"] },
  { id: "aufgaben", words: ["aufgabe", "haushaltsaufgabe", "todo"] },
  { id: "bewohner", words: ["bewohner", "mitbewohner", "person im haushalt"] },
  { id: "geraete", words: ["geraet", "gerat", "geraete", "gerate", "appliance"] },
  { id: "budget_split", words: ["aufteilen", "kostenaufteilung", "split", "gemeinsam bezahlt"] },
  { id: "budget_settlement", words: ["ausgleich", "zurueckzahlen", "zuruckzahlen", "schuldet", "erstatten"] },
  { id: "budget", words: ["budget", "zahlung", "kosten", "einnahme", "ausgabe"] },
  { id: "projekte", words: ["projekt", "renovierung", "saisonvorlage"] },
  { id: "wissen", words: ["wissen", "notiz", "wissenseintrag"] },
  { id: "buecher", words: ["buch", "buecher", "bucher"] },
  { id: "sparziel", words: ["sparziel", "sparen"] },
  { id: "finanzkonto", words: ["finanzkonto", "konto", "bankkonto"] },
];

export const getCapability = (capabilityId) => HOME_ASSISTANT_CAPABILITIES[capabilityId] || null;

export const getCapabilityLabel = (capabilityId) =>
  HOME_ASSISTANT_CAPABILITIES[capabilityId]?.label ||
  HOME_ASSISTANT_FLOW_CAPABILITIES[capabilityId]?.label ||
  capabilityId;

export const listHomeAssistantCapabilities = () => ({
  actions: Object.values(HOME_ASSISTANT_CAPABILITIES),
  flows: Object.values(HOME_ASSISTANT_FLOW_CAPABILITIES),
});

export const detectHomeAssistantFlow = (input) => {
  const normalized = stripDiacritics(input);
  return (
    Object.values(HOME_ASSISTANT_FLOW_CAPABILITIES).find((flow) =>
      (flow.keywords || []).some((keyword) => normalized.includes(stripDiacritics(keyword))),
    ) || null
  );
};

export const buildHomeAssistantFlowPayload = (flow, input = "") => ({
  type: "open_flow",
  route: flow?.route || "/home",
  flow_key: flow?.id || null,
  params: { query: String(input || "").trim() },
  ui_state: { ...(flow?.ui_state || {}), prefillQuery: String(input || "").trim() },
});

export const detectHomeAssistantCapability = (input, fallbackDomain = null) => {
  const normalized = stripDiacritics(input);
  const direct = CAPABILITY_KEYWORDS.find((entry) =>
    entry.words.some((word) => normalized.includes(stripDiacritics(word))),
  );
  if (direct) return HOME_ASSISTANT_CAPABILITIES[direct.id];

  if (fallbackDomain && HOME_ASSISTANT_CAPABILITIES[fallbackDomain]) {
    return HOME_ASSISTANT_CAPABILITIES[fallbackDomain];
  }
  if (fallbackDomain === "inventar") return HOME_ASSISTANT_CAPABILITIES.inventar_objekt;
  return null;
};

const categoryChoices = () =>
  getSelectableHomeBudgetCategoryNames({ categories: getDefaultHomeBudgetCategories() }).map((name) => ({
    value: name,
    label: name,
  }));

export const loadCapabilityChoices = async ({ capabilityId, slot, userId }) => {
  if (!userId) return [];

  if (slot === "kategorie" && ["rechnung", "budget", "budget_split"].includes(capabilityId)) {
    return categoryChoices();
  }

  if (slot === "geraet_id") {
    const { data, error } = await supabase
      .from("home_geraete")
      .select("id, name, hersteller, modell, kategorie")
      .eq("user_id", userId)
      .order("name");
    if (error) throw error;
    return makeChoices((data || []).map((item) => ({
      ...item,
      label: item.name,
      description: [item.hersteller, item.modell, item.kategorie].filter(Boolean).join(" - "),
    })));
  }

  if (["payer_member_name", "participants", "from_member_name", "to_member_name"].includes(slot)) {
    try {
      const { data } = await supabase.rpc("get_bewohner_overview");
      return makeChoices((data || []).map((item) => ({
        id: item.display_name || item.name,
        name: item.display_name || item.name,
        description: item.role || "",
      })));
    } catch {
      const { data, error } = await supabase
        .from("home_bewohner")
        .select("id, name, rolle")
        .eq("user_id", userId)
        .order("name");
      if (error) throw error;
      return makeChoices((data || []).map((item) => ({
        id: item.name,
        name: item.name,
        description: item.rolle || "",
      })));
    }
  }

  if (slot === "ort_id") {
    const { data, error } = await supabase
      .from("home_orte")
      .select("id, name")
      .eq("user_id", userId)
      .order("name");
    if (error) throw error;
    return makeChoices(data || []);
  }

  if (slot === "lagerort_id") {
    const { data, error } = await supabase
      .from("home_lagerorte")
      .select("id, name")
      .eq("user_id", userId)
      .order("name");
    if (error) throw error;
    return makeChoices(data || []);
  }

  return [];
};

const inferNameAfterVerb = (text) => {
  const raw = String(text || "").trim();
  const cleaned = raw
    .replace(/^(bitte\s+)?(fuege|f.ge|leg[e]?|erstelle|mach[e]?|add|create)\s+/i, "")
    .replace(/\s+(hinzu|an|ein|auf)$/i, "")
    .trim();
  return cleaned && cleaned.length < raw.length ? cleaned : raw;
};

const extractSlotFromText = ({ capabilityId, slot, text, choices = [] }) => {
  const raw = String(text || "").trim();
  const normalized = stripDiacritics(raw);

  if (!raw) return null;

  if (choices.length > 0) {
    const exact =
      choices.find((choice) => stripDiacritics(choice.value) === normalized) ||
      choices.find((choice) => stripDiacritics(choice.label) === normalized);
    if (exact) return exact.value;

    const fuzzy = choices.find((choice) => normalized.includes(stripDiacritics(choice.label)));
    if (fuzzy) return fuzzy.value;
  }

  if (slot.includes("datum") || slot === "date" || slot === "rechnungsdatum") return parseDate(raw);
  if (["brutto", "betrag", "amount", "kosten", "ziel_betrag", "bestand", "menge"].includes(slot)) return parseMoney(raw);
  if (["wartungsintervall_monate", "kuendigungsfrist_tage"].includes(slot)) return parseInteger(raw);
  if (slot === "participants") return splitList(raw);
  if (slot === "items" && capabilityId === "einkaufliste") return extractShoppingItemsFromText(raw);
  if (slot === "positionen") return normalizeInvoicePositions(raw);
  if (slot === "kategorie") return normalizeHomeBudgetCategory(raw, raw, { preserveUnknown: true });

  if (capabilityId === "rechnung") {
    if (slot === "lieferant_name") {
      const match = raw.match(/(?:von|bei|firma)\s+(.+?)(?:\s+(?:mit|artikel|positionen|produkte|posten|ueber|.ber|fuer|f.r|am)\b|$)/i);
      return match?.[1]?.trim() || raw;
    }
    if (slot === "beschreibung") {
      const match = raw.match(/(?:fuer|f.r|wegen|zweck)\s+(.+)/i);
      return match?.[1]?.trim() || raw;
    }
  }

  if (["name", "titel", "beschreibung", "typ", "inhalt"].includes(slot)) return inferNameAfterVerb(raw);
  return raw;
};

export const extractInitialSlots = ({ capabilityId, text, aiItems = [] }) => {
  const capability = getCapability(capabilityId);
  const source = isObject(aiItems?.[0]) ? { ...aiItems[0] } : {};
  const raw = String(text || "");
  const normalized = stripDiacritics(raw);
  const slots = { ...source };

  if (capabilityId === "rechnung") {
    slots.lieferant_name ||= raw.match(/(?:rechnung|beleg|kassenbon)?\s*(?:von|bei)\s+(.+?)(?:\s+(?:mit|artikel|positionen|produkte|posten|ueber|.ber|fuer|f.r|am|vom|\d)|$)/i)?.[1]?.trim();
    slots.brutto ||= parseMoney(raw.match(/(?:ueber|.ber|betrag|gesamt|brutto)\s+([0-9.,]+)/i)?.[1]) || parseMoney(raw);
    slots.beschreibung ||= raw.match(/(?:fuer|f.r|wegen|zweck)\s+(.+?)(?:\s+(?:kategorie|am|vom|\d)|$)/i)?.[1]?.trim();
    slots.rechnungsdatum ||= parseDate(raw);
    const extractedPositions = normalizeInvoicePositions(slots.positionen).length > 0
      ? normalizeInvoicePositions(slots.positionen)
      : extractInvoicePositionsFromText(raw);
    if (extractedPositions.length > 0) slots.positionen = extractedPositions;
    if (!slots.kategorie) {
      const category = categoryChoices().find((choice) => normalized.includes(stripDiacritics(choice.label)));
      if (category) slots.kategorie = category.value;
    }
    return slots;
  }

  if (capabilityId === "rezept_suche") {
    slots.query = raw
      .replace(/^(suche|such[e]?|finde|zeige)\s+(mir\s+)?/i, "")
      .replace(/\b(rezept|rezepte|im kochbuch|nach)\b/gi, "")
      .trim();
    if (!slots.query && raw.length > 1) slots.query = raw;
    return slots;
  }

  if (capabilityId === "einkaufliste") {
    const items = extractShoppingItemsFromText(raw);
    if (items.length > 0) {
      slots.items = items;
      slots.name ||= items[0].name;
    }
    return slots;
  }

  if (capabilityId === "medikamente") {
    if (isMedicationAdviceRequest(raw)) {
      slots.__guardrail_message = medicationAdviceRefusal;
    }
    if (!slots.aktion) {
      if (/beipackzettel|gebrauchsinformation|oeffnen|offnen/.test(normalized)) slots.aktion = "beipackzettel_oeffnen";
      else if (/wo|lagerort|liegt|finde/.test(normalized)) slots.aktion = "lagerort_abfragen";
      else if (/ablauf|abgelaufen|laeuft|lauft/.test(normalized)) slots.aktion = "ablaufende_anzeigen";
      else if (/niedrig|mindestbestand|aufgebraucht|leer/.test(normalized)) slots.aktion = "niedrige_anzeigen";
      else if (/(erhoehe|erhohe|reduzier|senke|aendere|andere|minus|plus|\+)/.test(normalized)) slots.aktion = "bestand_aendern";
      else if (/bestand|such|find|welche|was fuer|was fur|liste|aktuell|vorhanden/.test(normalized)) slots.aktion = "suchen";
      else slots.aktion = "hinzufuegen";
    }
    slots.name ||= extractMedicationNameFromText(raw, slots.aktion);
    slots.bestand ||= parseInteger(raw);
    const deltaMatch = raw.match(/(?:um|plus|\+|minus|-)\s*(\d+)/i);
    if (deltaMatch) slots.bestand_delta = Number(deltaMatch[1]) * (/\bminus|-|reduzier/i.test(raw) ? -1 : 1);
    return slots;
  }

  if (capabilityId === "wartungen") {
    slots.datum ||= parseDate(raw);
    slots.typ ||= raw.match(/(?:wartung|service|inspektion|filter gewechselt|entkalkt|gereinigt)/i)?.[0] || null;
  }

  if (capabilityId === "budget" || capabilityId === "budget_split") {
    slots.betrag ||= parseMoney(raw);
    slots.beschreibung ||= raw
      .replace(/^(fuege|f.ge|erstelle|neuer|neue|budget|ausgabe|zahlung)\s+/i, "")
      .replace(/\b(ueber|.ber|betrag|euro|eur)\b.*$/i, "")
      .trim();
  }

  if (!slots.name && capability?.requiredSlots?.includes("name")) {
    slots.name = inferNameAfterVerb(raw);
  }
  if (!slots.titel && capability?.requiredSlots?.includes("titel")) {
    slots.titel = inferNameAfterVerb(raw);
  }
  if (!slots.beschreibung && capability?.requiredSlots?.includes("beschreibung")) {
    slots.beschreibung = inferNameAfterVerb(raw);
  }

  return slots;
};

const slotIsFilled = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const validateSlot = ({ capabilityId, slot, value }) => {
  if (!slotIsFilled(value)) return null;
  if (slot.includes("datum") || slot === "date" || slot === "rechnungsdatum") return parseDate(value);
  if (["brutto", "betrag", "amount", "kosten", "ziel_betrag", "bestand", "bestand_delta"].includes(slot)) {
    const parsed = parseMoney(value);
    return parsed != null ? parsed : null;
  }
  if (slot === "items" && capabilityId === "einkaufliste") return extractShoppingItemsFromText(value);
  if (slot === "positionen") return normalizeInvoicePositions(value);
  if (slot === "kategorie" && ["rechnung", "budget", "budget_split"].includes(capabilityId)) {
    return normalizeHomeBudgetCategory(value, value, { preserveUnknown: true });
  }
  return value;
};

const getRequiredSlotsForWorkflow = (capability, slots = {}) => {
  if (capability?.id !== "medikamente") return capability?.requiredSlots || [];
  if (slots.__guardrail_message) return [];

  const action = slots.aktion || "suchen";
  if (["suchen", "ablaufende_anzeigen", "niedrige_anzeigen"].includes(action)) return ["aktion"];
  if (action === "bestand_aendern") return ["aktion", "name", "bestand_delta"];
  return ["aktion", "name"];
};

const extractMedicationNameFromText = (text, action) => {
  const raw = String(text || "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;

  const patterns = [
    /(?:beipackzettel|gebrauchsinformation|bestand|lagerort)\s+(?:von|fuer|für|zu)?\s*([^?!.]{2,})$/i,
    /(?:wo\s+(?:ist|liegt|finde\s+ich)|wo\s+liegt|wo\s+ist)\s+([^?!.]{2,})$/i,
    /(?:oeffne|offne|öffne|suche|finde|zeige)\s+(?:den\s+)?(?:beipackzettel\s+(?:von|zu)\s+)?([^?!.]{2,})$/i,
    /(?:erhoehe|erhöhe|reduziere|senke|aendere|ändere)\s+(?:den\s+)?bestand\s+(?:von\s+)?([^?!.]{2,}?)(?:\s+um\s+|\s+plus\s+|\s+minus\s+|$)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern)?.[1]?.trim();
    if (match && !/^(medikamente|tabletten|bestand|beipackzettel)$/i.test(match)) return match;
  }

  if (["lagerort_abfragen", "beipackzettel_oeffnen", "bestand_aendern"].includes(action)) {
    const cleaned = raw
      .replace(/\b(?:wo|ist|liegt|finde|ich|oeffne|offne|öffne|den|die|das|beipackzettel|gebrauchsinformation|bestand|von|fuer|für|zu|bitte|erhoehe|erhöhe|reduziere|senke|aendere|ändere|um|plus|minus|\d+)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.length >= 2 ? cleaned : null;
  }

  return null;
};

export const mergeWorkflowAnswer = ({ workflow, text, selectedValue = null }) => {
  const slot = workflow?.pendingSlot;
  if (!slot) return workflow;
  const choices = workflow?.choices || [];
  const rawValue = selectedValue ?? extractSlotFromText({
    capabilityId: workflow.capabilityId,
    slot,
    text,
    choices,
  });
  const value = validateSlot({
    capabilityId: workflow.capabilityId,
    slot,
    value: rawValue,
  });
  const nextSlots = {
    ...(workflow.slots || {}),
    ...(slotIsFilled(value) ? { [slot]: value } : {}),
  };

  if (workflow.capabilityId === "rechnung" && slot === "beschreibung") {
    const positions = extractInvoicePositionsFromText(text);
    if (positions.length > 0) {
      nextSlots.positionen = positions;
    }
  }

  return {
    ...workflow,
    slots: nextSlots,
    pendingSlot: null,
    choices: [],
  };
};

export const resolveNextWorkflowStep = async ({ workflow, userId }) => {
  const capability = getCapability(workflow.capabilityId);
  if (!capability) {
    return { ...workflow, status: "error", message: "Unbekannte Home-Funktion." };
  }

  const slots = { ...(workflow.slots || {}) };
  if (capability.id === "medikamente" && slots.__guardrail_message) {
    return { ...workflow, slots, status: "error", message: slots.__guardrail_message };
  }

  for (const slot of getRequiredSlotsForWorkflow(capability, slots)) {
    const normalized = validateSlot({
      capabilityId: capability.id,
      slot,
      value: slots[slot],
    });
    if (slotIsFilled(normalized)) {
      slots[slot] = normalized;
      continue;
    }

    const choices = await loadCapabilityChoices({
      capabilityId: capability.id,
      slot,
      userId,
    });

    return {
      ...workflow,
      slots,
      status: "question",
      pendingSlot: slot,
      question: capability.questions?.[slot] || `Bitte gib ${slot} an.`,
      choices,
    };
  }

  if (capability.actionKind === "search") {
    return {
      ...workflow,
      slots,
      status: "ready",
      preparedAction: {
        kind: "search",
        domain: capability.domain,
        capabilityId: capability.id,
        route: capability.route,
        items: [slots],
      },
      previewText: `${capability.label}: ${slots.query}`,
    };
  }

  if (capability.id === "einkaufliste") {
    const items = Array.isArray(slots.items) && slots.items.length > 0
      ? slots.items
      : [{ name: slots.name, original_text: slots.name, normalized_name: slots.name }];
    return {
      ...workflow,
      slots,
      status: "ready",
      preparedAction: {
        kind: "records",
        domain: capability.domain,
        capabilityId: capability.id,
        items,
      },
      previewText: `${capability.label} vorbereitet.`,
    };
  }

  return {
    ...workflow,
    slots,
    status: "ready",
    preparedAction: {
      kind: "records",
      domain: capability.domain,
      capabilityId: capability.id,
      items: [slots],
    },
    previewText: `${capability.label} vorbereitet.`,
  };
};

export const buildWorkflowPreviewItems = (workflow) => {
  const capability = getCapability(workflow?.capabilityId);
  const slots = workflow?.slots || {};
  if (!capability) return [];

  if (workflow.capabilityId === "rechnung") {
    return [{
      titel: `${slots.lieferant_name || "Rechnung"} - ${slots.brutto || 0} EUR`,
      beschreibung: slots.beschreibung,
      kategorie: slots.kategorie,
      datum: slots.rechnungsdatum,
      positionen: normalizeInvoicePositions(slots.positionen),
    }];
  }

  if (workflow.capabilityId === "wartungen") {
    const device = (workflow.deviceChoices || workflow.choices || []).find((choice) => choice.value === slots.geraet_id);
    return [{
      titel: `${device?.label || slots.geraet_name || "Geraet"}: ${slots.typ || "Wartung"}`,
      beschreibung: slots.beschreibung,
      datum: slots.datum,
      kosten: slots.kosten,
    }];
  }

  if (workflow.capabilityId === "rezept_suche") {
    return [{ titel: `Suche: ${slots.query}` }];
  }

  if (workflow.capabilityId === "einkaufliste") {
    return Array.isArray(slots.items) && slots.items.length > 0
      ? slots.items
      : [{ name: slots.name }];
  }

  return [{
    titel: slots.titel || slots.name || slots.beschreibung || capability.label,
    beschreibung: slots.beschreibung || slots.inhalt || null,
    kategorie: slots.kategorie || null,
    betrag: slots.betrag || slots.amount || null,
    datum: slots.datum || slots.date || null,
  }];
};

export const searchRecipesForAssistant = async ({ userId, query, limit = 8 }) => {
  const q = normalizeText(query);
  if (!userId || q.length < 2) return [];

  const { data: recipes, error: recipeError } = await supabase
    .from("home_rezepte")
    .select("id, titel, beschreibung, tags, quelle_plattform, gruppe, portionen, localized_content, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(150);
  if (recipeError) throw recipeError;

  const recipeIds = (recipes || []).map((recipe) => recipe.id);
  let ingredientsByRecipe = {};
  if (recipeIds.length > 0) {
    const { data: ingredients } = await supabase
      .from("home_rezept_zutaten")
      .select("rezept_id, name, original_text")
      .in("rezept_id", recipeIds)
      .limit(600);
    ingredientsByRecipe = (ingredients || []).reduce((acc, item) => {
      (acc[item.rezept_id] ||= []).push(item);
      return acc;
    }, {});
  }

  return (recipes || [])
    .map((recipe) => {
      const localizedText = Object.values(recipe.localized_content || {})
        .map((entry) => [entry?.title, entry?.description, ...(entry?.tags || [])].filter(Boolean).join(" "))
        .join(" ");
      const ingredientText = (ingredientsByRecipe[recipe.id] || [])
        .map((item) => `${item.name || ""} ${item.original_text || ""}`)
        .join(" ");
      const haystack = normalizeText([
        recipe.titel,
        recipe.beschreibung,
        ...(recipe.tags || []),
        localizedText,
        ingredientText,
      ].join(" "));
      const score = haystack.includes(q)
        ? (normalizeText(recipe.titel).includes(q) ? 3 : 1) + (ingredientText.toLocaleLowerCase("de-DE").includes(q) ? 1 : 0)
        : 0;
      return {
        ...recipe,
        score,
        ingredients: ingredientsByRecipe[recipe.id] || [],
      };
    })
    .filter((recipe) => recipe.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((recipe) => ({
      id: recipe.id,
      title: recipe.titel,
      description: recipe.beschreibung || recipe.gruppe || recipe.quelle_plattform || "",
      route: `/home/kochbuch/${recipe.id}`,
      ingredients: recipe.ingredients.slice(0, 5).map((item) => item.name).filter(Boolean),
    }));
};
