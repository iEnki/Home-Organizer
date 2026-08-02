// Supabase Edge Function: ki-vision
// Zentraler Bild-Proxy fuer den Rechnungsscanner.
//
// POST /
//   mode = "chatgpt_vision"   -> OpenAI Responses Vision (bildanalyse_openai_api_key, fallback: openai_api_key)
//   mode = "ocr_ollama"       -> Ollama Vision (ollama_base_url + ollama_vision_model)
//   mode = "lmstudio_vision"  -> LM Studio Vision (lmstudio_base_url + lmstudio_vision_model)
//   mode = "claude_vision"    -> Claude/Anthropic Vision (anthropic_api_key + claude_model)
//
// Gibt immer { status: "ok", text: string } zurueck.
//
// WICHTIG: KI_RECHNUNG_PROMPT_SERVER muss identisch mit
// KI_RECHNUNG_PROMPT_VISION in rechnungAnalyse.js gehalten werden!

import {
  ANTHROPIC_API_URL,
  anthropicHeaders,
  CLAUDE_DEFAULT_MODEL,
} from "../_shared/kiProviders.ts";
import {
  callOpenAiVisionResponse,
  extractOpenAiResponseText,
} from "../_shared/openaiModels.ts";
import {
  fetchFirstAvailableSupabaseJson,
  requireSupabaseOk,
  requiredEnv,
  supabaseRestHeaders,
  supabaseServiceCandidates,
} from "../_shared/supabaseHttp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VISION_PROVIDER_TIMEOUT_MS = 150_000;
const FUNCTION_VERSION = "ki-vision-2026-07-26.2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function providerMessage(provider: string, status: number, payload: any) {
  return payload?.error?.message
    || payload?.error
    || payload?.message
    || `${provider} HTTP ${status}`;
}

function providerError(provider: string, status: number, detail: string, code = "vision_provider_error") {
  return jsonResponse({
    error: detail,
    message: detail,
    provider,
    provider_status: status,
    code,
    function_version: FUNCTION_VERSION,
  }, status);
}

async function fetchJsonWithTimeout(provider: string, url: string, init: RequestInit, timeoutMs = VISION_PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } catch (error) {
    const err = error as Error;
    if (err?.name === "AbortError") {
      return {
        response: new Response(null, { status: 504 }),
        payload: {
          error: {
            message: `${provider} hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.`,
          },
        },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function getAuthenticatedUser(authHeader: string) {
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  return requireSupabaseOk(await fetchFirstAvailableSupabaseJson(
    supabaseServiceCandidates(
      Deno.env.get("SUPABASE_AUTH_URL"),
      "/user",
      "/auth/v1/user",
    ),
    {
      method: "GET",
      headers: {
        "apikey": anonKey,
        "Authorization": authHeader,
      },
    },
  ));
}

async function loadMembership(userId: string) {
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const query = `/household_members?select=household_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const rows = requireSupabaseOk(await fetchFirstAvailableSupabaseJson(
    supabaseServiceCandidates(
      Deno.env.get("SUPABASE_REST_URL"),
      query,
      `/rest/v1${query}`,
    ),
    {
      method: "GET",
      headers: supabaseRestHeaders(serviceKey),
    },
  ));
  return Array.isArray(rows) ? rows[0] : null;
}

async function loadVisionSettings(householdId: string) {
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const select = "bildanalyse_openai_api_key,openai_api_key,openai_model,bildanalyse_openai_model,ollama_base_url,ollama_model,ollama_vision_model,lmstudio_base_url,lmstudio_api_key,lmstudio_model,lmstudio_vision_model,anthropic_api_key,claude_model";
  const query = `/household_settings?select=${encodeURIComponent(select)}&household_id=eq.${encodeURIComponent(householdId)}&limit=1`;
  const rows = requireSupabaseOk(await fetchFirstAvailableSupabaseJson(
    supabaseServiceCandidates(
      Deno.env.get("SUPABASE_REST_URL"),
      query,
      `/rest/v1${query}`,
    ),
    {
      method: "GET",
      headers: supabaseRestHeaders(serviceKey),
    },
  ));
  return Array.isArray(rows) ? rows[0] : null;
}

function resolveOpenAiVisionModel(settings: any) {
  const bildanalyseModel = String(settings?.bildanalyse_openai_model || "").trim();
  const globalModel = String(settings?.openai_model || "").trim();
  if (bildanalyseModel) return { model: bildanalyseModel, source: "bildanalyse" };
  if (globalModel) return { model: globalModel, source: "ki_settings" };
  return { model: "gpt-4o", source: "default" };
}

async function diagnoseOpenAi(openaiKey: string | null | undefined) {
  if (!openaiKey) {
    return {
      configured: false,
      ok: false,
      status: 409,
      error: "Kein OpenAI API-Key fuer die Diagnose vorhanden.",
    };
  }

  try {
    const result = await fetchJsonWithTimeout("OpenAI", "https://api.openai.com/v1/models", {
      method: "GET",
      headers: { "Authorization": `Bearer ${openaiKey}` },
    }, 12_000);

    return {
      configured: true,
      ok: result.response.ok,
      status: result.response.status,
      error: result.response.ok ? null : providerMessage("OpenAI", result.response.status, result.payload),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      status: 502,
      error: safeErrorMessage(error),
      code: "vision_provider_unreachable",
    };
  }
}

// WICHTIG: Muss identisch mit KI_RECHNUNG_PROMPT_VISION in rechnungAnalyse.js gehalten werden!
const KI_RECHNUNG_PROMPT_SERVER = `Du bist ein bilingualer Rechnungs-Analyse-Assistent. Analysiere das Bild dieser Rechnung oder dieses Receipts und gib ausschliesslich ein JSON-Objekt zurueck (kein Markdown, keine Erklaerungen):

{
  "haendler": "Name des Haendlers oder null",
  "datum": "YYYY-MM-DD oder null",
  "gesamt": 49.99,
  "positionen": [
    {
      "name": "Produktname wie auf Rechnung",
      "menge": 1,
      "einheit": "Stueck",
      "einzelpreis": 9.99,
      "gesamtpreis": 9.99,
      "obergruppe": "lebensmittel | getraenke | reinigung | drogerie | elektronik | moebel | kleidung | baumarkt | keine_zuordnung",
      "confidence": 0.91
    }
  ]
}

Wichtige Regeln:
- Das Dokument kann Deutsch oder Englisch sein. Erkenne beide Sprachen gleichwertig.
- Produktnamen, Haendlernamen, Rechnungsnummern und Artikeltexte originalgetreu aus dem Dokument uebernehmen.
- Die JSON-Feldnamen bleiben exakt wie im Schema, unabhaengig von der Dokumentsprache.
- einzelpreis = Preis pro Einheit (NICHT der Zeilengesamtpreis)
  Kraftstoff-Beispiel: menge=33.43, einheit="Liter", einzelpreis=1.439, gesamtpreis=48.11
  Stueckware-Beispiel: menge=2, einheit="Stueck", einzelpreis=4.99, gesamtpreis=9.98
- einheit: "Liter", "Stueck", "kg", "Pack", "Flasche", "m" etc.
- gesamtpreis = einzelpreis x menge
- Dezimalpunkte fuer Zahlen (kein Komma). Unbekannte Felder auf null.`;

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return jsonResponse({
      status: "ok",
      function: "ki-vision",
      function_version: FUNCTION_VERSION,
    });
  }

  // Auth pruefen
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({
      error: "Unauthorized",
      message: "Unauthorized",
      function_version: FUNCTION_VERSION,
    }, 401);
  }

  let user: any;
  try {
    user = await getAuthenticatedUser(authHeader);
  } catch {
    return jsonResponse({
      error: "Unauthorized",
      message: "Unauthorized",
      function_version: FUNCTION_VERSION,
    }, 401);
  }

  // Haushalt des Users ermitteln
  const membership = await loadMembership(user.id);

  if (!membership?.household_id) {
    return jsonResponse({
      error: "Kein aktiver Haushalt vorhanden.",
      message: "Kein aktiver Haushalt vorhanden.",
      function_version: FUNCTION_VERSION,
    }, 409);
  }

  if (req.method !== "POST") {
    return jsonResponse({
      error: "Method Not Allowed",
      message: "Method Not Allowed",
      function_version: FUNCTION_VERSION,
    }, 405);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({
      error: "Ungueltige JSON-Payload.",
      message: "Ungueltige JSON-Payload.",
      function_version: FUNCTION_VERSION,
    }, 400);
  }

  const { mode, file_base64, mime_type, prompt, locale } = payload ?? {};

  if (mode === "diagnostics") {
    const settings = await loadVisionSettings(membership.household_id);
    const openaiKey = settings?.bildanalyse_openai_api_key || settings?.openai_api_key;
    const configSource = settings?.bildanalyse_openai_api_key ? "bildanalyse" : settings?.openai_api_key ? "ki_settings" : null;
    const modelInfo = resolveOpenAiVisionModel(settings);
    const openai = await diagnoseOpenAi(openaiKey);

    return jsonResponse({
      status: openai.ok ? "ok" : "error",
      function: "ki-vision",
      function_version: FUNCTION_VERSION,
      household_id_present: Boolean(membership.household_id),
      mode: "diagnostics",
      config_source: configSource,
      openai_model: settings?.openai_model || null,
      bildanalyse_openai_model: settings?.bildanalyse_openai_model || null,
      effective_model: modelInfo.model,
      model_source: modelInfo.source,
      keys: {
        bildanalyse_openai_api_key_set: Boolean(settings?.bildanalyse_openai_api_key),
        openai_api_key_set: Boolean(settings?.openai_api_key),
      },
      openai,
    }, openai.ok ? 200 : 502);
  }

  if (!file_base64 || !mime_type) {
    return jsonResponse({
      error: "file_base64 und mime_type sind erforderlich.",
      message: "file_base64 und mime_type sind erforderlich.",
      function_version: FUNCTION_VERSION,
    }, 400);
  }

  // ── ChatGPT Vision ────────────────────────────────────────────────────────
  if (mode === "chatgpt_vision") {
    const visionSettings = await loadVisionSettings(membership.household_id);

    const openaiKey = visionSettings?.bildanalyse_openai_api_key || visionSettings?.openai_api_key;
    if (!openaiKey) {
      return jsonResponse({
        error: "Kein OpenAI API-Key konfiguriert. Bitte unter Profil -> KI-Einstellungen oder Bildanalyse einen Key hinterlegen.",
        message: "Kein OpenAI API-Key konfiguriert. Bitte unter Profil -> KI-Einstellungen oder Bildanalyse einen Key hinterlegen.",
        function_version: FUNCTION_VERSION,
      }, 409);
    }
    const configSource = visionSettings?.bildanalyse_openai_api_key ? "bildanalyse" : "ki_settings";
    const modelInfo = resolveOpenAiVisionModel(visionSettings);

    const outputLanguage = locale === "en-GB" || locale === "en" ? "English (United Kingdom)" : "German";
    const visionPrompt = `${prompt?.trim() || KI_RECHNUNG_PROMPT_SERVER}\n\nZiel-Ausgabesprache fuer natuerliche Texte: ${outputLanguage}. JSON-Feldnamen bleiben unveraendert.`;
    let openaiResult;
    try {
      openaiResult = await callOpenAiVisionResponse({
        apiKey: openaiKey,
        model: modelInfo.model,
        prompt: visionPrompt,
        imageUrl: `data:${mime_type};base64,${file_base64}`,
        maxOutputTokens: 1800,
        timeoutMs: VISION_PROVIDER_TIMEOUT_MS,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return providerError(
        "openai",
        isTimeout ? 504 : 502,
        isTimeout
          ? "OpenAI Vision hat nicht rechtzeitig geantwortet. Bitte versuche es erneut."
          : `OpenAI Vision ist nicht erreichbar: ${safeErrorMessage(error)}`,
        isTimeout ? "vision_provider_timeout" : "vision_provider_unreachable",
      );
    }

    const openaiRes = openaiResult.response;
    const openaiJson = openaiResult.payload;
    if (!openaiRes.ok) {
      const status = openaiRes.status === 504 ? 504 : 502;
      const detail = `${providerMessage("OpenAI", openaiRes.status, openaiJson)} Modell: ${modelInfo.model}. Fuer Bildanalyse muss das Modell Bild-Input unterstuetzen.`;
      return providerError("openai", status, detail, openaiRes.status === 504 ? "vision_provider_timeout" : "vision_provider_error");
    }

    const output = extractOpenAiResponseText(openaiJson);
    if (output.refusal) {
      return providerError("openai", 502, `OpenAI hat die Bildanalyse abgelehnt: ${output.refusal}`, "vision_provider_refusal");
    }
    if (!output.text) {
      return providerError("openai", 502, "OpenAI hat keine Textausgabe fuer die Bildanalyse geliefert.", "vision_provider_empty_response");
    }
    return new Response(
      JSON.stringify({
        status: "ok",
        text: output.text,
        extractor: "chatgpt_vision",
        config_source: configSource,
        model: modelInfo.model,
        model_source: modelInfo.source,
        function_version: FUNCTION_VERSION,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Ollama Vision ─────────────────────────────────────────────────────────
  if (mode === "ocr_ollama") {
    const s = await loadVisionSettings(membership.household_id);

    if (!s?.ollama_base_url) {
      return jsonResponse({
        error: "Kein Ollama-Server konfiguriert. Bitte unter Profil -> KI-Assistent eine Ollama-URL hinterlegen.",
        message: "Kein Ollama-Server konfiguriert. Bitte unter Profil -> KI-Assistent eine Ollama-URL hinterlegen.",
        function_version: FUNCTION_VERSION,
      }, 409);
    }

    const ollamaBase = s.ollama_base_url.replace(/\/$/, "");
    // Vision-Modell bevorzugt; Fallback auf Text-Modell, dann "llava"
    const ollamaModel = s.ollama_vision_model || s.ollama_model || "llava";
    const outputLanguage = locale === "en-GB" || locale === "en" ? "English (United Kingdom)" : "German";
    const ocrPrompt = `${prompt?.trim() || KI_RECHNUNG_PROMPT_SERVER}\n\nZiel-Ausgabesprache fuer natuerliche Texte: ${outputLanguage}. JSON-Feldnamen bleiben unveraendert.`;

    let ollamaResult;
    try {
      ollamaResult = await fetchJsonWithTimeout("Ollama", `${ollamaBase}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mime_type};base64,${file_base64}` } },
              { type: "text", text: ocrPrompt },
            ],
          }],
          temperature: 0.1,
          max_tokens: 1800,
          stream: false,
        }),
      });
    } catch (error) {
      return providerError("ollama", 502, `Ollama Vision ist nicht erreichbar: ${safeErrorMessage(error)}`, "vision_provider_unreachable");
    }

    const ollamaRes = ollamaResult.response;
    const ollamaJson = ollamaResult.payload;
    if (!ollamaRes.ok) {
      const status = ollamaRes.status === 504 ? 504 : 502;
      return providerError("ollama", status, providerMessage("Ollama", ollamaRes.status, ollamaJson), ollamaRes.status === 504 ? "vision_provider_timeout" : "vision_provider_error");
    }

    const content = (ollamaJson as any)?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return new Response(
      JSON.stringify({ status: "ok", text: content, extractor: "ocr_ollama", function_version: FUNCTION_VERSION }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── LM Studio Vision ──────────────────────────────────────────────────────
  if (mode === "lmstudio_vision") {
    const s = await loadVisionSettings(membership.household_id);

    if (!s?.lmstudio_base_url) {
      return jsonResponse({
        error: "Kein LM Studio-Server konfiguriert. Bitte unter Profil -> KI-Einstellungen eine LM Studio-URL hinterlegen.",
        message: "Kein LM Studio-Server konfiguriert. Bitte unter Profil -> KI-Einstellungen eine LM Studio-URL hinterlegen.",
        function_version: FUNCTION_VERSION,
      }, 409);
    }

    const lmBase = s.lmstudio_base_url.replace(/\/$/, "");
    const lmModel = s.lmstudio_vision_model || s.lmstudio_model;
    if (!lmModel) {
      return jsonResponse({
        error: "Kein LM Studio Vision-Modell konfiguriert. Bitte unter Profil -> Bildanalyse ein Modell hinterlegen.",
        message: "Kein LM Studio Vision-Modell konfiguriert. Bitte unter Profil -> Bildanalyse ein Modell hinterlegen.",
        function_version: FUNCTION_VERSION,
      }, 409);
    }
    const outputLanguage = locale === "en-GB" || locale === "en" ? "English (United Kingdom)" : "German";
    const lmPrompt = `${prompt?.trim() || KI_RECHNUNG_PROMPT_SERVER}\n\nZiel-Ausgabesprache fuer natuerliche Texte: ${outputLanguage}. JSON-Feldnamen bleiben unveraendert.`;

    const lmHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (s.lmstudio_api_key) lmHeaders["Authorization"] = `Bearer ${s.lmstudio_api_key}`;

    let lmResult;
    try {
      lmResult = await fetchJsonWithTimeout("LM Studio", `${lmBase}/v1/chat/completions`, {
        method: "POST",
        headers: lmHeaders,
        body: JSON.stringify({
          model: lmModel,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mime_type};base64,${file_base64}` } },
              { type: "text", text: lmPrompt },
            ],
          }],
          temperature: 0.1,
          max_tokens: 1800,
          stream: false,
        }),
      });
    } catch (error) {
      return providerError("lmstudio", 502, `LM Studio Vision ist nicht erreichbar: ${safeErrorMessage(error)}`, "vision_provider_unreachable");
    }

    const lmRes = lmResult.response;
    const lmJson = lmResult.payload;
    if (!lmRes.ok) {
      const status = lmRes.status === 504 ? 504 : 502;
      return providerError("lmstudio", status, providerMessage("LM Studio", lmRes.status, lmJson), lmRes.status === 504 ? "vision_provider_timeout" : "vision_provider_error");
    }

    const content = (lmJson as any)?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return new Response(
      JSON.stringify({ status: "ok", text: content, extractor: "lmstudio_vision", model: lmModel, function_version: FUNCTION_VERSION }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Claude Vision (Anthropic /v1/messages) ────────────────────────────────
  if (mode === "claude_vision") {
    const s = await loadVisionSettings(membership.household_id);

    if (!s?.anthropic_api_key) {
      return jsonResponse({
        error: "Kein Anthropic API-Key (Claude) konfiguriert. Bitte unter Profil -> KI-Einstellungen einen Key hinterlegen.",
        message: "Kein Anthropic API-Key (Claude) konfiguriert. Bitte unter Profil -> KI-Einstellungen einen Key hinterlegen.",
        function_version: FUNCTION_VERSION,
      }, 409);
    }

    const claudeModel = (s.claude_model || CLAUDE_DEFAULT_MODEL).trim();
    const outputLanguage = locale === "en-GB" || locale === "en" ? "English (United Kingdom)" : "German";
    const claudePrompt = `${prompt?.trim() || KI_RECHNUNG_PROMPT_SERVER}\n\nZiel-Ausgabesprache fuer natuerliche Texte: ${outputLanguage}. JSON-Feldnamen bleiben unveraendert.`;

    let claudeResult;
    try {
      // WICHTIG: kein temperature/thinking an claude-opus-4-8 senden (400), max_tokens ist Pflicht.
      claudeResult = await fetchJsonWithTimeout("Claude", ANTHROPIC_API_URL, {
        method: "POST",
        headers: anthropicHeaders(s.anthropic_api_key),
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 1800,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime_type, data: file_base64 } },
              { type: "text", text: claudePrompt },
            ],
          }],
        }),
      });
    } catch (error) {
      return providerError("claude", 502, `Claude Vision ist nicht erreichbar: ${safeErrorMessage(error)}`, "vision_provider_unreachable");
    }

    const claudeRes = claudeResult.response;
    const claudeJson = claudeResult.payload as any;
    if (!claudeRes.ok) {
      const status = claudeRes.status === 504 ? 504 : 502;
      const detail = `${providerMessage("Claude", claudeRes.status, claudeJson)} Modell: ${claudeModel}.`;
      return providerError("claude", status, detail, claudeRes.status === 504 ? "vision_provider_timeout" : "vision_provider_error");
    }
    if (claudeJson?.stop_reason === "refusal") {
      return providerError("claude", 502, "Claude hat die Bildanalyse aus Sicherheitsgruenden abgelehnt.", "vision_provider_error");
    }

    const content = (Array.isArray(claudeJson?.content) ? claudeJson.content : [])
      .filter((block: any) => block?.type === "text")
      .map((block: any) => block.text || "")
      .join("")
      .trim();
    return new Response(
      JSON.stringify({ status: "ok", text: content, extractor: "claude_vision", model: claudeModel, function_version: FUNCTION_VERSION }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Unbekannter Modus ─────────────────────────────────────────────────────
  return jsonResponse({
    error: `Unbekannter Modus: ${mode}. Erlaubt: chatgpt_vision, ocr_ollama, lmstudio_vision, claude_vision, diagnostics`,
    message: `Unbekannter Modus: ${mode}. Erlaubt: chatgpt_vision, ocr_ollama, lmstudio_vision, claude_vision, diagnostics`,
    function_version: FUNCTION_VERSION,
  }, 400);
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    const message = safeErrorMessage(error);
    return jsonResponse({
      error: message,
      message,
      code: "ki_vision_unhandled_error",
      function_version: FUNCTION_VERSION,
    }, 500);
  }
});
