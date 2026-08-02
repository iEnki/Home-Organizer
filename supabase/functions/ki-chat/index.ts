// Supabase Edge Function: ki-chat
// Serverseitiger KI-Proxy fuer Haushalts-KI (OpenAI/Ollama/LM Studio/Claude).
// Mitglieder duerfen KI nutzen, Schluessel bleiben serverseitig.

import {
  callChatProvider,
  resolveProvider,
  type KiSettingsRow,
} from "../_shared/kiProviders.ts";
import {
  fetchFirstAvailableSupabaseJson,
  requiredEnv,
  supabaseRestHeaders,
  supabaseServiceCandidates,
  supabaseTransportErrorCode,
} from "../_shared/supabaseHttp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-request-id",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const FUNCTION_VERSION = "ki-chat-2026-07-29.1";
const PROVIDER_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 4_096;
const MIN_MAX_TOKENS = 32;
const MAX_MAX_TOKENS = 8_192;

const SETTINGS_SELECT = [
  "ki_provider",
  "openai_api_key",
  "openai_model",
  "ollama_base_url",
  "ollama_model",
  "lmstudio_base_url",
  "lmstudio_model",
  "lmstudio_api_key",
  "anthropic_api_key",
  "claude_model",
  "kochbuch_ai_model",
  "kochbuch_ki_provider",
  "kochbuch_openai_model",
  "kochbuch_ollama_model",
  "kochbuch_lmstudio_model",
  "kochbuch_claude_model",
  "kochbuch_ollama_thinking_enabled",
  "assistant_ki_provider",
  "assistant_openai_model",
  "assistant_ollama_model",
  "assistant_lmstudio_model",
  "assistant_claude_model",
  "assistant_ollama_thinking_enabled",
].join(",");

type ResponseFormat =
  | { type: "json_object" }
  | { type: string; [key: string]: unknown };

type ErrorArgs = {
  httpStatus: number;
  code: string;
  message: string;
  provider?: string | null;
  providerStatus?: number | null;
  retryable?: boolean;
};

const parseJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

function clampMaxTokens(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_TOKENS;
  }
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.trunc(value)));
}

function providerHttpStatus(code: string) {
  if (code === "UPSTREAM_TIMEOUT") return 504;
  if (code === "RATE_LIMITED") return 429;
  if (code === "MODEL_UNAVAILABLE" || code === "TOOLS_UNSUPPORTED" || code === "CLAUDE_REFUSAL") {
    return 422;
  }
  return 502;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let stage = "request";
  let provider: string | null = null;
  let model: string | null = null;

  const responseHeaders = {
    ...jsonHeaders,
    "x-request-id": requestId,
  };

  const logCompletion = (httpStatus: number, code: string) => {
    console.log(JSON.stringify({
      event: "ki_chat_request",
      requestId,
      functionVersion: FUNCTION_VERSION,
      stage,
      provider,
      model,
      httpStatus,
      code,
      latencyMs: Date.now() - startedAt,
    }));
  };

  const fail = ({
    httpStatus,
    code,
    message,
    provider: errorProvider = provider,
    providerStatus = null,
    retryable = false,
  }: ErrorArgs) => {
    logCompletion(httpStatus, code);
    return new Response(
      JSON.stringify({
        code,
        message,
        provider: errorProvider,
        status: providerStatus,
        retryable,
        requestId,
        stage,
        latencyMs: Date.now() - startedAt,
      }),
      { status: httpStatus, headers: responseHeaders },
    );
  };

  if (req.method !== "POST") {
    return fail({
      httpStatus: 405,
      code: "METHOD_NOT_ALLOWED",
      message: "Nur POST ist erlaubt.",
      providerStatus: 405,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return fail({
      httpStatus: 401,
      code: "AUTH_REQUIRED",
      message: "Nicht authentifiziert.",
      providerStatus: 401,
    });
  }

  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  stage = "auth";
  let userResult;
  try {
    userResult = await fetchFirstAvailableSupabaseJson(
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
    );
  } catch (error) {
    const failure = supabaseTransportErrorCode(error, "AUTH_TIMEOUT", "AUTH_UNAVAILABLE");
    return fail({
      httpStatus: failure.httpStatus,
      code: failure.code,
      message: failure.messageKind === "timeout"
        ? "Die Anmeldung konnte nicht rechtzeitig geprueft werden."
        : "Der Anmeldedienst ist nicht erreichbar.",
      retryable: true,
    });
  }
  if (!userResult.response.ok || !userResult.payload?.id) {
    return fail({
      httpStatus: 401,
      code: "AUTH_REQUIRED",
      message: "Nicht authentifiziert.",
      providerStatus: userResult.response.status,
    });
  }

  const payload = await parseJson(req);
  const messages = (payload?.messages ?? []) as Record<string, unknown>[];
  const requestedModel = typeof payload?.model === "string" ? payload.model : undefined;
  const context = typeof payload?.context === "string" ? payload.context : undefined;
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.2;
  const maxTokens = clampMaxTokens(payload?.max_tokens);
  const responseFormat =
    payload?.response_format && typeof payload.response_format === "object"
      ? (payload.response_format as ResponseFormat)
      : undefined;
  const tools = Array.isArray(payload?.tools) && payload.tools.length > 0
    ? (payload.tools as Record<string, unknown>[])
    : undefined;
  const toolChoice = payload?.tool_choice ?? undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return fail({
      httpStatus: 400,
      code: "INVALID_REQUEST",
      message: "messages ist erforderlich.",
      providerStatus: 400,
    });
  }

  stage = "membership";
  const membershipQuery =
    `/household_members?select=household_id&user_id=eq.${encodeURIComponent(userResult.payload.id)}&limit=1`;
  let membershipResult;
  try {
    membershipResult = await fetchFirstAvailableSupabaseJson(
      supabaseServiceCandidates(
        Deno.env.get("SUPABASE_REST_URL"),
        membershipQuery,
        `/rest/v1${membershipQuery}`,
      ),
      { method: "GET", headers: supabaseRestHeaders(serviceKey) },
    );
  } catch (error) {
    const failure = supabaseTransportErrorCode(
      error,
      "HOUSEHOLD_TIMEOUT",
      "HOUSEHOLD_LOOKUP_FAILED",
    );
    return fail({
      httpStatus: failure.httpStatus,
      code: failure.code,
      message: failure.messageKind === "timeout"
        ? "Der Haushalt konnte nicht rechtzeitig geladen werden."
        : "Der Haushalt konnte nicht geladen werden.",
      retryable: true,
    });
  }
  if (!membershipResult.response.ok) {
    return fail({
      httpStatus: 502,
      code: "HOUSEHOLD_LOOKUP_FAILED",
      message: "Der Haushalt konnte nicht geladen werden.",
      providerStatus: membershipResult.response.status,
      retryable: membershipResult.response.status >= 500,
    });
  }
  const membership = Array.isArray(membershipResult.payload)
    ? membershipResult.payload[0]
    : null;
  if (!membership?.household_id) {
    return fail({
      httpStatus: 409,
      code: "HOUSEHOLD_REQUIRED",
      message: "Kein aktiver Haushalt vorhanden.",
      providerStatus: 409,
    });
  }

  stage = "settings";
  const settingsQuery =
    `/household_settings?select=${encodeURIComponent(SETTINGS_SELECT)}` +
    `&household_id=eq.${encodeURIComponent(membership.household_id)}&limit=1`;
  let settingsResult;
  try {
    settingsResult = await fetchFirstAvailableSupabaseJson(
      supabaseServiceCandidates(
        Deno.env.get("SUPABASE_REST_URL"),
        settingsQuery,
        `/rest/v1${settingsQuery}`,
      ),
      { method: "GET", headers: supabaseRestHeaders(serviceKey) },
    );
  } catch (error) {
    const failure = supabaseTransportErrorCode(
      error,
      "SETTINGS_TIMEOUT",
      "SETTINGS_LOOKUP_FAILED",
    );
    return fail({
      httpStatus: failure.httpStatus,
      code: failure.code,
      message: failure.messageKind === "timeout"
        ? "Die KI-Einstellungen konnten nicht rechtzeitig geladen werden."
        : "Die KI-Einstellungen konnten nicht geladen werden.",
      retryable: true,
    });
  }
  if (!settingsResult.response.ok) {
    return fail({
      httpStatus: 502,
      code: "SETTINGS_LOOKUP_FAILED",
      message: "Die KI-Einstellungen konnten nicht geladen werden.",
      providerStatus: settingsResult.response.status,
      retryable: settingsResult.response.status >= 500,
    });
  }
  const settings = Array.isArray(settingsResult.payload)
    ? settingsResult.payload[0]
    : null;
  if (!settings) {
    return fail({
      httpStatus: 409,
      code: "KI_NOT_CONFIGURED",
      message: "Keine KI-Einstellungen fuer diesen Haushalt gefunden.",
      providerStatus: 409,
    });
  }

  const resolved = resolveProvider(settings as KiSettingsRow, context, { requestedModel });
  provider = resolved.provider;
  model = resolved.model;

  if (!resolved.configured) {
    return fail({
      httpStatus: 409,
      code: "KI_NOT_CONFIGURED",
      message: resolved.notConfiguredMessage,
      provider: resolved.provider,
      providerStatus: 409,
    });
  }

  stage = "provider";
  try {
    const result = await callChatProvider(resolved, {
      messages,
      tools,
      toolChoice,
      responseFormat,
      temperature,
      maxTokens,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });

    if (!result.ok) {
      return fail({
        httpStatus: providerHttpStatus(result.code),
        code: result.code,
        message: result.message,
        provider: resolved.provider,
        providerStatus: result.status,
        retryable: result.retryable,
      });
    }

    stage = "complete";
    logCompletion(200, "OK");
    return new Response(JSON.stringify(result.json), {
      headers: responseHeaders,
    });
  } catch (error) {
    return fail({
      httpStatus: 500,
      code: "KI_PROXY_ERROR",
      message: error instanceof Error ? error.message : "KI-Proxy Fehler",
      provider: resolved.provider,
      providerStatus: 500,
      retryable: true,
    });
  }
});
