// Dublettenpruefer fuer home_buecher.
// Gibt ein Array von Fundstellen zurueck (leer = keine Dubletten).
// Warnen, nicht blockieren — Mehrfachexemplare sind legitim.

const normalizeStr = (s) =>
  (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");

/**
 * @param {object} supabase  - Supabase-Client
 * @param {string} householdId
 * @param {{ titel, autoren, isbn13, isbn10, lagerortId }} felder
 * @param {string|null} aktuelleId - ID des aktuell bearbeiteten Buchs (wird ausgeschlossen)
 * @returns {Promise<Array>} Fundstellen
 */
export const pruefeAufDubletten = async (
  supabase,
  householdId,
  { titel, autoren = [], isbn13, isbn10, lagerortId },
  aktuelleId = null,
) => {
  if (!householdId) return [];

  const treffer = [];

  // Pfad 1: gleiche ISBN-13
  if (isbn13) {
    let q = supabase
      .from("home_buecher")
      .select("id, titel, autor_anzeige, isbn_13, status")
      .eq("household_id", householdId)
      .eq("isbn_13", isbn13);
    if (aktuelleId) q = q.neq("id", aktuelleId);
    const { data } = await q;
    if (data?.length) treffer.push(...data.map((d) => ({ ...d, grund: "isbn13" })));
  }

  // Pfad 2: gleiche ISBN-10 (nur wenn keine ISBN-13-Treffer)
  if (!treffer.length && isbn10) {
    let q = supabase
      .from("home_buecher")
      .select("id, titel, autor_anzeige, isbn_10, status")
      .eq("household_id", householdId)
      .eq("isbn_10", isbn10);
    if (aktuelleId) q = q.neq("id", aktuelleId);
    const { data } = await q;
    if (data?.length) treffer.push(...data.map((d) => ({ ...d, grund: "isbn10" })));
  }

  // Pfad 3: aehnlicher Titel + Autor-Overlap ODER gleicher Lagerort
  if (!treffer.length && titel) {
    const titelNorm = normalizeStr(titel);
    if (titelNorm.length >= 3) {
      let q = supabase
        .from("home_buecher")
        .select("id, titel, autor_anzeige, autoren, lagerort_id, status")
        .eq("household_id", householdId)
        .ilike("titel", `%${titelNorm}%`);
      if (aktuelleId) q = q.neq("id", aktuelleId);
      const { data } = await q;

      for (const d of data ?? []) {
        const hatAutorenOverlap =
          autoren.length > 0 &&
          (d.autoren ?? []).some((a) =>
            autoren.some(
              (b) =>
                normalizeStr(a).length > 2 &&
                normalizeStr(a) === normalizeStr(b),
            ),
          );
        const hatGleichenLagerort =
          lagerortId && d.lagerort_id && lagerortId === d.lagerort_id;

        if (hatAutorenOverlap || hatGleichenLagerort) {
          treffer.push({
            ...d,
            grund: hatAutorenOverlap ? "titel_autor" : "titel_lagerort",
          });
        }
      }
    }
  }

  return treffer;
};
