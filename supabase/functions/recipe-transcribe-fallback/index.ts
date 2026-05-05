// Internal OpenAI audio transcription fallback for recipe-source-parser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Nur POST erlaubt." }, 405);

  const token = Deno.env.get("RECIPE_PARSER_INTERNAL_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungueltige JSON-Payload." }, 400);
  }
  const jobId = String(body.job_id || "");
  const audioBase64 = String(body.audio_base64 || "");
  if (!jobId || !audioBase64) return jsonResponse({ error: "job_id und audio_base64 sind erforderlich." }, 400);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: job } = await supabaseAdmin
    .from("home_rezept_import_jobs")
    .select("id, household_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return jsonResponse({ error: "Importjob nicht gefunden." }, 404);

  const { data: settings } = await supabaseAdmin
    .from("household_settings")
    .select("openai_api_key, kochbuch_openai_transcription_fallback_enabled, kochbuch_openai_transcription_model")
    .eq("household_id", job.household_id)
    .maybeSingle();
  if (settings?.kochbuch_openai_transcription_fallback_enabled === false) {
    return jsonResponse({ error: "Cloud-Transkriptionsfallback ist deaktiviert." }, 403);
  }
  if (!settings?.openai_api_key) return jsonResponse({ error: "OpenAI API-Key fehlt." }, 409);

  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const file = new File([bytes], String(body.filename || "audio.mp3"), { type: String(body.content_type || "audio/mpeg") });
  const form = new FormData();
  form.append("file", file);
  form.append("model", String(settings.kochbuch_openai_transcription_model || "gpt-4o-mini-transcribe"));
  form.append("response_format", "json");

  const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${settings.openai_api_key}` },
    body: form,
  });
  const json = await openaiRes.json().catch(() => ({}));
  if (!openaiRes.ok) {
    return jsonResponse({ error: json?.error?.message || `OpenAI HTTP ${openaiRes.status}` }, 502);
  }
  return jsonResponse({
    transcript: json.text || "",
    detected_language: json.language || null,
    engine: "openai",
    model: settings.kochbuch_openai_transcription_model || "gpt-4o-mini-transcribe",
  });
});
