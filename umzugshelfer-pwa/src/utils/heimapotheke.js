import { cleanKiJsonResponse } from "./kiClient";

export const MEDICATION_CATEGORIES = [
  "Schmerzmittel",
  "Erkältung",
  "Allergie",
  "Magen & Darm",
  "Wundversorgung",
  "Vitamine & Mineralstoffe",
  "Dauertherapie",
  "Sonstiges",
];

export const MEDICATION_FORMS = [
  "Tabletten",
  "Kapseln",
  "Tropfen",
  "Saft",
  "Spray",
  "Salbe",
  "Creme",
  "Gel",
  "Zäpfchen",
  "Pflaster",
  "Injektion",
  "Sonstiges",
];

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("de-AT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

export const normalizeMedicationKey = (value) =>
  normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();

export const isMedicationAdviceRequest = (text) =>
  /\b(dosier|dosis|einnehmen|einnahme|wie viel|wieviel|diagnose|krankheit|therapie|behandlung|wechselwirkung|nebenwirkung|schwanger|kind|baby|notfall)\b/i.test(
    String(text || ""),
  );

export const medicationAdviceRefusal =
  "Ich kann die Heimapotheke organisieren, aber keine medizinische Beratung, Diagnose oder Dosierungsempfehlung geben. Bitte prüfe den offiziellen Beipackzettel oder frage Apotheke/Ärztin/Arzt.";

export const getMedicationStatus = (medication, today = new Date()) => {
  const bestand = Number(medication?.bestand ?? 0);
  const mindestbestand = Number(medication?.mindestbestand ?? 1);
  const lowStock = bestand <= mindestbestand;
  const expiry = medication?.ablaufdatum ? new Date(`${medication.ablaufdatum}T00:00:00`) : null;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (expiry && expiry < todayStart) return { key: "expired", lowStock, daysUntilExpiry: -1 };
  if (expiry) {
    const daysUntilExpiry = Math.ceil((expiry.getTime() - todayStart.getTime()) / 86400000);
    if (daysUntilExpiry <= 30) return { key: "expiring", lowStock, daysUntilExpiry };
    return { key: lowStock ? "low" : "ok", lowStock, daysUntilExpiry };
  }
  return { key: lowStock ? "low" : "ok", lowStock, daysUntilExpiry: null };
};

export const findExistingMedication = (medications = [], candidate = {}) => {
  const name = normalizeMedicationKey(candidate.name);
  const active = normalizeMedicationKey(candidate.wirkstoff);
  const form = normalizeMedicationKey(candidate.darreichungsform);
  const packageSize = normalizeMedicationKey(candidate.packungsgroesse);
  if (!name) return null;

  return (
    medications.find((med) => {
      if (normalizeMedicationKey(med.name) !== name) return false;
      const medActive = normalizeMedicationKey(med.wirkstoff);
      const medForm = normalizeMedicationKey(med.darreichungsform);
      const medPackage = normalizeMedicationKey(med.packungsgroesse);
      if (active && medActive && active !== medActive) return false;
      if (form && medForm && form !== medForm) return false;
      if (packageSize && medPackage && packageSize !== medPackage) return false;
      return true;
    }) || null
  );
};

export const buildMedicationPayload = ({ item = {}, userId, householdId }) => ({
  user_id: userId,
  household_id: householdId || null,
  name: String(item.name || "").trim(),
  wirkstoff: item.wirkstoff || null,
  darreichungsform: item.darreichungsform || null,
  packungsgroesse: item.packungsgroesse || null,
  bestand: Number.isFinite(Number(item.bestand)) ? Number(item.bestand) : 1,
  mindestbestand: Number.isFinite(Number(item.mindestbestand)) ? Number(item.mindestbestand) : 1,
  ablaufdatum: item.ablaufdatum || null,
  lagerort: item.lagerort || null,
  kategorie: item.kategorie || "Sonstiges",
  notizen: item.notizen || null,
  kaufdatum: item.kaufdatum || null,
  preis: item.preis != null && item.preis !== "" ? Number(item.preis) : null,
  haendler: item.haendler || null,
  rechnung_id: item.rechnung_id || null,
  rechnung_dokument_id: item.rechnung_dokument_id || null,
  beipackzettel_dokument_id: item.beipackzettel_dokument_id || null,
  beipackzettel_url: item.beipackzettel_url || null,
  offizielle_quelle: item.offizielle_quelle || null,
  source_payload: item.source_payload && typeof item.source_payload === "object" ? item.source_payload : {},
});

export const buildLeafletAnalysisPrompt = ({ medication, sourceText }) => `Analysiere den folgenden Beipackzettel ausschließlich für eine private Organisationsansicht.
Keine Diagnose, keine Therapieempfehlung, keine eigenständige Dosierungsempfehlung.
Extrahiere nur belegte Angaben aus dem Text. Wenn etwas fehlt, verwende null oder [].
Antworte NUR als JSON-Objekt mit diesen Feldern:
{
  "wirkstoff": string|null,
  "darreichungsform": string|null,
  "packungsgroesse": string|null,
  "zweck_laut_beipackzettel": string|null,
  "aufbewahrung": string|null,
  "haltbarkeit_nach_oeffnung": string|null,
  "wichtige_warnhinweise": string[],
  "wann_aerztlichen_rat_einholen": string[],
  "nebenwirkungen_hinweis": string|null,
  "quelle": string|null,
  "stand_hinweis": string|null
}
Medikament: ${medication?.name || "Unbekannt"}
Beipackzetteltext:
"""${String(sourceText || "").slice(0, 12000)}"""`;

export const sanitizeLeafletSummary = (raw) => {
  const parsed = typeof raw === "string" ? JSON.parse(cleanKiJsonResponse(raw, "object")) : raw;
  const object = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  return {
    wirkstoff: object.wirkstoff || null,
    darreichungsform: object.darreichungsform || null,
    packungsgroesse: object.packungsgroesse || null,
    zweck_laut_beipackzettel: object.zweck_laut_beipackzettel || null,
    aufbewahrung: object.aufbewahrung || null,
    haltbarkeit_nach_oeffnung: object.haltbarkeit_nach_oeffnung || null,
    wichtige_warnhinweise: Array.isArray(object.wichtige_warnhinweise) ? object.wichtige_warnhinweise.slice(0, 8) : [],
    wann_aerztlichen_rat_einholen: Array.isArray(object.wann_aerztlichen_rat_einholen) ? object.wann_aerztlichen_rat_einholen.slice(0, 8) : [],
    nebenwirkungen_hinweis: object.nebenwirkungen_hinweis || null,
    quelle: object.quelle || null,
    stand_hinweis: object.stand_hinweis || null,
    disclaimer:
      "KI-Zusammenfassung aus Beipackzettel, keine medizinische Beratung. Offizielle Quelle immer prüfen.",
  };
};

const OFFICIAL_SEARCH_URL = "https://medikamente.basg.gv.at/de/medicinal-products";

export const searchAustrianMedicines = async (query) => {
  const cleaned = String(query || "").trim();
  if (!cleaned) return [];
  return [
    {
      id: `basg-${normalizeMedicationKey(cleaned)}`,
      name: cleaned,
      wirkstoff: "",
      darreichungsform: "",
      packungsgroesse: "",
      offizielle_quelle: "BASG Medikamenten-Informationssystem",
      beipackzettel_url: "",
      source_payload: {
        provider: "basg",
        search_url: `${OFFICIAL_SEARCH_URL}?search=${encodeURIComponent(cleaned)}`,
        note: "Öffentliche BASG-Suche. Treffer bitte im offiziellen Register prüfen.",
      },
    },
  ];
};
