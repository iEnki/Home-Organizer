// Supabase Edge Function: recipe-import-start
// Starts an asynchronous cookbook import job and delegates long processing to
// the internal recipe-source-parser service.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function truncate(value: string, max = 1200) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function normalizeLocale(locale: string | null | undefined) {
  return locale === "en" || locale === "en-GB" ? "en-GB" : "de";
}

function normalizeMode(value: unknown) {
  const mode = String(value || "combined");
  return ["web", "metadata", "transcript", "combined"].includes(mode) ? mode : "combined";
}

function platformFromUrl(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("youtu.be") || host.includes("youtube.com")) return "youtube";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("instagram.com")) return "instagram";
    return "web";
  } catch {
    return "unknown";
  }
}

function isVideoPlatform(platform: string) {
  return platform === "youtube" || platform === "tiktok" || platform === "instagram";
}

function resolveCookbookProvider(settings: Record<string, any> | null | undefined) {
  const override = settings?.kochbuch_ki_provider || "global";
  const provider = override === "global" ? settings?.ki_provider || "openai" : override;
  if (provider === "ollama") {
    return {
      provider,
      configured: Boolean(settings?.ollama_base_url),
      error: "Ollama ist für das Kochbuch nicht konfiguriert.",
    };
  }
  return {
    provider: "openai",
    configured: Boolean(settings?.openai_api_key),
    error: "OpenAI ist für das Kochbuch nicht konfiguriert.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Nur POST erlaubt." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Nicht authentifiziert." }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return jsonResponse({ error: "Nicht authentifiziert." }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungueltige JSON-Payload." }, 400);
  }

  const fallbackJobId = String(body.fallback_job_id || "").trim();
  const url = String(body.url || "").trim();
  if (!fallbackJobId) {
    if (!url) return jsonResponse({ error: "url fehlt." }, 400);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return jsonResponse({ error: "Nur HTTPS-URLs sind erlaubt." }, 400);
    } catch {
      return jsonResponse({ error: "Ungueltige URL." }, 400);
    }
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return jsonResponse({ error: membershipError.message }, 500);
  if (!membership?.household_id) return jsonResponse({ error: "Kein aktiver Haushalt vorhanden." }, 409);

  const householdId = membership.household_id as string;

  const { data: profile } = await supabaseAdmin
    .from("user_profile")
    .select("locale")
    .eq("id", user.id)
    .maybeSingle();
  const targetLocale = normalizeLocale(profile?.locale);

  const { data: settings } = await supabaseAdmin
    .from("household_settings")
    .select(`
      kochbuch_enabled,
      ki_provider,
      openai_api_key,
      ollama_base_url,
      ollama_model,
      kochbuch_ki_provider,
      kochbuch_openai_model,
      kochbuch_ollama_model,
      kochbuch_video_import_enabled,
      kochbuch_daily_web_import_limit,
      kochbuch_daily_video_import_limit,
      kochbuch_default_location,
      kochbuch_default_analyse_modus,
      kochbuch_extract_costs,
      kochbuch_extract_macros,
      kochbuch_use_moderation,
      kochbuch_transcription_provider,
      kochbuch_local_whisper_model,
      kochbuch_whisper_device,
      kochbuch_whisper_cpu_compute_type,
      kochbuch_whisper_gpu_compute_type,
      kochbuch_whisper_cpp_fallback_enabled,
      kochbuch_openai_transcription_fallback_enabled,
      kochbuch_openai_transcription_model,
      kochbuch_max_video_minutes
    `)
    .eq("household_id", householdId)
    .maybeSingle();

  if (settings?.kochbuch_enabled === false) return jsonResponse({ error: "Kochbuch ist deaktiviert." }, 403);
  const cookbookAi = resolveCookbookProvider(settings);
  if (!fallbackJobId && !cookbookAi.configured) return jsonResponse({ error: cookbookAi.error }, 409);

  if (fallbackJobId) {
    if (!settings?.openai_api_key) {
      return jsonResponse({ error: "OpenAI ist für das Kochbuch nicht konfiguriert.", job_id: fallbackJobId }, 409);
    }

    const { data: retryJob, error: retryJobError } = await supabaseAdmin
      .from("home_rezept_import_jobs")
      .select("*")
      .eq("id", fallbackJobId)
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (retryJobError) return jsonResponse({ error: retryJobError.message, job_id: fallbackJobId }, 500);
    if (!retryJob) return jsonResponse({ error: "Importjob nicht gefunden.", job_id: fallbackJobId }, 404);
    if (retryJob.status !== "needs_openai_fallback_confirmation") {
      return jsonResponse({ error: "Dieser Import wartet nicht auf eine OpenAI-Bestätigung.", job_id: fallbackJobId }, 409);
    }

    const parserToken = Deno.env.get("RECIPE_PARSER_INTERNAL_TOKEN");
    if (!parserToken) {
      return jsonResponse({ error: "Parser-Service ist nicht konfiguriert.", job_id: fallbackJobId }, 502);
    }

    await supabaseAdmin
      .from("home_rezept_import_jobs")
      .update({
        status: "ai_extract",
        progress: 90,
        progress_message: "Rezept wird mit OpenAI analysiert.",
        error_message: null,
      })
      .eq("id", fallbackJobId);

    const callbackUrl = `${Deno.env.get("SUPABASE_PUBLIC_URL") || Deno.env.get("SUPABASE_URL")}/functions/v1/recipe-import-finalize`;
    const finalizeRes = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${parserToken}`,
      },
      body: JSON.stringify({
        job_id: fallbackJobId,
        source: retryJob.raw_metadata || {},
        web_extract: retryJob.raw_web_extract || null,
        transcript: retryJob.raw_transcript || "",
        caption_transcript: "",
        segments: [],
        force_ai_provider: "openai",
        transcription_engine: retryJob.transcription_engine,
        transcription_model: retryJob.transcription_model,
        transcription_device: retryJob.transcription_device,
        transcription_compute_type: retryJob.transcription_compute_type,
        transcription_fallback_used: retryJob.transcription_fallback_used,
        transcription_warnings: retryJob.transcription_warnings || [],
      }),
    });
    const finalizeText = await finalizeRes.text().catch(() => "");
    let finalizeJson: Record<string, unknown> = {};
    try {
      finalizeJson = finalizeText ? JSON.parse(finalizeText) : {};
    } catch {
      finalizeJson = { error: finalizeText };
    }
    if (!finalizeRes.ok) {
      return jsonResponse({
        error: finalizeJson.error || "OpenAI-Fallback fehlgeschlagen.",
        detail: finalizeJson.detail || finalizeText,
        job_id: fallbackJobId,
      }, finalizeRes.status);
    }
    return jsonResponse({
      ...finalizeJson,
      status: finalizeJson.status || "queued",
      job_id: fallbackJobId,
      message: "OpenAI-Fallback wurde gestartet.",
    });
  }

  const platform = platformFromUrl(url);
  const videoImport = isVideoPlatform(platform);
  if (videoImport && settings?.kochbuch_video_import_enabled === false) {
    return jsonResponse({ error: "Videoimport ist deaktiviert." }, 403);
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  let limitQuery = supabaseAdmin
    .from("home_rezept_import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .neq("status", "failed")
    .gte("created_at", since.toISOString());
  limitQuery = videoImport
    ? limitQuery.in("quelle_plattform", ["youtube", "tiktok", "instagram"])
    : limitQuery.eq("quelle_plattform", "web");
  const { count } = await limitQuery;
  const limit = videoImport
    ? Number(settings?.kochbuch_daily_video_import_limit ?? 5)
    : Number(settings?.kochbuch_daily_web_import_limit ?? 20);
  if ((count || 0) >= limit) return jsonResponse({ error: "Tageslimit fuer Kochbuch-Importe erreicht." }, 429);

  const mode = normalizeMode(body.mode || settings?.kochbuch_default_analyse_modus || (videoImport ? "combined" : "web"));
  const location = String(body.location || settings?.kochbuch_default_location || "Wien, Österreich").trim();

  const { data: job, error: jobError } = await supabaseAdmin
    .from("home_rezept_import_jobs")
    .insert({
      household_id: householdId,
      user_id: user.id,
      quelle_url: url,
      quelle_plattform: platform,
      standort: location,
      sprache: targetLocale,
      ziel_locale: targetLocale,
      analyse_modus: mode,
      status: "queued",
      progress: 5,
      progress_message: "Import wurde gestartet.",
    })
    .select("*")
    .single();
  if (jobError) return jsonResponse({ error: jobError.message }, 500);

  const parserUrl = Deno.env.get("RECIPE_PARSER_URL");
  const parserToken = Deno.env.get("RECIPE_PARSER_INTERNAL_TOKEN");
  if (!parserUrl || !parserToken) {
    await supabaseAdmin
      .from("home_rezept_import_jobs")
      .update({ status: "failed", error_message: "Parser-Service ist nicht konfiguriert.", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return jsonResponse({ error: "Parser-Service ist nicht konfiguriert.", job_id: job.id }, 502);
  }

  const normalizedParserUrl = parserUrl.replace(/\/$/, "");
  try {
    const healthRes = await fetch(`${normalizedParserUrl}/health`, { method: "GET" });
    if (!healthRes.ok) {
      const healthText = await healthRes.text().catch(() => "");
      throw new Error(`Parser health HTTP ${healthRes.status}: ${truncate(healthText)}`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("home_rezept_import_jobs")
      .update({
        status: "failed",
        progress: 100,
        progress_message: "Parser-Service Healthcheck fehlgeschlagen.",
        error_message: detail,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return jsonResponse({
      error: "Parser-Service konnte nicht erreicht werden.",
      detail,
      parser_url: normalizedParserUrl,
      job_id: job.id,
    }, 502);
  }

  const callbackUrl = `${Deno.env.get("SUPABASE_PUBLIC_URL") || Deno.env.get("SUPABASE_URL")}/functions/v1/recipe-import-finalize`;
  try {
    const parserRes = await fetch(`${normalizedParserUrl}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${parserToken}`,
      },
      body: JSON.stringify({
        job_id: job.id,
        url,
        mode,
        platform,
        location,
        target_locale: targetLocale,
        household_id: householdId,
        user_id: user.id,
        callback_url: callbackUrl,
        settings: {
          transcription_provider: settings?.kochbuch_transcription_provider || "local_auto_fallback_openai",
          whisper_model: settings?.kochbuch_local_whisper_model || "small",
          whisper_device: settings?.kochbuch_whisper_device || "auto",
          cpu_compute_type: settings?.kochbuch_whisper_cpu_compute_type || "int8",
          gpu_compute_type: settings?.kochbuch_whisper_gpu_compute_type || "float16",
          whisper_cpp_fallback_enabled: settings?.kochbuch_whisper_cpp_fallback_enabled !== false,
          openai_transcription_fallback_enabled: settings?.kochbuch_openai_transcription_fallback_enabled !== false && Boolean(settings?.openai_api_key),
          max_video_minutes: settings?.kochbuch_max_video_minutes || 30,
          extract_costs: settings?.kochbuch_extract_costs !== false,
          extract_macros: settings?.kochbuch_extract_macros !== false,
          use_moderation: settings?.kochbuch_use_moderation !== false,
        },
      }),
    });
    if (!parserRes.ok) {
      const parserText = await parserRes.text().catch(() => "");
      throw new Error(`Parser jobs HTTP ${parserRes.status}: ${truncate(parserText)}`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("home_rezept_import_jobs")
      .update({
        status: "failed",
        progress: 100,
        progress_message: "Parser-Service konnte nicht erreicht werden.",
        error_message: detail,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return jsonResponse({
      error: "Parser-Service konnte nicht erreicht werden.",
      detail,
      parser_url: normalizedParserUrl,
      job_id: job.id,
    }, 502);
  }

  return jsonResponse({
    status: "queued",
    job_id: job.id,
    progress: 5,
    message: "Import wurde gestartet.",
  });
});
