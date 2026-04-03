// Gemeinsame Archiv-Helfer für das Dokumentenarchiv.
// Wird von HomeDokumente.js, DokumentZeile.js, DokumentArchivListe.js genutzt.

/**
 * Gibt das fachlich relevante Datum eines Dokuments zurück.
 * Priorisierung: rechnung_info.rechnungsdatum → erstellt_am
 */
export function getDokDatum(dok) {
  return dok.rechnung_info?.rechnungsdatum || dok.erstellt_am?.split("T")[0] || "";
}

/**
 * Gibt den Monatsschlüssel im Format "YYYY-MM" zurück,
 * oder "unbekannt" wenn kein Datum vorhanden ist.
 */
export function getMonatsKey(dok) {
  const d = getDokDatum(dok);
  return d.length >= 7 ? d.substring(0, 7) : "unbekannt";
}

/**
 * Formatiert einen Monatsschlüssel als lesbares Label.
 * "2026-04" → "April 2026" | "unbekannt" → "Ohne Datum"
 */
export function formatMonatLabel(key) {
  if (key === "unbekannt") return "Ohne Datum";
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

/**
 * Vergleichsfunktion für Dokumente nach Datum.
 * Dokumente ohne Datum landen immer am Ende, unabhängig von der Sortierrichtung.
 * @param {"neueste"|"aelteste"} sortierung
 */
export function compareDokDatum(a, b, sortierung) {
  const da = getDokDatum(a);
  const db = getDokDatum(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return sortierung === "aelteste" ? da.localeCompare(db) : db.localeCompare(da);
}

/**
 * Vergleichsfunktion für Monats-Keys.
 * "unbekannt" landet immer am Ende, unabhängig von der Sortierrichtung.
 * @param {"neueste"|"aelteste"} sortierung
 */
export function sortMonthKeys(a, b, sortierung) {
  if (a === "unbekannt") return 1;
  if (b === "unbekannt") return -1;
  return sortierung === "aelteste" ? a.localeCompare(b) : b.localeCompare(a);
}
