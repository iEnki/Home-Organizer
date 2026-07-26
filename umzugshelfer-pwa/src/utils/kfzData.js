import { supabase } from "../supabaseClient";

const safeFileName = (name) => String(name || "datei")
  .normalize("NFKD")
  .replace(/[^\w.-]+/g, "_");

const numberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const intOrNull = (value) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Eine Speicherung aus dem KFZ-Formular schließt die manuelle Prüfung eines
 * automatisch importierten Tankvorgangs ab. Verdeckte Import-Flags dürfen
 * danach nicht weiter den Hinweis "Verbrauch prüfen" auslösen.
 */
export const markFuelEntryReviewed = (values = {}) => ({
  ...values,
  tankstatus_quelle: "manuell",
  verbrauch_bestaetigt: true,
});

/**
 * Legt einen Tankvorgang an oder aktualisiert ihn (gemeinsamer Pfad fuer
 * HomeKfz-Formulare und den globalen Assistenten).
 */
export async function saveFuelEntry({ householdId, userId, values = {}, id = null }) {
  if (!householdId) throw new Error("Haushalt ist erforderlich.");
  if (!values.fahrzeug_id) throw new Error("Fahrzeug ist erforderlich.");
  const liters = numberOrNull(values.liter);
  const betrag = numberOrNull(values.betrag) || 0;
  const tankstatus = ["voll", "teilweise", "unbekannt"].includes(values.tankstatus)
    ? values.tankstatus
    : "unbekannt";
  const payload = {
    household_id: householdId,
    fahrzeug_id: values.fahrzeug_id,
    datum: values.datum || todayIso(),
    betrag,
    tankstelle: values.tankstelle || null,
    liter: liters,
    kilometerstand: intOrNull(values.kilometerstand),
    preis_pro_liter: numberOrNull(values.preis_pro_liter) || (liters ? betrag / liters : null),
    kraftstoffart: values.kraftstoffart || null,
    tankstatus,
    tankstatus_quelle: values.tankstatus_quelle || "manuell",
    vollgetankt: tankstatus === "voll",
    verbrauch_bestaetigt: values.verbrauch_bestaetigt !== false,
    quelle: values.quelle || "manuell",
    budget_posten_id: values.budget_posten_id || null,
    rechnung_id: values.rechnung_id || null,
    dokument_id: values.dokument_id || null,
    notizen: values.notizen || null,
    created_by_user_id: userId,
  };
  const query = id
    ? supabase.from("home_fahrzeug_tankvorgaenge").update(payload).eq("household_id", householdId).eq("id", id)
    : supabase.from("home_fahrzeug_tankvorgaenge").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

/**
 * Legt einen Service-/Wartungseintrag fuer ein Fahrzeug an oder aktualisiert ihn.
 */
export async function saveServiceEntry({ householdId, userId, values = {}, id = null }) {
  if (!householdId) throw new Error("Haushalt ist erforderlich.");
  if (!values.fahrzeug_id) throw new Error("Fahrzeug ist erforderlich.");
  const payload = {
    household_id: householdId,
    fahrzeug_id: values.fahrzeug_id,
    typ: values.typ || "Service",
    datum: values.datum || todayIso(),
    kilometerstand: intOrNull(values.kilometerstand),
    kosten: numberOrNull(values.kosten),
    werkstatt: values.werkstatt || null,
    beschreibung: values.beschreibung || null,
    naechste_faelligkeit_datum: values.naechste_faelligkeit_datum || null,
    naechste_faelligkeit_km: intOrNull(values.naechste_faelligkeit_km),
    dokument_id: values.dokument_id || null,
    notizen: values.notizen || null,
    created_by_user_id: userId,
  };
  const query = id
    ? supabase.from("home_fahrzeug_services").update(payload).eq("household_id", householdId).eq("id", id)
    : supabase.from("home_fahrzeug_services").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

/**
 * Erfasst einen Kilometerstand via RPC record_kfz_mileage.
 */
export async function recordMileage({ householdId, fahrzeugId, kilometerstand, datum, quelle = "manuell", quelleId = null }) {
  if (!householdId) throw new Error("Haushalt ist erforderlich.");
  if (!fahrzeugId) throw new Error("Fahrzeug ist erforderlich.");
  if (kilometerstand === "" || kilometerstand === null || kilometerstand === undefined) {
    throw new Error("Kilometerstand ist erforderlich.");
  }
  const { data, error } = await supabase.rpc("record_kfz_mileage", {
    p_household_id: householdId,
    p_vehicle_id: fahrzeugId,
    p_date: datum || todayIso(),
    p_mileage: Number(kilometerstand),
    p_source: quelle,
    p_source_id: quelleId,
  });
  if (error) throw error;
  return data;
}

/**
 * Findet ein Fahrzeug des Haushalts per Name oder Kennzeichen (fuzzy).
 */
export async function findVehicleByName({ householdId, name }) {
  const { data, error } = await supabase
    .from("home_fahrzeuge")
    .select("id, name, kennzeichen")
    .eq("household_id", householdId)
    .limit(20);
  if (error) throw error;
  const vehicles = data || [];
  if (vehicles.length === 0) return null;
  const term = String(name || "").trim().toLowerCase();
  if (!term) return vehicles.length === 1 ? vehicles[0] : null;
  return (
    vehicles.find((v) => String(v.name || "").toLowerCase() === term) ||
    vehicles.find(
      (v) =>
        String(v.name || "").toLowerCase().includes(term) ||
        String(v.kennzeichen || "").toLowerCase().includes(term),
    ) ||
    (vehicles.length === 1 ? vehicles[0] : null)
  );
}

export async function saveKfzExpenseWithBudget({
  expense,
  householdId,
  userId,
  mirrorToBudget,
}) {
  const { data, error } = await supabase.rpc("save_kfz_expense_with_budget", {
    p_payload: {
      id: expense.id || null,
      household_id: householdId,
      user_id: userId,
      fahrzeug_id: expense.fahrzeug_id,
      datum: expense.datum,
      kategorie: expense.kategorie,
      beschreibung: expense.beschreibung,
      betrag: Number(expense.betrag || 0),
      budget_posten_id: expense.budget_posten_id || null,
      rechnung_id: expense.rechnung_id || null,
      dokument_id: expense.dokument_id || null,
      notizen: expense.notizen || null,
      mirror_to_budget: Boolean(mirrorToBudget),
    },
  });
  if (error) throw error;
  return data;
}

export async function uploadKfzDocument({
  file,
  userId,
  householdId,
  entityType,
  entityId,
  role = "attachment",
  category = "Kfz",
}) {
  if (!file || !userId || !entityId) return null;
  const storagePath = `${userId}/kfz/${Date.now()}_${safeFileName(file.name)}`;
  let createdDocument = null;
  const { error: uploadError } = await supabase.storage
    .from("user-dokumente")
    .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  try {
    const { data: document, error: documentError } = await supabase
      .from("dokumente")
      .insert({
        user_id: userId,
        household_id: householdId,
        app_modus: "home",
        dateiname: file.name,
        datei_typ: file.type || null,
        storage_pfad: storagePath,
        beschreibung: "Kfz-Dokument",
        groesse_kb: Math.round(file.size / 1024),
        kategorie: category,
        dokument_typ: file.type?.startsWith("image/") ? "foto" : null,
      })
      .select("*")
      .single();
    if (documentError) throw documentError;
    createdDocument = document;
    const { error: linkError } = await supabase.from("dokument_links").insert({
      household_id: householdId,
      dokument_id: document.id,
      entity_type: entityType,
      entity_id: entityId,
      role,
    });
    if (linkError) throw linkError;
    return document;
  } catch (error) {
    if (createdDocument?.id) {
      await supabase.from("dokumente").delete().eq("id", createdDocument.id);
    }
    await supabase.storage.from("user-dokumente").remove([storagePath]);
    throw error;
  }
}

export async function removeKfzDocument(document) {
  if (!document?.id) return;
  let deleteQuery = supabase.from("dokumente").delete().eq("id", document.id);
  if (document.household_id) deleteQuery = deleteQuery.eq("household_id", document.household_id);
  const { error } = await deleteQuery;
  if (error) throw error;
  if (document.storage_pfad) {
    const { error: storageError } = await supabase.storage.from("user-dokumente").remove([document.storage_pfad]);
    if (storageError) throw storageError;
  }
}

export async function createKfzDocumentUrl(document) {
  if (!document?.storage_pfad) return null;
  const { data, error } = await supabase.storage
    .from("user-dokumente")
    .createSignedUrl(document.storage_pfad, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}
