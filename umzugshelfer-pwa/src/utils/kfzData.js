import { supabase } from "../supabaseClient";

const safeFileName = (name) => String(name || "datei")
  .normalize("NFKD")
  .replace(/[^\w.-]+/g, "_");

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
