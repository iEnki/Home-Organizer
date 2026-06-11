import { getActiveHouseholdId } from "../supabaseClient";

const resolveHistoryHouseholdId = (options = {}) =>
  options?.householdId || options?.household_id || getActiveHouseholdId() || null;

/**
 * Schreibt einen Eintrag in die `home_verlauf` Tabelle.
 *
 * Das optionale `options`-Argument bleibt additiv: bestehende Aufrufe funktionieren
 * unveraendert, koennen aber einen expliziten Haushaltskontext mitgeben.
 */
export const logVerlauf = async (supabase, userId, tabelle, name, aktion, options = {}) => {
  if (!userId) return;

  try {
    const payload = {
      user_id: userId,
      tabelle,
      datensatz_name: String(name || "").trim() || null,
      aktion,
    };
    const householdId = resolveHistoryHouseholdId(options);
    if (householdId) payload.household_id = householdId;

    await supabase.from("home_verlauf").insert(payload);
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

export const createVerlaufQuery = ({
  supabase,
  userId,
  householdId = null,
  select = "*",
  limit = 200,
  tabelle = "",
}) => {
  if (!supabase || !userId) return null;

  const activeHouseholdId = householdId || getActiveHouseholdId() || null;
  let query = supabase.from("home_verlauf").select(select);

  if (activeHouseholdId) {
    query = query.or(`household_id.eq.${activeHouseholdId},and(household_id.is.null,user_id.eq.${userId})`);
  } else {
    query = query.eq("user_id", userId);
  }

  if (tabelle) query = query.eq("tabelle", tabelle);

  return query.order("created_at", { ascending: false }).limit(limit);
};
