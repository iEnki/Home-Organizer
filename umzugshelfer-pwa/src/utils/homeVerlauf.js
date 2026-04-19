/**
 * Schreibt einen Eintrag in die `home_verlauf` Tabelle.
 *
 * Das optionale `options`-Argument ist bewusst additiv und dient derzeit nur
 * als kompatibler Hook fuer spaetere strukturierte Verlauf-Metadaten.
 */
export const logVerlauf = async (supabase, userId, tabelle, name, aktion, _options = {}) => {
  if (!userId) return;

  try {
    await supabase.from("home_verlauf").insert({
      user_id: userId,
      tabelle,
      datensatz_name: String(name || "").trim() || null,
      aktion,
    });
  } catch {
    // Verlauf darf nie den eigentlichen Fach-Flow blockieren.
  }
};

export const logVerlaufBatch = async (supabase, userId, eintraege = []) => {
  if (!userId || !Array.isArray(eintraege) || eintraege.length === 0) return [];

  return Promise.all(
    eintraege.map((eintrag) =>
      logVerlauf(
        supabase,
        userId,
        eintrag?.tabelle,
        eintrag?.datensatz_name ?? eintrag?.name,
        eintrag?.aktion,
        eintrag?.options || {},
      ),
    ),
  );
};
