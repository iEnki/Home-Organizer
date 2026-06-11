import { supabase } from "../supabaseClient";

export async function startRecipeImport({ url, location, mode, options }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !token) {
    throw new Error("Supabase-Konfiguration oder Sitzung fehlt.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/recipe-import-start`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, location, mode, options }),
  });

  const responseText = await response.text().catch(() => "");
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { error: responseText };
  }
  if (!response.ok) {
    const message = [
      data?.error,
      data?.detail,
      data?.job_id ? `Job: ${data.job_id}` : "",
    ].filter(Boolean).join(" - ");
    const error = new Error(message || `Import fehlgeschlagen (${response.status}).`);
    error.jobId = data?.job_id;
    error.details = data;
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function continueRecipeImportWithOpenAi(jobId) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !token) {
    throw new Error("Supabase-Konfiguration oder Sitzung fehlt.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/recipe-import-start`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fallback_job_id: jobId }),
  });

  const responseText = await response.text().catch(() => "");
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { error: responseText };
  }
  if (!response.ok) {
    const message = [
      data?.error,
      data?.detail,
      data?.job_id ? `Job: ${data.job_id}` : "",
    ].filter(Boolean).join(" - ");
    const error = new Error(message || `OpenAI-Fallback fehlgeschlagen (${response.status}).`);
    error.jobId = data?.job_id;
    error.details = data;
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchRecipeImportJob(jobId) {
  const { data, error } = await supabase
    .from("home_rezept_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRecipeImportJobs({ householdId, limit = 50 }) {
  if (!householdId) return [];
  const { data, error } = await supabase
    .from("home_rezept_import_jobs")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
