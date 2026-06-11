import { supabase } from "../supabaseClient";
export {
  SERVICE_POSITION_CATEGORIES,
  calculatePositionDifference,
  findUniqueVehicleMatch,
  normalizeVehicleIdentifier,
} from "./kfzServiceAnalysisCore";

const safeFileName = (name) => String(name || "servicebeleg")
  .normalize("NFKD")
  .replace(/[^\w.-]+/g, "_");

export async function uploadKfzServiceDocument({ file, userId, householdId }) {
  const path = `${userId}/kfz/service-analysis/${Date.now()}_${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("user-dokumente")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data: document, error: documentError } = await supabase
    .from("dokumente")
    .insert({
      user_id: userId,
      household_id: householdId,
      app_modus: "home",
      dateiname: file.name,
      storage_pfad: path,
      datei_typ: file.type || null,
      groesse_kb: Math.round(file.size / 1024),
      kategorie: "Kfz-Service",
      dokument_typ: "kfz_servicebeleg",
      meta: { kfz_service_analysis: { status: "queued" } },
    })
    .select("*")
    .single();
  if (documentError) {
    await supabase.storage.from("user-dokumente").remove([path]);
    throw documentError;
  }
  return document;
}

export async function analyzeKfzServiceDocument({ documentId, locale }) {
  const { data, error } = await supabase.functions.invoke("kfz-service-analyze", {
    body: { dokument_id: documentId, locale },
  });
  if (error) throw error;
  if (data?.status !== "ok") throw new Error(data?.error || "Servicebeleg konnte nicht analysiert werden.");
  return data;
}

export async function discardKfzServiceDocument(document) {
  if (!document?.id) return;
  let deleteQuery = supabase.from("dokumente").delete().eq("id", document.id);
  if (document.household_id) deleteQuery = deleteQuery.eq("household_id", document.household_id);
  const { error: documentError } = await deleteQuery;
  if (documentError) throw documentError;
  if (document.storage_pfad) {
    const { error: storageError } = await supabase.storage.from("user-dokumente").remove([document.storage_pfad]);
    if (storageError) throw storageError;
  }
}

export async function saveKfzServiceAnalysis(payload) {
  const { data, error } = await supabase.rpc("save_kfz_service_analysis", { p_payload: payload });
  if (error) throw error;
  return data;
}
