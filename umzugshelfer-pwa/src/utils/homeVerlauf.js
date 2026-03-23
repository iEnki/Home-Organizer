/**
 * Hilfsfunktion zum Protokollieren von Aktionen im Home-Organizer.
 * Schreibt einen Eintrag in die `home_verlauf` Tabelle.
 *
 * @param {object} supabase  - Supabase-Client-Instanz
 * @param {string} userId    - ID des eingeloggten Nutzers
 * @param {string} tabelle   - Name der betroffenen Tabelle (z.B. "home_objekte")
 * @param {string} name      - Bezeichnung des betroffenen Datensatzes
 * @param {"erstellt"|"geaendert"|"geloescht"} aktion - Art der Aktion
 */
export const logVerlauf = async (supabase, userId, tabelle, name, aktion) => {
  if (!userId) return;
  try {
    await supabase.from("home_verlauf").insert({
      user_id: userId,
      tabelle,
      datensatz_name: name,
      aktion,
    });
  } catch {
    // Silent fail — Verlauf ist nicht kritisch
  }
};
