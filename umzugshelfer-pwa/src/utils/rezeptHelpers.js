/**
 * rezeptHelpers.js
 * Wiederverwendbare Rezept-Schreibhelfer (HomeKochbuch + globaler Assistent).
 * Der komplexe Review-/Lokalisierungs-Speicherpfad bleibt in HomeKochbuch.js;
 * hier liegen die einfachen, haeufig gebrauchten Mutationen.
 */

import { supabase } from "../supabaseClient";
import { logVerlauf } from "./homeVerlauf";

/**
 * Setzt den Favoriten-Status eines Rezepts.
 */
export const setRezeptFavorit = async ({ rezeptId, favorit }) => {
  if (!rezeptId) throw new Error("Rezept ist erforderlich.");
  const { data, error } = await supabase
    .from("home_rezepte")
    .update({ favorisiert: Boolean(favorit) })
    .eq("id", rezeptId)
    .select("id, titel, favorisiert")
    .single();
  if (error) throw error;
  return data;
};

/**
 * Aktualisiert einfache Felder eines Rezepts (gruppe, titel, notizen, portionen, ...).
 * Nur whitelisted Felder werden uebernommen.
 */
const REZEPT_PATCH_FIELDS = ["titel", "gruppe", "notizen", "portionen", "quelle_url", "schwierigkeit", "zubereitungszeit_minuten"];

export const updateRezeptFelder = async ({ rezeptId, patch = {}, userId = null }) => {
  if (!rezeptId) throw new Error("Rezept ist erforderlich.");
  const safePatch = {};
  REZEPT_PATCH_FIELDS.forEach((field) => {
    if (patch[field] !== undefined) safePatch[field] = patch[field];
  });
  if (Object.keys(safePatch).length === 0) {
    throw new Error("Keine gueltigen Rezeptfelder zum Aktualisieren.");
  }
  const { data, error } = await supabase
    .from("home_rezepte")
    .update(safePatch)
    .eq("id", rezeptId)
    .select("id, titel")
    .single();
  if (error) throw error;
  if (userId) {
    await logVerlauf(supabase, userId, "home_rezepte", data?.titel || "Rezept", "geaendert");
  }
  return data;
};

/**
 * Findet ein Rezept per Titel (fuzzy, user-/haushaltsbezogen via RLS-Proxy).
 */
export const findRecipeByTitle = async ({ userId, titel }) => {
  const term = String(titel || "").trim();
  if (!term) return null;
  const { data, error } = await supabase
    .from("home_rezepte")
    .select("id, titel, favorisiert, gruppe")
    .eq("user_id", userId)
    .ilike("titel", `%${term}%`)
    .limit(5);
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return null;
  const exact = rows.find((row) => String(row.titel || "").toLowerCase() === term.toLowerCase());
  return exact || rows[0];
};
