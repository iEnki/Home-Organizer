import {
  callOpenAiVisionResponse,
  extractOpenAiResponseText,
  fetchOpenAiJson,
  normaliseOpenAiModels,
  OPENAI_API_BASE,
} from "../_shared/openaiModels.ts";
import {
  callChatProvider,
  type ResolvedProvider,
} from "../_shared/kiProviders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const FUNCTION_VERSION = "openai-models-2026-07-26.3";
const SUPABASE_REQUEST_TIMEOUT_MS = 6_000;
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

function upstreamMessage(payload: any, status: number) {
  return payload?.error?.message || payload?.message || `OpenAI HTTP ${status}`;
}

function upstreamErrorCode(status: number, payload: any) {
  if (status === 401) return "OPENAI_KEY_INVALID";
  if (status === 403) return "OPENAI_PERMISSION_DENIED";
  if (status === 429) return "OPENAI_RATE_LIMIT";
  if (status >= 500) return "OPENAI_UNAVAILABLE";
  return String(payload?.error?.code || "OPENAI_REQUEST_FAILED").toUpperCase();
}

function restHeaders(token: string) {
  return {
    "apikey": token,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fetchSupabaseJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SUPABASE_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text().catch(() => "");
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFirstAvailableSupabaseJson(
  urls: string[],
  init: RequestInit,
) {
  let lastError: unknown = null;
  for (const url of [...new Set(urls.filter(Boolean))]) {
    try {
      return await fetchSupabaseJson(url, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Supabase-Dienst ist nicht erreichbar.");
}

async function loadAdminContext(authHeader: string) {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const authBaseUrl = (
    Deno.env.get("SUPABASE_AUTH_URL") || "http://auth:9999"
  ).replace(/\/$/, "");
  const restBaseUrl = (
    Deno.env.get("SUPABASE_REST_URL") || "http://rest:3000"
  ).replace(/\/$/, "");

  let userResult;
  try {
    userResult = await fetchFirstAvailableSupabaseJson(
      [
        `${authBaseUrl}/user`,
        `${supabaseUrl}/auth/v1/user`,
      ],
      {
        method: "GET",
        headers: {
          "apikey": anonKey,
          "Authorization": authHeader,
        },
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      error: jsonResponse({
        error: timedOut
          ? "Die Anmeldung konnte nicht rechtzeitig geprüft werden."
          : "Der Anmeldedienst ist nicht erreichbar.",
        code: timedOut ? "AUTH_TIMEOUT" : "AUTH_UNAVAILABLE",
        retryable: true,
      }, timedOut ? 504 : 502),
    };
  }
  if (!userResult.response.ok || !userResult.payload?.id) {
    return {
      error: jsonResponse({
        error: "Nicht authentifiziert.",
        code: "AUTH_REQUIRED",
      }, 401),
    };
  }

  const membershipQuery =
    `/household_members` +
    `?select=household_id%2Crole` +
    `&user_id=eq.${encodeURIComponent(userResult.payload.id)}` +
    `&limit=1`;
  let membershipResult;
  try {
    membershipResult = await fetchFirstAvailableSupabaseJson(
      [
        `${restBaseUrl}${membershipQuery}`,
        `${supabaseUrl}/rest/v1${membershipQuery}`,
      ],
      {
        method: "GET",
        headers: restHeaders(serviceKey),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      error: jsonResponse({
        error: timedOut
          ? "Der Haushalt konnte nicht rechtzeitig geladen werden."
          : "Der Haushalt konnte nicht geladen werden.",
        code: timedOut ? "HOUSEHOLD_TIMEOUT" : "HOUSEHOLD_UNAVAILABLE",
        retryable: true,
      }, timedOut ? 504 : 502),
    };
  }
  if (!membershipResult.response.ok) {
    return {
      error: jsonResponse({
        error: "Der Haushalt konnte nicht geladen werden.",
        code: "HOUSEHOLD_UNAVAILABLE",
        retryable: membershipResult.response.status >= 500,
      }, 502),
    };
  }
  const membership = Array.isArray(membershipResult.payload)
    ? membershipResult.payload[0]
    : null;
  if (!membership?.household_id) {
    return {
      error: jsonResponse({
        error: "Kein aktiver Haushalt vorhanden.",
        code: "HOUSEHOLD_REQUIRED",
      }, 409),
    };
  }
  if (membership.role !== "admin") {
    return {
      error: jsonResponse({
        error: "Nur Haushalts-Admins duerfen OpenAI-Modelle verwalten.",
        code: "ADMIN_REQUIRED",
      }, 403),
    };
  }

  const settingsQuery =
    `/household_settings` +
    `?select=openai_api_key%2Cbildanalyse_openai_api_key` +
    `&household_id=eq.${encodeURIComponent(membership.household_id)}` +
    `&limit=1`;
  let settingsResult;
  try {
    settingsResult = await fetchFirstAvailableSupabaseJson(
      [
        `${restBaseUrl}${settingsQuery}`,
        `${supabaseUrl}/rest/v1${settingsQuery}`,
      ],
      {
        method: "GET",
        headers: restHeaders(serviceKey),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      error: jsonResponse({
        error: timedOut
          ? "OpenAI-Einstellungen konnten nicht rechtzeitig geladen werden."
          : "OpenAI-Einstellungen konnten nicht geladen werden.",
        code: timedOut ? "SETTINGS_TIMEOUT" : "SETTINGS_UNAVAILABLE",
        retryable: true,
      }, timedOut ? 504 : 502),
    };
  }
  if (!settingsResult.response.ok) {
    return {
      error: jsonResponse({
        error: "OpenAI-Einstellungen konnten nicht geladen werden.",
        code: "SETTINGS_UNAVAILABLE",
        retryable: settingsResult.response.status >= 500,
      }, 502),
    };
  }
  const settings = Array.isArray(settingsResult.payload)
    ? settingsResult.payload[0]
    : null;
  return { settings: settings || {} };
}

function resolveKey(settings: any, keyScope: "general" | "vision") {
  if (keyScope === "vision" && settings?.bildanalyse_openai_api_key) {
    return {
      apiKey: String(settings.bildanalyse_openai_api_key),
      keySource: "bildanalyse_openai_api_key",
    };
  }
  if (settings?.openai_api_key) {
    return {
      apiKey: String(settings.openai_api_key),
      keySource: "openai_api_key",
    };
  }
  return { apiKey: "", keySource: null };
}

async function testTextModel(apiKey: string, model: string, target: string) {
  const provider: ResolvedProvider = {
    provider: "openai",
    configured: true,
    notConfiguredMessage: "",
    model,
    apiKey,
  };
  const isAssistant = target === "assistant";
  const isCookbook = target === "cookbook";
  const result = await callChatProvider(provider, {
    messages: [{
      role: "user",
      content: isCookbook
        ? 'Gib ausschliesslich {"ok":true} als JSON zurueck.'
        : isAssistant
        ? "Rufe die bereitgestellte Testfunktion auf."
        : "Antworte ausschliesslich mit OK.",
    }],
    ...(isAssistant
      ? {
        tools: [{
          type: "function",
          function: {
            name: "openai_model_test",
            description: "Bestaetigt die Tool-Calling-Kompatibilitaet.",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        }],
        toolChoice: "required",
      }
      : {}),
    ...(isCookbook ? { responseFormat: { type: "json_object" } } : {}),
    temperature: 0,
    maxTokens: 128,
    timeoutMs: 30_000,
  });
  if (!result.ok) return result;

  const message = result.json?.choices?.[0]?.message;
  if (isAssistant && !Array.isArray(message?.tool_calls)) {
    return {
      ok: false as const,
      status: 422,
      code: "TOOLS_UNSUPPORTED" as const,
      message: "Das Modell hat keinen Tool-Call erzeugt.",
      retryable: false,
    };
  }
  if (isCookbook) {
    try {
      JSON.parse(String(message?.content || ""));
    } catch {
      return {
        ok: false as const,
        status: 422,
        code: "UPSTREAM_ERROR" as const,
        message: "Das Modell hat kein gueltiges JSON geliefert.",
        retryable: false,
      };
    }
  }
  if (!isAssistant && !isCookbook && !String(message?.content || "").trim()) {
    return {
      ok: false as const,
      status: 422,
      code: "UPSTREAM_ERROR" as const,
      message: "Das Modell hat keine Textausgabe geliefert.",
      retryable: false,
    };
  }
  return result;
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return jsonResponse({
      status: "ok",
      function: "openai-models",
      function_version: FUNCTION_VERSION,
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      error: "Method Not Allowed",
      code: "METHOD_NOT_ALLOWED",
    }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({
      error: "Nicht authentifiziert.",
      code: "AUTH_REQUIRED",
    }, 401);
  }
  const context = await loadAdminContext(authHeader);
  if (context.error) return context.error;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({
      error: "Ungueltige JSON-Payload.",
      code: "INVALID_REQUEST",
    }, 400);
  }

  if (payload?.action === "list") {
    const keyScope = payload?.keyScope === "vision" ? "vision" : "general";
    const { apiKey, keySource } = resolveKey(context.settings, keyScope);
    if (!apiKey) {
      return jsonResponse({
        error: "Kein OpenAI API-Key konfiguriert.",
        code: "OPENAI_KEY_MISSING",
      }, 409);
    }

    try {
      const { response, payload: openaiPayload } = await fetchOpenAiJson(
        `${OPENAI_API_BASE}/v1/models`,
        apiKey,
        { method: "GET" },
        15_000,
      );
      if (!response.ok) {
        return jsonResponse({
          error: upstreamMessage(openaiPayload, response.status),
          code: upstreamErrorCode(response.status, openaiPayload),
          retryable: response.status === 429 || response.status >= 500,
        }, response.status);
      }
      return jsonResponse({
        models: normaliseOpenAiModels(openaiPayload, keyScope),
        keySource,
        fetchedAt: new Date().toISOString(),
        function_version: FUNCTION_VERSION,
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      return jsonResponse({
        error: timeout
          ? "OpenAI hat beim Laden der Modelle nicht rechtzeitig geantwortet."
          : "OpenAI ist nicht erreichbar.",
        code: timeout ? "OPENAI_TIMEOUT" : "OPENAI_UNAVAILABLE",
        retryable: true,
      }, timeout ? 504 : 502);
    }
  }

  if (payload?.action === "test") {
    const target =
      ["global", "assistant", "cookbook", "vision"].includes(payload?.target)
        ? payload.target
        : null;
    const model = String(payload?.model || "").trim();
    if (!target || !model) {
      return jsonResponse({
        error: "target und model sind erforderlich.",
        code: "INVALID_REQUEST",
      }, 400);
    }
    const { apiKey, keySource } = resolveKey(
      context.settings,
      target === "vision" ? "vision" : "general",
    );
    if (!apiKey) {
      return jsonResponse({
        error: "Kein OpenAI API-Key konfiguriert.",
        code: "OPENAI_KEY_MISSING",
      }, 409);
    }

    const startedAt = Date.now();
    try {
      if (target === "vision") {
        const { response, payload: openaiPayload } =
          await callOpenAiVisionResponse({
            apiKey,
            model,
            prompt: "Antworte ausschliesslich mit OK.",
            imageUrl: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
            maxOutputTokens: 32,
            timeoutMs: 30_000,
          });
        if (!response.ok) {
          return jsonResponse({
            ok: false,
            model,
            target,
            keySource,
            latencyMs: Date.now() - startedAt,
            code: upstreamErrorCode(response.status, openaiPayload),
            message: upstreamMessage(openaiPayload, response.status),
          }, response.status);
        }
        const output = extractOpenAiResponseText(openaiPayload);
        if (output.refusal || !output.text) {
          return jsonResponse({
            ok: false,
            model,
            target,
            keySource,
            latencyMs: Date.now() - startedAt,
            code: output.refusal ? "OPENAI_REFUSAL" : "OPENAI_EMPTY_RESPONSE",
            message: output.refusal ||
              "OpenAI hat keine Textausgabe geliefert.",
          }, 422);
        }
      } else {
        const result = await testTextModel(apiKey, model, target);
        if (!result.ok) {
          const timedOut = result.status === 0 &&
            /abort|timeout|timed out/i.test(result.message);
          return jsonResponse(
            {
              ok: false,
              model,
              target,
              keySource,
              latencyMs: Date.now() - startedAt,
              code: timedOut ? "OPENAI_TIMEOUT" : result.code,
              message: timedOut
                ? "OpenAI hat beim Modelltest nicht rechtzeitig geantwortet."
                : result.message,
            },
            timedOut
              ? 504
              : result.status >= 400 && result.status < 600
              ? result.status
              : 502,
          );
        }
      }
      return jsonResponse({
        ok: true,
        model,
        target,
        keySource,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      return jsonResponse({
        ok: false,
        model,
        target,
        keySource,
        latencyMs: Date.now() - startedAt,
        code: timeout ? "OPENAI_TIMEOUT" : "OPENAI_UNAVAILABLE",
        message: timeout
          ? "OpenAI hat beim Modelltest nicht rechtzeitig geantwortet."
          : "OpenAI ist nicht erreichbar.",
      }, timeout ? 504 : 502);
    }
  }

  return jsonResponse(
    { error: "Unbekannte action.", code: "INVALID_REQUEST" },
    400,
  );
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
      code: "INTERNAL_ERROR",
      function_version: FUNCTION_VERSION,
    }, 500);
  }
});
