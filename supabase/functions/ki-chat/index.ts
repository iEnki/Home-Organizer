// Supabase Edge Function: ki-chat
// Serverseitiger KI-Proxy fuer Haushalts-KI (OpenAI/Ollama).
// Mitglieder duerfen KI nutzen, Schluessel bleiben serverseitig.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

type ChatMessage = { role: string; content: string | ContentPart[] };
type ResponseFormat =
  | { type: "json_object" }
  | { type: string; [key: string]: unknown };

function injectJsonInstruction(messages: ChatMessage[]): ChatMessage[] {
  const instruction =
    "Antworte AUSSCHLIESSLICH mit gueltigem JSON. Kein Erklaerungstext, kein Markdown, keine Code-Bloecke.";
  const idx = messages.findIndex((m) => m.role === "system");
  if (idx !== -1 && typeof messages[idx].content === "string") {
    const patched = [...messages];
    patched[idx] = { ...patched[idx], content: `${patched[idx].content}\n\n${instruction}` };
    return patched;
  }
  return [{ role: "system", content: instruction }, ...messages];
}

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
  const messages = (payload?.messages ?? []) as ChatMessage[];
  const requestedModel = typeof payload?.model === "string" ? payload.model : undefined;
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.2;
  const responseFormat =
    payload?.response_format && typeof payload.response_format === "object"
      ? (payload.response_format as ResponseFormat)
      : undefined;

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
    .select("ki_provider, openai_api_key, ollama_base_url, ollama_model")
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

  const provider = settings.ki_provider || "openai";

  try {
    if (provider === "ollama" && settings.ollama_base_url) {
      const base = settings.ollama_base_url.replace(/\/$/, "");
      // Wichtig: Bei Ollama niemals blind das vom Client angeforderte Modell nutzen.
      // Der Frontend-Default ist oft "gpt-4o" und fuehrt sonst zu "model not found".
      const ollamaModel = (settings.ollama_model || "llama3.2").trim();
      const ollamaMessages =
        responseFormat?.type === "json_object" ? injectJsonInstruction(messages) : messages;
      const ollamaRes = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          messages: ollamaMessages,
          temperature,
          ...(responseFormat?.type === "json_object" ? { format: "json" } : {}),
        }),
      });

      const ollamaJson = await ollamaRes.json().catch(() => ({}));
      if (!ollamaRes.ok) {
        return errorResponse({
          httpStatus: 502,
          code: "UPSTREAM_ERROR",
          message: ollamaJson?.error?.message || ollamaJson?.error || `Ollama HTTP ${ollamaRes.status}`,
          provider: "ollama",
          status: ollamaRes.status,
          retryable: ollamaRes.status >= 500,
        });
      }

      return new Response(JSON.stringify(ollamaJson), {
        headers: jsonHeaders,
      });
    }

    const openaiKey = settings.openai_api_key;
    if (!openaiKey) {
      return errorResponse({
        httpStatus: 409,
        code: "KI_NOT_CONFIGURED",
        message: "OpenAI API-Key ist im Haushalt nicht konfiguriert.",
        provider: "openai",
        status: 409,
        retryable: false,
      });
    }

    const openaiModel = requestedModel || "gpt-4o";
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages,
        temperature,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    const openaiJson = await openaiRes.json().catch(() => ({}));
    if (!openaiRes.ok) {
      return errorResponse({
        httpStatus: 502,
        code: "UPSTREAM_ERROR",
        message: openaiJson?.error?.message || `OpenAI HTTP ${openaiRes.status}`,
        provider: "openai",
        status: openaiRes.status,
        retryable: openaiRes.status >= 500 || openaiRes.status === 429,
      });
    }

    return new Response(JSON.stringify(openaiJson), {
      headers: jsonHeaders,
    });
  } catch (err: any) {
    return errorResponse({
      httpStatus: 500,
      code: "KI_PROXY_ERROR",
      message: err?.message || "KI-Proxy Fehler",
      provider: provider === "ollama" ? "ollama" : "openai",
      status: 500,
      retryable: true,
    });
  }
});
