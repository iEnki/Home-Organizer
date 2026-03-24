/**
 * rechnungAnalyse.js
 * Analyse-Orchestrator fuer die KI-gestuetzte Rechnungserkennung.
 *
 * Architektur (3 Ebenen):
 *   1. Analyse-Engine (KI/OCR) → strukturierter Text / JSON
 *   2. Regel-Ebene (App-Logik) → Modul-Zuordnung via Obergruppe-System
 *   3. User-Kontrolle (Review, PFLICHT) → finale Bestaetigung
 *
 * Unterstuetzte Modi:
 *   - chatgpt_vision  : Bildanalyse via GPT-4o Vision (ki-vision Edge Function)
 *   - ocr_regeln      : Tesseract.js OCR + regelbasierte Auswertung
 *   - ocr_ollama      : Bildanalyse via Ollama Vision (ki-vision Edge Function)
 *
 * PDF-Handling (alle Modi):
 *   PDF mit extrahierbarem Text → analyzeTextWithKiChat (KI-Assistent-Konfiguration)
 *   Bild-PDF (kein Text) → Fehlermeldung mit Hinweis Foto hochladen
 */

import { cleanKiJsonResponse } from "./kiClient";

// ============================================================
// Konstanten: Klassifizierungs-System
// ============================================================

/**
 * Obergruppe → Modul-Mapping.
 * Reihenfolge bestimmt Prioritaet wenn mehrere Gruppen matchen.
 */
const OBERGRUPPE_TO_MODUL = {
  // Vorraete (Verbrauchsgueter)
  lebensmittel: "vorraete",
  getraenke: "vorraete",
  koerperpflege: "vorraete",
  hygieneartikel: "vorraete",
  haushaltsreiniger: "vorraete",
  waschmittel: "vorraete",
  geschirrspuelmittel: "vorraete",
  papierprodukte: "vorraete",
  tiernahrung: "vorraete",
  babybedarf: "vorraete",
  // Inventar (langlebige Gegenstaende ohne Wartungsbedarf)
  moebel: "inventar",
  dekoration: "inventar",
  beleuchtung: "inventar",
  aufbewahrung: "inventar",
  textilien: "inventar",
  geschirr_besteck: "inventar",
  kochutensilien: "inventar",
  wohnaccessoires: "inventar",
  heimtextilien: "inventar",
  spielzeug: "inventar",
  sport_freizeit: "inventar",
  werkzeug_klein: "inventar",
  gartengeraet_manuell: "inventar",
  // Geraete (wartungsrelevant / elektrisch)
  grossgeraet_kueche: "geraete",
  grossgeraet_wasche: "geraete",
  unterhaltungselektronik: "geraete",
  computer_technik: "geraete",
  haushaltsgeraet_elektrisch: "geraete",
  reinigungsgeraet_elektrisch: "geraete",
  therme_heizung: "geraete",
  smart_home_geraet: "geraete",
  drucker_scanner: "geraete",
  gartengeraet_elektrisch: "geraete",
  klimageraet: "geraete",
  audio_hifi: "geraete",
};

/**
 * Erweiterte Keyword-Listen pro Obergruppe.
 */
const OBERGRUPPEN_KEYWORDS = {
  lebensmittel: [
    "milch", "brot", "butter", "kaese", "joghurt", "nudeln", "reis", "kaffee",
    "tee", "zucker", "mehl", "oel", "essig", "salz", "pfeffer", "wurst",
    "fleisch", "fisch", "ei", "eier", "gemuese", "obst", "apfel", "banane",
    "tomate", "kartoffel", "zwiebel", "knoblauch", "sahne", "quark",
  ],
  getraenke: [
    "wasser", "saft", "cola", "limonade", "bier", "wein", "mineralwasser",
    "orangensaft", "apfelsaft", "energy drink", "smoothie",
  ],
  koerperpflege: [
    "shampoo", "duschgel", "deo", "deodorant", "zahnpasta", "seife", "creme",
    "lotion", "hautcreme", "bodylotion", "gesichtscreme", "parfum", "rasierer",
    "rasiercreme", "mundwasser", "conditioner", "haargel",
  ],
  hygieneartikel: [
    "toilettenpapier", "klopapier", "taschentuecher", "feuchttuecher",
    "damenbinden", "tampons", "windeln", "wattestabchen", "watte",
  ],
  haushaltsreiniger: [
    "reiniger", "reinigungsmittel", "spruehflasche", "badreiniger",
    "kuechenreiniger", "wc reiniger", "allzweckreiniger", "desinfektionsmittel",
    "entkalker", "rohrreiniger", "glasreiniger",
  ],
  waschmittel: [
    "waschmittel", "weichspueler", "colorwaschmittel", "waschpulver",
    "persil", "ariel", "lenor", "perwoll", "rei",
  ],
  geschirrspuelmittel: [
    "spuelmittel", "klarspueler", "powerball", "finish", "tabs", "spueltabs",
    "geschirrspueltabs", "salz",
  ],
  papierprodukte: [
    "kuechenrolle", "kuchenpapier", "servietten", "alufolie", "frischhaltefolie",
    "backpapier", "gefrierbeutel", "muelltueten",
  ],
  moebel: [
    "stuhl", "tisch", "sofa", "couch", "regal", "schrank", "bett", "kommode",
    "billy", "kallax", "ikea", "kueche", "badmoebel", "kleiderschrank",
    "bettgestell", "matratze", "nachttisch", "schreibtisch",
  ],
  dekoration: [
    "bild", "rahmen", "kerze", "vase", "deko", "dekoration", "poster",
    "wandbild", "kunstdruck", "ornament",
  ],
  beleuchtung: [
    "lampe", "leuchte", "gluehbirne", "led", "stehlampe", "deckenlampe",
    "tischlampe", "lichterkette", "spot", "leuchtmittel",
  ],
  aufbewahrung: [
    "koffer", "tasche", "box", "kiste", "korb", "organizer", "aufbewahrung",
    "regalbox", "schuhregal", "kleiderhaken",
  ],
  textilien: [
    "handtuch", "bettlaken", "bettbezug", "kopfkissenbezug", "badetuch",
    "kissen", "decke", "vorhang", "gardine",
  ],
  geschirr_besteck: [
    "teller", "tasse", "becher", "besteck", "gabel", "messer", "loeffel",
    "glas", "schuessel", "pfanne", "topf", "schneidebrett",
  ],
  kochutensilien: [
    "kochloeffel", "pfannenwender", "sieb", "reibe", "messbecher",
    "kuchenform", "backblech", "dosenoffner", "flaschenoffner", "korkenzieher",
  ],
  wohnaccessoires: [
    "spiegel", "uhr", "wanduhr", "teppich", "fussabtreter", "schluesselboard",
    "briefkasten", "briefkorb",
  ],
  moebel_kueche: ["kuechenzeile", "kuehlschrank einbau", "spuele", "arbeitsplatte"],
  grossgeraet_kueche: [
    "kuehlschrank", "gefrierschrank", "gefriertruhe", "geschirrspueler",
    "spuelmaschine", "mikrowelle", "backofen", "herd", "ceranfeld", "induktion",
    "kaffeemaschine", "kaffeevollautomat", "wasserkocher", "toaster",
    "thermomix", "kuchenmaschine",
  ],
  grossgeraet_wasche: [
    "waschmaschine", "trockner", "waschtrockner", "waeschetrockner",
  ],
  unterhaltungselektronik: [
    "fernseher", "tv", "bildschirm", "soundbar", "lautsprecher", "konsole",
    "playstation", "xbox", "nintendo", "switch", "projektor", "beamer",
    "blu-ray", "dvd player",
  ],
  computer_technik: [
    "laptop", "notebook", "pc", "computer", "monitor", "router", "tablet",
    "ipad", "smartphone", "handy", "keyboard", "tastatur", "maus", "webcam",
    "festplatte", "usb", "drucker",
  ],
  haushaltsgeraet_elektrisch: [
    "buegeleisen", "buegelbrett", "mixer", "standmixer", "handmixer",
    "fritteuse", "waffeleisen", "sandwichmaker", "grillgeraet",
  ],
  reinigungsgeraet_elektrisch: [
    "staubsauger", "akkusauger", "saugroboter", "dampfreiniger", "fensterreiniger",
    "boden wischer", "wischmopp elektrisch",
  ],
  therme_heizung: [
    "therme", "heizung", "boiler", "warmwasserboiler", "elektroheizung",
    "heizluefter", "klimageraet", "klimaanlage",
  ],
  smart_home_geraet: [
    "smart home", "alexa", "echo", "google home", "philips hue", "heizkörper",
    "thermostat", "smart plug", "smarte steckdose", "tuersensor",
  ],
  drucker_scanner: ["drucker", "scanner", "multifunktionsdrucker", "tintenstrahldrucker"],
  audio_hifi: [
    "hifi", "verstaerker", "receiver", "plattenspieler", "kopfhorer",
    "bluetooth lautsprecher", "heimkino",
  ],
  werkzeug_klein: [
    "hammer", "schraubenzieher", "bohrmaschine", "akkuschrauber", "saege",
    "zange", "schrauben", "duebel", "nagel",
  ],
  gartengeraet_elektrisch: [
    "rasenmaeher", "laubblaeer", "heckenschere elektrisch", "motorsaege",
    "rasenmaehroboter",
  ],
  klimageraet: ["klimageraet", "klimaanlage", "lueftungsgeraet", "lueftung"],
};

/**
 * Haendler → bevorzugte Obergruppen-Hinweise.
 * Erhoeht Confidence fuer passende Obergruppen um 0.10.
 */
const HAENDLER_HINTS = {
  mediamarkt: ["unterhaltungselektronik", "computer_technik", "haushaltsgeraet_elektrisch", "grossgeraet_kueche"],
  saturn: ["unterhaltungselektronik", "computer_technik", "haushaltsgeraet_elektrisch"],
  ikea: ["moebel", "aufbewahrung", "beleuchtung", "wohnaccessoires", "textilien"],
  billa: ["lebensmittel", "getraenke", "haushaltsreiniger", "koerperpflege"],
  spar: ["lebensmittel", "getraenke"],
  hofer: ["lebensmittel", "getraenke", "haushaltsgeraet_elektrisch"],
  aldi: ["lebensmittel", "getraenke", "haushaltsgeraet_elektrisch"],
  lidl: ["lebensmittel", "getraenke"],
  rewe: ["lebensmittel", "getraenke", "koerperpflege"],
  edeka: ["lebensmittel", "getraenke"],
  penny: ["lebensmittel", "getraenke"],
  dm: ["koerperpflege", "hygieneartikel", "haushaltsreiniger", "babybedarf"],
  bipa: ["koerperpflege", "hygieneartikel"],
  rossmann: ["koerperpflege", "hygieneartikel", "haushaltsreiniger"],
  mueller: ["koerperpflege", "hygieneartikel", "dekoration"],
  obi: ["werkzeug_klein", "beleuchtung", "smart_home_geraet"],
  hornbach: ["werkzeug_klein", "gartengeraet_elektrisch", "beleuchtung"],
  bauhaus: ["werkzeug_klein", "gartengeraet_elektrisch"],
  amazon: [],
  zalando: ["textilien"],
};

const FUEL_POSITION_KEYWORDS = [
  "diesel",
  "benzin",
  "kraftstoff",
  "treibstoff",
  "super",
  "super e5",
  "super e10",
  "eurosuper",
  "adblue",
  "autogas",
  "lpg",
  "cng",
];

const FUEL_MERCHANT_KEYWORDS = [
  "shell",
  "omv",
  "bp",
  "aral",
  "eni",
  "esso",
  "jet",
  "avanti",
  "agip",
  "turmoil",
  "tankstelle",
  "tankautomat",
  "tank",
];

// ============================================================
// KI-Prompts fuer Vision- und Text-Analyse
// ============================================================

const RECHNUNG_JSON_SCHEMA = `{
  "haendler": "Name des Haendlers oder null",
  "datum": "YYYY-MM-DD oder null",
  "gesamt": 49.99,
  "positionen": [
    {
      "name": "Produktname wie auf Rechnung",
      "menge": 1,
      "einheit": "Stueck",
      "einzelpreis": 9.99,
      "gesamtpreis": 9.99,
      "obergruppe": "lebensmittel | getraenke | reinigung | drogerie | elektronik | moebel | kleidung | baumarkt | keine_zuordnung",
      "confidence": 0.91
    }
  ]
}`;

const RECHNUNG_REGELN = `Wichtige Regeln:
- einzelpreis = Preis pro Einheit (NICHT der Zeilengesamtpreis)
  Kraftstoff-Beispiel: menge=33.43, einheit="Liter", einzelpreis=1.439, gesamtpreis=48.11
  Stueckware-Beispiel: menge=2, einheit="Stueck", einzelpreis=4.99, gesamtpreis=9.98
- einheit: "Liter", "Stueck", "kg", "Pack", "Flasche", "m" etc.
- gesamtpreis = einzelpreis x menge
- Dezimalpunkte fuer Zahlen (kein Komma). Unbekannte Felder auf null.`;

// Fuer Bildanalyse (chatgpt_vision, ocr_ollama)
// WICHTIG: Muss identisch mit KI_RECHNUNG_PROMPT_SERVER in ki-vision/index.ts gehalten werden!
const KI_RECHNUNG_PROMPT_VISION = `Du bist ein Rechnungs-Analyse-Assistent. Analysiere das Bild dieser Rechnung und gib ausschliesslich ein JSON-Objekt zurueck (kein Markdown, keine Erklaerungen):\n\n${RECHNUNG_JSON_SCHEMA}\n\n${RECHNUNG_REGELN}`;

// Fuer PDF-Textanalyse via ki-chat
const KI_RECHNUNG_PROMPT_TEXT = `Du bist ein Rechnungs-Analyse-Assistent. Hier ist der extrahierte Text einer Rechnung. Gib ausschliesslich ein JSON-Objekt zurueck (kein Markdown, keine Erklaerungen):\n\n${RECHNUNG_JSON_SCHEMA}\n\n${RECHNUNG_REGELN}`;

// ============================================================
// Hilfsfunktionen
// ============================================================

/**
 * Konvertiert eine Datei zu Base64-String.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

/**
 * Komprimiert ein Bild auf maxPx Pixel (laengste Seite) via Canvas.
 * PDFs und nicht-Bild-Dateien werden unveraendert zurueckgegeben.
 * HEIC-Unterstuetzung ist browserabhaengig (Safari/iOS: nativ; Chrome/Firefox: nicht garantiert).
 */
async function compressImage(file, maxPx = 1200) {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxPx && height <= maxPx) { resolve(file); return; }
      const ratio = Math.min(maxPx / width, maxPx / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * Normalisiert einen Zahlenwert aus KI-Antworten.
 * Behandelt deutsche Zahlenformate: "1,439" → 1.439, "1.000,50" → 1000.50
 * Entscheidungsregel: das rechteste Trennzeichen ist der Dezimaltrenner.
 */
function normalizeNumber(val) {
  if (val == null) return null;
  let s = String(val).trim().replace(/[€$£\s]/g, "");

  const hasComma = s.includes(",");
  const hasDot   = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // z.B. "1.000,50" → "1000.50"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // z.B. "1,000.50" → "1000.50"
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // z.B. "1,439" → "1.439"
    s = s.replace(",", ".");
  }
  // Nur Punkt → unveraendert lassen (z.B. "1.439" bleibt "1.439")

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validiert und berechnet fehlende Preiswerte in Positionen.
 * Normalisiert deutsche Zahlenformate, prueft Plausibilitaet.
 */
function validierePositionen(positionen) {
  return (positionen || []).map((pos) => {
    let menge       = normalizeNumber(pos.menge)       ?? 1;
    let einzelpreis = normalizeNumber(pos.einzelpreis);
    let gesamtpreis = normalizeNumber(pos.gesamtpreis);

    // Fehlende Werte berechnen
    if (einzelpreis != null && menge != null && gesamtpreis == null) {
      gesamtpreis = parseFloat((einzelpreis * menge).toFixed(2));
    } else if (gesamtpreis != null && menge != null && menge > 0 && einzelpreis == null) {
      einzelpreis = parseFloat((gesamtpreis / menge).toFixed(3));
    }

    // Plausibilitaetspruefung: einzelpreis x menge ≈ gesamtpreis (Toleranz 2% + 1 Cent)
    if (einzelpreis != null && menge != null && menge > 0 && gesamtpreis != null) {
      const erwartet = einzelpreis * menge;
      if (Math.abs(erwartet - gesamtpreis) > 0.02 * gesamtpreis + 0.01) {
        einzelpreis = parseFloat((gesamtpreis / menge).toFixed(3));
      }
    }

    return { ...pos, menge, einzelpreis, gesamtpreis };
  });
}

/**
 * Generiert einen lesbaren Fliesstext aus den Rechnungsdaten.
 */
function generiereZusammenfassung(haendler, datum, gesamt, positionen) {
  const haendlerText = haendler || "einem unbekannten Händler";
  const datumText = datum
    ? new Date(datum).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "einem unbekannten Datum";
  const gesamtText = gesamt != null ? gesamt.toFixed(2) + " €" : "einem unbekannten Betrag";

  // Kraftstoff-Sonderfall
  const tankPos = (positionen || []).find((p) =>
    /kraftstoff|benzin|diesel|eurosuper|super\s*95|super\s*e5|e10|heizoel|treibstoff/i.test(p.name || "")
  );
  if (tankPos && tankPos.einheit === "Liter" && tankPos.einzelpreis != null) {
    return `Du hast am ${datumText} bei ${haendlerText} ${tankPos.menge?.toFixed(2) ?? "?"} Liter ${tankPos.name} getankt. Der Preis pro Liter betrug ${tankPos.einzelpreis.toFixed(3)} € und der Gesamtbetrag belief sich auf ${gesamtText}.`;
  }

  // Standard: bis 3 Positionen namentlich
  const pos = (positionen || []).filter((p) => p.name);
  if (pos.length > 0 && pos.length <= 3) {
    const liste = pos
      .map((p) => `${p.name}${p.gesamtpreis != null ? ` (${p.gesamtpreis.toFixed(2)} €)` : ""}`)
      .join(", ");
    return `Du hast am ${datumText} bei ${haendlerText} gekauft: ${liste}. Gesamtbetrag: ${gesamtText}.`;
  }

  return `Du hast am ${datumText} bei ${haendlerText} eingekauft und insgesamt ${gesamtText} ausgegeben.`;
}

function istTankPosition(position) {
  const nameNorm = normalisieren(position?.name || "");
  if (!nameNorm) return false;
  return FUEL_POSITION_KEYWORDS.some((kw) => nameNorm.includes(normalisieren(kw)));
}

function istTankHaendler(haendler) {
  const haendlerNorm = normalisieren(haendler || "");
  if (!haendlerNorm) return false;
  return FUEL_MERCHANT_KEYWORDS.some((kw) => haendlerNorm.includes(normalisieren(kw)));
}

function ermittleBudgetKategorieVorschlag(haendler, positionen) {
  const hatTankPosition = (positionen || []).some((p) => istTankPosition(p));
  if (hatTankPosition || istTankHaendler(haendler)) return "Tanken";
  return null;
}

/**
 * Normalisiert einen Text fuer Keyword-Matching.
 */
function normalisieren(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" }[c] || c))
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalisiert einen Haendlernamen fuer den HAENDLER_HINTS-Lookup.
 */
function normalisiereHaendler(haendler) {
  if (!haendler) return "";
  return normalisieren(haendler).replace(/\s+/g, "");
}

/**
 * Bestimmt Obergruppe und Confidence fuer ein Produkt (4-stufige Regel-Ebene).
 */
function bestimmeObergruppe(position, haendlerNormiert) {
  const nameNorm = normalisieren(position.name || "");

  // Stufe 1: KI-Vorschlag uebernehmen wenn confidence ausreichend
  if (
    position.obergruppe &&
    position.obergruppe !== "keine_zuordnung" &&
    position.obergruppe !== "sonstiges" &&
    typeof position.confidence === "number" &&
    position.confidence >= 0.75 &&
    OBERGRUPPE_TO_MODUL[position.obergruppe]
  ) {
    let conf = position.confidence;
    const hints = HAENDLER_HINTS[haendlerNormiert] || [];
    if (hints.includes(position.obergruppe)) {
      conf = Math.min(1.0, conf + 0.1);
    }
    return { obergruppe: position.obergruppe, confidence: conf, quelle: "ki" };
  }

  // Stufe 2: Keyword-Matching
  let bestObergruppe = null;
  let bestScore = 0;

  for (const [gruppe, keywords] of Object.entries(OBERGRUPPEN_KEYWORDS)) {
    for (const kw of keywords) {
      const kwNorm = normalisieren(kw);
      if (nameNorm.includes(kwNorm)) {
        const score = kwNorm.length;
        if (score > bestScore) {
          bestScore = score;
          bestObergruppe = gruppe;
        }
      }
    }
  }

  if (bestObergruppe) {
    let conf = 0.7 + Math.min(0.15, bestScore * 0.01);
    const hints = HAENDLER_HINTS[haendlerNormiert] || [];
    if (hints.includes(bestObergruppe)) {
      conf = Math.min(1.0, conf + 0.1);
    }
    return { obergruppe: bestObergruppe, confidence: conf, quelle: "keyword" };
  }

  // Stufe 3: Haendler-Kontext allein (niedrige Confidence)
  const hints = HAENDLER_HINTS[haendlerNormiert] || [];
  if (hints.length > 0) {
    return { obergruppe: hints[0], confidence: 0.45, quelle: "haendler" };
  }

  // Stufe 4: Fallback
  return { obergruppe: "keine_zuordnung", confidence: 0.2, quelle: "fallback" };
}

/**
 * Klassifiziert alle Positionen einer Rechnung.
 */
function klassifizierePositionen(positionen, haendler) {
  const haendlerNorm = normalisiereHaendler(haendler);
  return positionen.map((pos) => {
    const { obergruppe, confidence, quelle } = bestimmeObergruppe(pos, haendlerNorm);
    const modul = OBERGRUPPE_TO_MODUL[obergruppe] || "keine_zuordnung";
    return {
      ...pos,
      obergruppe,
      modul_vorschlag: modul,
      confidence,
      klassifikation_quelle: quelle,
      review_noetig: confidence < 0.75 || modul === "keine_zuordnung",
    };
  });
}

/**
 * Erkennt welche Module fuer diese Rechnung relevant sind.
 * "keine_zuordnung" wird herausgefiltert — kein Modul-Toggle dafuer.
 */
function ermittleErkannteModule(positionen) {
  const module = new Set(["budget", "dokumente"]);
  for (const pos of positionen) {
    if (pos.modul_vorschlag && pos.modul_vorschlag !== "keine_zuordnung") {
      module.add(pos.modul_vorschlag);
    }
  }
  return Array.from(module);
}

/**
 * Normalisiert ein Datum (verschiedene Formate) zu YYYY-MM-DD.
 */
function normalisiereDatum(datumText) {
  if (!datumText) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(datumText)) return datumText;

  const match = datumText.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (match) {
    let [, tag, monat, jahr] = match;
    if (jahr.length === 2) {
      jahr = parseInt(jahr) > 50 ? "19" + jahr : "20" + jahr;
    }
    return `${jahr}-${monat.padStart(2, "0")}-${tag.padStart(2, "0")}`;
  }

  return null;
}

/**
 * Parst strukturierten Rechnungstext mit Regex-Regeln.
 */
function parseRechnungsText(text, roherText) {
  if (typeof text !== "string") text = String(text ?? "");
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let datum = null;
  for (const line of lines) {
    const m = line.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
    if (m) {
      datum = normalisiereDatum(m[0]);
      break;
    }
  }

  let gesamt = null;
  const betraege = text.matchAll(/(\d{1,6}[,\.]\d{2})\s*€?/g);
  for (const m of betraege) {
    const val = parseFloat(m[1].replace(",", "."));
    if (!isNaN(val)) gesamt = val;
  }

  const haendler = lines[0] || null;

  const positionen = [];
  for (const line of lines) {
    const posMatch = line.match(/^(.+?)\s+(\d{1,6}[,\.]\d{2})\s*€?$/);
    if (posMatch) {
      const preis = parseFloat(posMatch[2].replace(",", "."));
      if (preis > 0 && preis < (gesamt || Infinity)) {
        positionen.push({
          name: posMatch[1].trim(),
          menge: 1,
          einheit: "Stueck",
          einzelpreis: preis,
          gesamtpreis: preis,
          obergruppe: "keine_zuordnung",
          confidence: 0.4,
        });
      }
    }
  }

  return {
    haendler,
    datum,
    gesamt,
    positionen,
    roher_text: roherText || text,
    confidence: 0.55,
  };
}

// ============================================================
// Analyse-Backend-Implementierungen
// ============================================================

/**
 * Extrahiert Text aus einer Datei (Bild oder PDF).
 * Bei PDFs: Textextraktion via pdfjs-dist (CDN-Import, alle Seiten).
 */
export async function extractTextFromFile(file) {
  const mimeType = file.type;
  const base64 = await fileToBase64(file);

  if (mimeType === "application/pdf") {
    try {
      // eslint-disable-next-line
      const pdfjsLib = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.worker.mjs";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      if (fullText.trim().length > 50) {
        return { base64, text: fullText, mimeType, isPdf: true, hasText: true };
      }
    } catch {
      // PDF-Textextraktion fehlgeschlagen
    }
    return { base64, text: null, mimeType, isPdf: true, hasText: false };
  }

  return { base64, text: null, mimeType, isPdf: false, hasText: false };
}

/**
 * Analysiert ein Bild mit ChatGPT Vision (GPT-4o) via ki-vision Edge Function.
 */
async function analyzeWithChatGptVision(base64, mimeType, session) {
  const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ki-vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      mode: "chatgpt_vision",
      file_base64: base64,
      mime_type: mimeType,
      prompt: KI_RECHNUNG_PROMPT_VISION,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Vision-Analyse fehlgeschlagen (${res.status})`);

  const rawText = json?.text ?? json?.choices?.[0]?.message?.content ?? "";
  const cleaned = cleanKiJsonResponse(rawText, "object");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn("ChatGPT Vision: JSON-Parse fehlgeschlagen.", rawText?.slice?.(0, 200));
    throw new Error("KI-Antwort konnte nicht verarbeitet werden.");
  }

  return {
    haendler: parsed.haendler || null,
    datum: normalisiereDatum(parsed.datum),
    gesamt: normalizeNumber(parsed.gesamt),
    positionen: Array.isArray(parsed.positionen) ? parsed.positionen : [],
    roher_text: rawText,
    confidence: 0.9,
  };
}

/**
 * Analysiert ein Bild mit Ollama Vision via ki-vision Edge Function.
 */
async function analyzeWithOllamaVision(base64, mimeType, session) {
  const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ki-vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      mode: "ocr_ollama",
      file_base64: base64,
      mime_type: mimeType,
      prompt: KI_RECHNUNG_PROMPT_VISION,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Ollama Vision fehlgeschlagen (${res.status})`);

  const rawText = json?.text ?? "";
  const cleaned = cleanKiJsonResponse(rawText, "object");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn("Ollama Vision: JSON-Parse fehlgeschlagen.", rawText?.slice?.(0, 200));
    throw new Error("KI-Antwort konnte nicht verarbeitet werden.");
  }

  return {
    haendler: parsed.haendler || null,
    datum: normalisiereDatum(parsed.datum),
    gesamt: normalizeNumber(parsed.gesamt),
    positionen: Array.isArray(parsed.positionen) ? parsed.positionen : [],
    roher_text: rawText,
    confidence: 0.85,
  };
}

/**
 * Analysiert extrahierten PDF-Text via ki-chat (KI-Assistent-Konfiguration).
 * Wird fuer alle Modi bei PDF-Uploads verwendet (unabhaengig vom Bildanalyse-Modus).
 */
async function analyzeTextWithKiChat(text, kiClient) {
  if (!kiClient?.client) {
    throw new Error(
      "PDF-Analyse benötigt eine konfigurierte KI-Assistent-Verbindung. " +
      "Bitte richte im Profil OpenAI oder Ollama für den KI-Assistenten ein, " +
      "oder lade die Rechnung als Bild hoch."
    );
  }

  const prompt = `${KI_RECHNUNG_PROMPT_TEXT}\n\nRechnungstext:\n${text}`;
  const response = await kiClient.client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const rawText = response?.choices?.[0]?.message?.content ?? "";
  const cleaned = cleanKiJsonResponse(rawText, "object");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn("PDF ki-chat: JSON-Parse fehlgeschlagen.", rawText?.slice?.(0, 200));
    throw new Error("KI-Antwort konnte nicht verarbeitet werden.");
  }

  return {
    haendler: parsed.haendler || null,
    datum: normalisiereDatum(parsed.datum),
    gesamt: normalizeNumber(parsed.gesamt),
    positionen: Array.isArray(parsed.positionen) ? parsed.positionen : [],
    roher_text: text,
    confidence: 0.85,
  };
}

/**
 * Laedt Tesseract.js UMD-Build via Script-Tag (setzt window.Tesseract).
 * Idempotent: zweite Aufrufe liefern sofort das bereits geladene Objekt.
 */
async function ladeTesseract() {
  if (window.Tesseract?.createWorker) return window.Tesseract;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () =>
      window.Tesseract?.createWorker
        ? resolve(window.Tesseract)
        : reject(new Error("Tesseract.js: createWorker nicht gefunden."));
    s.onerror = () => reject(new Error("Tesseract.js konnte nicht geladen werden."));
    document.head.appendChild(s);
  });
}

/**
 * Analysiert eine Rechnung mit OCR (Tesseract.js) + Regelparser.
 */
async function analyzeWithOCRRules(base64OrText, hatText) {
  let ocrText = base64OrText;

  if (!hatText) {
    const Tesseract = await ladeTesseract();
    const worker = await Tesseract.createWorker(["deu", "eng"], 1, {
      workerPath: "https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      corePath: "https://unpkg.com/tesseract.js-core@5/tesseract-core.wasm.js",
    });
    const { data: { text } } = await worker.recognize(
      `data:image/jpeg;base64,${base64OrText}`
    );
    await worker.terminate();
    ocrText = text;
  }

  const ergebnis = parseRechnungsText(ocrText, ocrText);
  return { ...ergebnis, confidence: 0.6 };
}

/**
 * Analysiert mit OCR + Ollama (Text-Modus, Legacy — wird nicht mehr aus starteAnalyse aufgerufen).
 * Bleibt als Funktion erhalten fuer eventuelle Direktnutzung.
 */
async function analyzeWithOCROllama(file, kiClient) {
  const { base64, text: pdfText, hasText } = await extractTextFromFile(file);

  let ocrText;
  if (hasText && pdfText) {
    ocrText = pdfText;
  } else {
    const Tesseract = await ladeTesseract();
    const worker = await Tesseract.createWorker(["deu", "eng"], 1, {
      workerPath: "https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      corePath: "https://unpkg.com/tesseract.js-core@5/tesseract-core.wasm.js",
    });
    const { data: { text } } = await worker.recognize(
      `data:${file.type};base64,${base64}`
    );
    await worker.terminate();
    ocrText = text;
  }

  const prompt = `${KI_RECHNUNG_PROMPT_TEXT}\n\nRechnungstext:\n${ocrText}`;
  const response = await kiClient.client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const rawText = response?.choices?.[0]?.message?.content || "";
  const cleaned = cleanKiJsonResponse(rawText, "object");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return parseRechnungsText(ocrText, ocrText);
  }

  return {
    haendler: parsed.haendler || null,
    datum: normalisiereDatum(parsed.datum),
    gesamt: normalizeNumber(parsed.gesamt),
    positionen: Array.isArray(parsed.positionen) ? parsed.positionen : [],
    roher_text: ocrText,
    confidence: 0.8,
  };
}

// ============================================================
// Haupt-Orchestrator
// ============================================================

/**
 * Startet die Rechnungsanalyse im konfigurierten Modus.
 *
 * PDF-Handling (alle Modi):
 *   - PDFs mit extrahierbarem Text → analyzeTextWithKiChat (KI-Assistent-Konfiguration)
 *   - Bild-PDFs (kein Text) → Fehlermeldung
 *   - ocr_regeln + PDF → analyzeWithOCRRules (regelbasiert, kein KI noetig)
 *
 * @param {File} file - Hochgeladene Datei (Bild oder PDF)
 * @param {string} modus - "chatgpt_vision" | "ocr_regeln" | "ocr_ollama"
 * @param {{ kiClient: object, session: object }} opts
 * @returns {Promise<RechnungResult>}
 */
export async function starteAnalyse(file, modus, { kiClient, session } = {}) {
  const isPDF = file.type === "application/pdf";

  let roherAnalyse;

  if (isPDF) {
    const { text, hasText } = await extractTextFromFile(file);

    if (!hasText || !text?.trim()) {
      throw new Error(
        "Dieses PDF enthält keinen lesbaren Text. Bitte mache ein Foto der Rechnung und lade es als Bild hoch."
      );
    }

    if (modus === "ocr_regeln") {
      roherAnalyse = await analyzeWithOCRRules(text, true);
    } else {
      // chatgpt_vision und ocr_ollama: PDF-Text via ki-chat (KI-Assistent-Konfiguration)
      roherAnalyse = await analyzeTextWithKiChat(text, kiClient);
    }
  } else {
    // Bild: zuerst komprimieren
    const compressedFile = await compressImage(file, 1200);
    const base64 = await fileToBase64(compressedFile);
    const mimeType = compressedFile.type;

    switch (modus) {
      case "chatgpt_vision":
        roherAnalyse = await analyzeWithChatGptVision(base64, mimeType, session);
        break;

      case "ocr_regeln":
        roherAnalyse = await analyzeWithOCRRules(base64, false);
        break;

      case "ocr_ollama":
        roherAnalyse = await analyzeWithOllamaVision(base64, mimeType, session);
        break;

      default:
        throw new Error(`Unbekannter Analyse-Modus: ${modus}`);
    }
  }

  // Regel-Ebene: Positionen klassifizieren + validieren
  const positionen = validierePositionen(
    klassifizierePositionen(roherAnalyse.positionen || [], roherAnalyse.haendler)
  );

  const erkannteModule = ermittleErkannteModule(positionen);
  const budgetKategorieVorschlag = ermittleBudgetKategorieVorschlag(
    roherAnalyse.haendler,
    positionen
  );

  return {
    haendler: roherAnalyse.haendler,
    datum: roherAnalyse.datum,
    gesamt: roherAnalyse.gesamt,
    positionen,
    roher_text: roherAnalyse.roher_text || "",
    confidence: roherAnalyse.confidence || 0.5,
    erkannte_module: erkannteModule,
    budget_kategorie_vorschlag: budgetKategorieVorschlag,
    summary_text: generiereZusammenfassung(
      roherAnalyse.haendler,
      roherAnalyse.datum,
      roherAnalyse.gesamt,
      positionen
    ),
  };
}
