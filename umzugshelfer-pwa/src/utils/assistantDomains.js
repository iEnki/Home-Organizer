import { buildShoppingAiExtractionPrompt } from "./einkaufslisteUtils";

export const ASSISTANT_DOMAIN_CONFIG = {
  inventar: {
    title: "Objekte erfassen",
    summaryLabel: "Objekte",
    fields: "name, kategorie, ort (optional), menge (optional, default 1)",
    schema:
      '{"name":"Bohrmaschine","kategorie":"Werkzeug","ort":"Keller","menge":1}',
  },
  vorraete: {
    title: "Vorrate erfassen",
    summaryLabel: "Vorrate",
    fields:
      "name, bestand (Zahl), einheit (optional), kategorie (optional), mindestmenge (optional)",
    schema:
      '{"name":"Milch","bestand":2,"einheit":"Liter","kategorie":"Kuehlwaren","mindestmenge":1}',
  },
  medikamente: {
    title: "Heimapotheke bearbeiten",
    summaryLabel: "Medikamente",
    fields:
      "aktion (hinzufuegen|bestand_aendern|suchen|lagerort_abfragen|beipackzettel_oeffnen|ablaufende_anzeigen), name, wirkstoff, darreichungsform, packungsgroesse, bestand, bestand_delta, mindestbestand, ablaufdatum, lagerort, kategorie, notizen",
    schema:
      '{"aktion":"hinzufuegen","name":"Ibuprofen","wirkstoff":"Ibuprofen","bestand":1,"lagerort":"Bad","kategorie":"Schmerzmittel"}',
    buildPrompt: (text) => `Extrahiere Heimapotheke-Aktionen aus dem Text als JSON-Objekt {"items":[...]}.
Erlaubte Aktionen: "hinzufuegen", "bestand_aendern", "suchen", "lagerort_abfragen", "beipackzettel_oeffnen", "ablaufende_anzeigen".
Felder: aktion, name, wirkstoff, darreichungsform, packungsgroesse, bestand, bestand_delta, mindestbestand, ablaufdatum (YYYY-MM-DD), lagerort, kategorie, notizen.
WICHTIG: Keine medizinische Beratung, Diagnose, Wechselwirkungs- oder Dosierungsempfehlung geben. Wenn danach gefragt wird, nur Organisationsdaten extrahieren.
Beispiel: {"items":[{"aktion":"hinzufuegen","name":"Ibuprofen","bestand":1,"lagerort":"Bad","kategorie":"Schmerzmittel"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  einkaufliste: {
    title: "Einkaufsliste vorbereiten",
    summaryLabel: "Einkaufsartikel",
    fields:
      "original_text, name, normalized_name, menge, einheit, hauptkategorie, unterkategorie, confidence",
    schema:
      '{"original_text":"2 Liter Milch","name":"Milch","normalized_name":"milch","menge":2,"einheit":"Liter","hauptkategorie":"Lebensmittel","unterkategorie":"Milchprodukte","confidence":0.96}',
    buildPrompt: (text) => buildShoppingAiExtractionPrompt(text),
  },
  geraete: {
    title: "Gerate erfassen",
    summaryLabel: "Gerate",
    fields:
      "name, hersteller (optional), modell (optional), seriennummer (optional), kaufdatum (optional, YYYY-MM-DD), kaufpreis (optional), garantie_bis (optional, YYYY-MM-DD), wartungsintervall_monate (optional), kategorie (optional), notizen (optional)",
    schema:
      '{"name":"Waschmaschine","hersteller":"Bosch","modell":"Serie 6","kaufdatum":"2023-03-15","garantie_bis":"2026-03-15","wartungsintervall_monate":12,"kategorie":"Haushalt"}',
    buildPrompt: (text) => `Extrahiere Geraete/Haushaltsgeraete aus dem Text als JSON-Objekt {"items":[...]}.
Felder: name (Pflicht), hersteller, modell, seriennummer, kaufdatum (YYYY-MM-DD), kaufpreis (Zahl), garantie_bis (YYYY-MM-DD), wartungsintervall_monate (Zahl), kategorie, notizen.
Beispiel: {"items":[{"name":"Waschmaschine","hersteller":"Bosch","modell":"Serie 6","kaufdatum":"2023-03-15","garantie_bis":"2026-03-15","wartungsintervall_monate":12,"kategorie":"Haushalt"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  aufgaben: {
    title: "Home-Aufgaben anlegen",
    summaryLabel: "Aufgaben",
    fields:
      "beschreibung, kategorie (optional), prioritaet (Hoch/Mittel/Niedrig), faelligkeitsdatum (optional), wiederholung_typ (optional)",
    schema:
      '{"beschreibung":"Keller aufraumen","kategorie":"Organisation","prioritaet":"Mittel","faelligkeitsdatum":"2026-04-30","wiederholung_typ":"Monatlich"}',
  },
  budget: {
    title: "Budget-Eintrage anlegen",
    summaryLabel: "Budget-Eintrage",
    fields:
      "beschreibung, betrag, kategorie (optional), typ (ausgabe|einnahme, optional), datum (optional), wiederholen (true|false), intervall (optional), zahlungskonto_name (optional), zahlungskonto_typ (optional), budget_scope (optional, default 'haushalt'), bewohner_name (optional)",
    schema:
      '{"beschreibung":"Netflix","betrag":12.99,"kategorie":"Abonnement","typ":"ausgabe","wiederholen":true,"intervall":"Monatlich","zahlungskonto_name":"Haushaltskonto","budget_scope":"haushalt"}',
    buildPrompt: (text) => `Extrahiere Budget-Eintraege aus dem Text als JSON-Objekt {"items":[...]}.
Felder: beschreibung (Pflicht), betrag (Zahl, Pflicht), typ ("ausgabe" oder "einnahme", default "ausgabe"), kategorie, datum (YYYY-MM-DD), budget_scope ("haushalt" oder "privat", DEFAULT IMMER "haushalt" ausser explizit als privat/persoenlich erwaehnt), bewohner_name (Name der Person falls privat), wiederholen (true/false), intervall ("Monatlich","Woechentlich","Jaehrlich" etc.), zahlungskonto_name.
Beispiel: {"items":[{"beschreibung":"Strom","betrag":85,"typ":"ausgabe","kategorie":"Energie","budget_scope":"haushalt"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  rechnung: {
    title: "Rechnung erfassen",
    summaryLabel: "Rechnungen",
    fields:
      "lieferant_name, brutto, beschreibung, kategorie, rechnungsdatum (YYYY-MM-DD), waehrung (optional, default EUR)",
    schema:
      '{"lieferant_name":"Baumarkt","brutto":42.90,"beschreibung":"Schrauben und Farbe","kategorie":"Reparaturen","rechnungsdatum":"2026-05-07","waehrung":"EUR"}',
    buildPrompt: (text) => `Extrahiere manuelle Rechnungen aus dem Text als JSON-Objekt {"items":[...]}.
Felder: lieferant_name (Firma/Lieferant), brutto (Betrag als Zahl), beschreibung (wofuer), kategorie, rechnungsdatum (YYYY-MM-DD), waehrung (default "EUR").
Wenn Informationen fehlen, lasse Felder leer/null. Erfinde keine Pflichtwerte.
Beispiel: {"items":[{"lieferant_name":"Baumarkt","brutto":42.90,"beschreibung":"Schrauben und Farbe","kategorie":"Reparaturen","rechnungsdatum":"2026-05-07","waehrung":"EUR"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  projekte: {
    title: "Projekte anlegen",
    summaryLabel: "Projekte",
    fields:
      "name, typ, beschreibung (optional), budget (optional), startdatum (optional), zieldatum (optional)",
    schema:
      '{"name":"Badezimmer renovieren","typ":"Renovierung","beschreibung":"Fliesen und Armatur erneuern","budget":2000,"zieldatum":"2026-10-01"}',
  },
  todos: {
    title: "Umzugs-Todos anlegen",
    summaryLabel: "To-Dos",
    fields:
      "beschreibung, kategorie (optional), prioritaet (optional), faelligkeitsdatum (optional)",
    schema:
      '{"beschreibung":"Zahnarzt anrufen","kategorie":"Gesundheit","prioritaet":"Hoch","faelligkeitsdatum":"2026-03-20"}',
  },
  packliste: {
    title: "Packliste bearbeiten",
    summaryLabel: "Packlisten-Aktionen",
    fields:
      'aktion ("gegenstand_hinzufügen" oder "raum_zuweisen"), gegenstand, menge, kiste, kategorie (optional), kiste_name (für raum_zuweisen), raum (für raum_zuweisen)',
    schema:
      '{"aktion":"gegenstand_hinzufuegen","gegenstand":"Buecher","menge":3,"kiste":"Kiste 3","kategorie":"Buero"}',
    buildPrompt: (text) => `Extrahiere aus dem folgenden Text alle Packlisten-Aktionen und antworte nur mit einem JSON-Array.
Es gibt zwei Aktionsarten:
1. {"aktion":"gegenstand_hinzufuegen","gegenstand":"Name","menge":1,"kiste":"Kiste","kategorie":"optional"}
2. {"aktion":"raum_zuweisen","kiste_name":"Kiste","raum":"Zielraum"}
Wenn keine Menge genannt wird, verwende 1. Wenn mehrere Gegenstande ohne neue Kiste genannt werden, verwende die zuletzt genannte Kiste.
Text: "${text}"`,
  },
  wartungen: {
    title: "Wartung erfassen",
    summaryLabel: "Wartungen",
    fields:
      "geraet_name (Gerätename, Pflicht), typ (Art der Wartung, optional), datum (optional, YYYY-MM-DD), beschreibung (optional), kosten (optional, Zahl), durchgefuehrt_von (optional), naechste_faelligkeit (optional, YYYY-MM-DD), notizen (optional)",
    schema:
      '{"geraet_name":"Waschmaschine","typ":"Filter gewechselt","datum":"2026-04-19","kosten":0}',
    buildPrompt: (text) => `Extrahiere Wartungseintraege aus dem Text als JSON-Objekt {"items":[...]}.
Felder: geraet_name (Gerätename, Pflicht), typ (Art der Wartung z.B. "Ölwechsel", "Filter gewechselt"), datum (YYYY-MM-DD, default heute), beschreibung, kosten (Zahl), durchgefuehrt_von, naechste_faelligkeit (YYYY-MM-DD), notizen.
Beispiel: {"items":[{"geraet_name":"Waschmaschine","typ":"Filter gewechselt","datum":"2026-04-19","kosten":0}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  budget_settlement: {
    title: "Budget-Ausgleich anlegen",
    summaryLabel: "Ausgleiche",
    fields:
      "from_member_name (wer zahlt), to_member_name (wer bekommt), amount, date (optional), note (optional)",
    schema:
      '{"from_member_name":"Alex","to_member_name":"Sam","amount":24.50,"date":"2026-04-18","note":"Split ausgeglichen"}',
    buildPrompt: (text) => `Extrahiere Ausgleichszahlungen aus dem Text als JSON-Objekt {"items":[...]}.
PFLICHTFELDER: from_member_name (wer zahlt, EXAKT aus Mitgliederliste), to_member_name (wer bekommt, EXAKT aus Liste), amount (Betrag als Zahl).
OPTIONALE FELDER: date (YYYY-MM-DD), note.
Beispiel: {"items":[{"from_member_name":"Alex","to_member_name":"Sam","amount":24.50,"note":"Abendessen ausgeglichen"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  buecher: {
    title: "Buch erfassen",
    summaryLabel: "Buecher",
    fields:
      "titel (Pflicht), autor (optional), isbn_13 (optional), status (im_regal|verliehen|vermisst|verschenkt|entsorgt, optional, default 'im_regal'), tags (optional Array), notizen (optional)",
    schema: '{"titel":"Harry Potter","autor":"J.K. Rowling","status":"im_regal"}',
    buildPrompt: (text) => `Extrahiere Buecher aus dem Text als JSON-Objekt {"items":[...]}.
Felder: titel (Pflicht), autor (optional), isbn_13 (optional), status (erlaubt: "im_regal", "verliehen", "vermisst", "verschenkt", "entsorgt"; default "im_regal"), tags (Array, optional), notizen (optional).
WICHTIG: "gelesen", "ungelesen" oder "am_lesen" sind KEINE gueltigen Statuswerte. Verwende immer "im_regal" als Standard.
Beispiel: {"items":[{"titel":"Harry Potter und der Stein der Weisen","autor":"J.K. Rowling","status":"im_regal"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  kfz_tank: {
    title: "Tankvorgang erfassen",
    summaryLabel: "Tankvorgaenge",
    fields:
      "fahrzeug_name (optional wenn nur 1 Fahrzeug), datum (optional, YYYY-MM-DD), betrag (Zahl, Pflicht), liter (optional), preis_pro_liter (optional), kilometerstand (optional), tankstelle (optional), tankstatus (voll|teilweise|unbekannt, optional)",
    schema:
      '{"fahrzeug_name":"Golf","datum":"2026-07-01","betrag":65.40,"liter":42.5,"kilometerstand":82500,"tankstelle":"OMV","tankstatus":"voll"}',
    buildPrompt: (text) => `Extrahiere Tankvorgaenge aus dem Text als JSON-Objekt {"items":[...]}.
Felder: fahrzeug_name, datum (YYYY-MM-DD, default heute), betrag (Zahl, Pflicht), liter, preis_pro_liter, kilometerstand, tankstelle, tankstatus ("voll", "teilweise" oder "unbekannt").
Beispiel: {"items":[{"fahrzeug_name":"Golf","betrag":65.40,"liter":42.5,"tankstatus":"voll"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  kfz_kilometerstand: {
    title: "Kilometerstand erfassen",
    summaryLabel: "Kilometerstaende",
    fields:
      "fahrzeug_name (optional wenn nur 1 Fahrzeug), kilometerstand (Zahl, Pflicht), datum (optional, YYYY-MM-DD)",
    schema: '{"fahrzeug_name":"Golf","kilometerstand":82500,"datum":"2026-07-02"}',
  },
  kfz_service: {
    title: "Fahrzeug-Service erfassen",
    summaryLabel: "Services",
    fields:
      "fahrzeug_name (optional wenn nur 1 Fahrzeug), typ (z.B. Oelwechsel, Pickerl, Service), datum (optional, YYYY-MM-DD), kilometerstand (optional), kosten (optional), werkstatt (optional), beschreibung (optional), naechste_faelligkeit_datum (optional)",
    schema:
      '{"fahrzeug_name":"Golf","typ":"Oelwechsel","datum":"2026-06-15","kilometerstand":82000,"kosten":120,"werkstatt":"Autohaus Mayer"}',
  },
  erinnerung: {
    title: "Erinnerung anlegen",
    summaryLabel: "Erinnerungen",
    fields:
      "beschreibung (Pflicht), erinnerungs_datum (YYYY-MM-DD oder ISO-Zeitstempel, Pflicht), faelligkeitsdatum (optional), kategorie (optional)",
    schema:
      '{"beschreibung":"Auto tanken","erinnerungs_datum":"2026-07-03","kategorie":"Erinnerung"}',
    buildPrompt: (text) => `Extrahiere Erinnerungen aus dem Text als JSON-Objekt {"items":[...]}.
Felder: beschreibung (Pflicht), erinnerungs_datum (YYYY-MM-DD, Pflicht — rechne relative Angaben wie "morgen" in ein konkretes Datum um), faelligkeitsdatum (optional), kategorie (optional).
Beispiel: {"items":[{"beschreibung":"Auto tanken","erinnerungs_datum":"2026-07-03"}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
  rezept_update: {
    title: "Rezept aendern",
    summaryLabel: "Rezept-Aenderungen",
    fields:
      "titel (Rezeptname zur Suche, Pflicht wenn keine rezept_id), rezept_id (optional), mode (favorit|patch), favorit (true|false bei mode favorit), patch (Objekt mit Feldern gruppe/titel/notizen/portionen bei mode patch)",
    schema: '{"titel":"Lasagne","mode":"favorit","favorit":true}',
  },
  budget_split: {
    title: "Budget mit Kostenaufteilung anlegen",
    summaryLabel: "Budget-Splits",
    fields:
      "beschreibung, betrag, kategorie (optional), datum (optional), budget_scope (optional), zahlungskonto_name (optional), payer_member_name, split_mode (equal|fixed|percent), participants (Array von Namen), shares (Array mit member_name + amount oder percent)",
    schema:
      '{"beschreibung":"Restaurant","betrag":64.50,"kategorie":"Freizeit","payer_member_name":"Alex","split_mode":"equal","participants":["Alex","Sam","Pat"],"shares":[]}',
    buildPrompt: (text) => `Extrahiere Kostenaufteilungen aus dem Text als JSON-Objekt {"items":[...]}.
PFLICHTFELDER:
- beschreibung: Bezeichnung der Ausgabe
- betrag: Betrag als Zahl
- payer_member_name: Name der Person die bezahlt hat (EXAKT aus der Liste oben)
- split_mode: "equal" (gleich aufteilen), "fixed" (feste Betraege) oder "percent"
- participants: Array ALLER beteiligten Namen inkl. Zahler (EXAKT aus der Liste oben)
OPTIONALE FELDER: kategorie, datum (YYYY-MM-DD), budget_scope ("haushalt" default), shares (nur fuer "fixed"/"percent")
WICHTIG: Verwende fuer payer_member_name und participants NUR Namen aus der Mitgliederliste oben.
Bei "equal" kein shares-Array nötig. Bei "fixed": shares mit member_name+amount für Schuldner. Bei "percent": shares mit member_name+percent für ALLE inkl. Zahler, Summe muss 100 ergeben.
Beispiel gleichmaessig: {"items":[{"beschreibung":"Abendessen","betrag":60,"payer_member_name":"Alex","split_mode":"equal","participants":["Alex","Sam"]}]}
Beispiel fest: {"items":[{"beschreibung":"Einkauf","betrag":45,"payer_member_name":"Sam","split_mode":"fixed","participants":["Alex","Sam"],"shares":[{"member_name":"Alex","amount":20},{"member_name":"Sam","amount":25}]}]}
Text: "${text}"
Antworte NUR mit dem JSON-Objekt.`,
  },
};

export const ASSISTANT_ROUTE_MAP = {
  rechnung_scannen: "/home/rechnung-scannen",
  dokumente_wissen: "/home/dokumente",
  dokument_upload: "/home/dokumente",
  rezept_import: "/home/kochbuch",
  buchscanner: "/home/inventar?tab=buecher",
  home_suche: "/home/suche",
  home_budget: "/home/budget",
  home_einkaufliste: "/home/einkaufliste",
  home_aufgaben: "/home/aufgaben",
  home_inventar: "/home/inventar",
  home_vorraete: "/home/vorraete",
  home_heimapotheke: "/home/heimapotheke",
  home_geraete: "/home/geraete",
  home_projekte: "/home/projekte",
  home_kfz: "/home/kfz",
  home_kochbuch: "/home/kochbuch",
  home_wissen: "/home/wissen",
  home_verlauf: "/home/verlauf",
  kalender: "/kalender",
  umzug_todos: "/todos",
  umzug_packliste: "/packliste",
};

export const buildDomainExtractionPrompt = (domain, text) => {
  const config = ASSISTANT_DOMAIN_CONFIG[domain];
  if (!config) {
    throw new Error(`Unbekannte Assistenz-Domaene: ${domain}`);
  }
  if (typeof config.buildPrompt === "function") {
    return config.buildPrompt(text);
  }
  return `Extrahiere alle Eintraege aus dem folgenden Text als JSON-Array.
Felder: ${config.fields}
Format-Beispiel: [${config.schema}]
Text: "${text}"
Antworte ausschliesslich mit einem gueltigen JSON-Array.`;
};

export const parseAssistantJson = (raw, expectedType = "array") => {
  let source = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  const blockMatch = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (blockMatch) {
    source = blockMatch[1];
  }

  if (expectedType === "array") {
    const start = source.indexOf("[");
    const end = source.lastIndexOf("]");
    if (start !== -1 && end !== -1 && start < end) {
      return JSON.parse(source.slice(start, end + 1));
    }
  } else {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start !== -1 && end !== -1 && start < end) {
      return JSON.parse(source.slice(start, end + 1));
    }
  }

  throw new Error("Kein gueltiges JSON in der KI-Antwort gefunden.");
};

export const getAssistantDomainLabel = (domain, t) =>
  t(`assistant:domains.${domain}`, { defaultValue: domain || "Assistent" });

export const summarizeAssistantItems = (domain, items = [], t) => {
  if (!t) {
    const config = ASSISTANT_DOMAIN_CONFIG[domain];
    if (!config) return `${items.length} Eintraege`;
    if (items.length === 1) return `1 ${config.summaryLabel.slice(0, -1) || config.summaryLabel}`;
    return `${items.length} ${config.summaryLabel}`;
  }
  const count = items.length;
  const label = t(`assistant:summaryLabels.${domain}`, { count, defaultValue: domain });
  return `${count} ${label}`;
};
