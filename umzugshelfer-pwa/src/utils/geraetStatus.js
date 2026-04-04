/**
 * Geräte & Wartung — Status-Berechnung, Datumshilfen, Sortierung
 */

// Heutiges Datum als YYYY-MM-DD (lokale Zeit, kein UTC-Off-by-one)
export function heuteIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Tagesdifferenz: positiv = Zukunft, negativ = Vergangenheit
// Vergleich über UTC-Konstruktor aus Datumsstring-Teilen → stabil ohne Timezone-Probleme
export function tageDifferenz(dateStr, heuteStr) {
  if (!dateStr) return Infinity;
  const [y1, m1, d1] = heuteStr.split("-").map(Number);
  const [y2, m2, d2] = dateStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Status-Codes (entsprechen exakt den Filterwerten in GeraetFilterBar)
export const STATUS_PRIORITAET = [
  "wartung_faellig",
  "gewaehrleistung_bald",
  "garantie_bald",
  "kein_beleg",
  "ok",
];

export const STATUS_CONFIG = {
  wartung_faellig:      { label: "Wartung offen",          farbe: "red",   ring: "border-red-400/40" },
  gewaehrleistung_bald: { label: "Gewährleistung bald ab", farbe: "amber", ring: "border-amber-400/40" },
  garantie_bald:        { label: "Garantie bald ab",       farbe: "amber", ring: "border-amber-400/30" },
  kein_beleg:           { label: "Ohne Beleg",             farbe: "gray",  ring: "" },
  ok:                   { label: "Aktiv",                  farbe: "green", ring: "" },
};

// Priority-basierte Statusberechnung — gibt immer den wichtigsten Zustand zurück
export function berechneGeraetStatus(g, heute) {
  const tage = (d) => tageDifferenz(d, heute);
  if (g.naechste_wartung && g.naechste_wartung <= heute) return "wartung_faellig";
  if (tage(g.gewaehrleistung_bis) >= 0 && tage(g.gewaehrleistung_bis) <= 60) return "gewaehrleistung_bald";
  if (tage(g.garantie_bis) >= 0 && tage(g.garantie_bis) <= 60) return "garantie_bald";
  if (!(g.verknuepfte_dokument_ids?.length)) return "kein_beleg";
  return "ok";
}

// Nur für Anzeige in der kollabierten Zeile — zeigt wichtigstes bekanntes Datum
export function primaereFrist(g) {
  if (g.naechste_wartung)    return { label: "Wartung",  datum: g.naechste_wartung };
  if (g.gewaehrleistung_bis) return { label: "Gewährl.", datum: g.gewaehrleistung_bis };
  if (g.garantie_bis)        return { label: "Garantie", datum: g.garantie_bis };
  return null;
}

// Nur für Sortierung "Nächste Frist" — überfällige Wartungen zuerst, dann chronologisch, null ans Ende
export function sortierFrist(g, heute) {
  // Überfällige Wartung: Vergangenheitsdatum ist lexikografisch kleiner als alle Zukunftsdaten → landet ganz vorn
  if (g.naechste_wartung && g.naechste_wartung <= heute) return g.naechste_wartung;
  // Früheste relevante Zukunftsfrist
  const kandidaten = [g.naechste_wartung, g.gewaehrleistung_bis, g.garantie_bis]
    .filter(Boolean)
    .filter((d) => d > heute)
    .sort();
  return kandidaten[0] ?? "9999-12-31";
}

// Hilfsfunktion: Datum als deutsches Format ausgeben
export function formatDatum(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}
