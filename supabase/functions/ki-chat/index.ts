// Supabase Edge Function: ki-chat
// Serverseitiger KI-Proxy fuer Haushalts-KI (OpenAI/Ollama/LM Studio/Claude).
// Mitglieder duerfen KI nutzen, Schluessel bleiben serverseitig.
// Provider-Logik liegt in ../_shared/kiProviders.ts (gemeinsam mit ki-vision
// und recipe-import-*).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callChatProvider,
  resolveProvider,
  type KiSettingsRow,
} from "../_shared/kiProviders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ResponseFormat =
  | { type: "json_object" }
  | { type: string; [key: string]: unknown };

const parseJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const errorResponse = ({
  httpStatus,
  code,
  message,
  provider = null,
  status = null,
  retryable = false,
}: {
  httpStatus: number;
  code: string;
  message: string;
  provider?: string | null;
  status?: number | null;
  retryable?: boolean;
}) =>
  new Response(
    JSON.stringify({
      code,
      message,
      provider,
      status,
      retryable,
    }),
    { status: httpStatus, headers: jsonHeaders },
  );

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse({
      httpStatus: 401,
      code: "AUTH_REQUIRED",
      message: "Nicht authentifiziert.",
      status: 401,
      retryable: false,
    });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse({
      httpStatus: 401,
      code: "AUTH_REQUIRED",
      message: "Nicht authentifiziert.",
      status: 401,
      retryable: false,
    });
  }

  const payload = await parseJson(req);
  const messages = (payload?.messages ?? []) as Record<string, unknown>[];
  const requestedModel = typeof payload?.model === "string" ? payload.model : undefined;
  const context = typeof payload?.context === "string" ? payload.context : undefined;
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.2;
  const responseFormat =
    payload?.response_format && typeof payload.response_format === "object"
      ? (payload.response_format as ResponseFormat)
      : undefined;
  const tools = Array.isArray(payload?.tools) && payload.tools.length > 0
    ? (payload.tools as Record<string, unknown>[])
    : undefined;
  const toolChoice = payload?.tool_choice ?? undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return errorResponse({
      httpStatus: 400,
      code: "INVALID_REQUEST",
      message: "messages ist erforderlich.",
      status: 400,
      retryable: false,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return errorResponse({
      httpStatus: 500,
      code: "HOUSEHOLD_LOOKUP_FAILED",
      message: membershipError.message,
      status: 500,
      retryable: true,
    });
  }
  if (!membership?.household_id) {
    return errorResponse({
      httpStatus: 409,
      code: "HOUSEHOLD_REQUIRED",
      message: "Kein aktiver Haushalt vorhanden.",
      status: 409,
      retryable: false,
    });
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("household_settings")
    .select(
      "ki_provider, openai_api_key, openai_model, ollama_base_url, ollama_model, " +
        "lmstudio_base_url, lmstudio_model, lmstudio_api_key, anthropic_api_key, claude_model, " +
        "kochbuch_ai_model, kochbuch_ki_provider, kochbuch_openai_model, kochbuch_ollama_model, " +
        "kochbuch_lmstudio_model, kochbuch_claude_model, kochbuch_ollama_thinking_enabled, " +
        "assistant_ki_provider, assistant_openai_model, assistant_ollama_model, " +
        "assistant_lmstudio_model, assistant_claude_model, assistant_ollama_thinking_enabled",
    )
    .eq("household_id", membership.household_id)
    .maybeSingle();

  if (settingsError) {
    return errorResponse({
      httpStatus: 500,
      code: "SETTINGS_LOOKUP_FAILED",
      message: settingsError.message,
      status: 500,
      retryable: true,
    });
  }
  if (!settings) {
    return errorResponse({
      httpStatus: 409,
      code: "KI_NOT_CONFIGURED",
      message: "Keine KI-Einstellungen fuer diesen Haushalt gefunden.",
      status: 409,
      retryable: false,
    });
  }

  const resolved = resolveProvider(settings as KiSettingsRow, context, { requestedModel });

  if (!resolved.configured) {
    return errorResponse({
      httpStatus: 409,
      code: "KI_NOT_CONFIGURED",
      message: resolved.notConfiguredMessage,
      provider: resolved.provider,
      status: 409,
      retryable: false,
    });
  }

  try {
    const result = await callChatProvider(resolved, {
      messages,
      tools,
      toolChoice,
      responseFormat,
      temperature,
    });

    if (!result.ok) {
      return errorResponse({
        httpStatus: 502,
        code: result.code,
        message: result.message,
        provider: resolved.provider,
        status: result.status,
        retryable: result.retryable,
      });
    }

    return new Response(JSON.stringify(result.json), {
      headers: jsonHeaders,
    });
  } catch (err) {
    return errorResponse({
      httpStatus: 500,
      code: "KI_PROXY_ERROR",
      message: err instanceof Error ? err.message : "KI-Proxy Fehler",
      provider: resolved.provider,
      status: 500,
      retryable: true,
    });
  }
});
