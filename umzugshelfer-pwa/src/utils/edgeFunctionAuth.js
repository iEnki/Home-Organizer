import { supabase } from "../supabaseClient";

function functionErrorStatus(error) {
  return Number(error?.context?.status || error?.status || 0);
}

export class EdgeFunctionRequestError extends Error {
  constructor({
    code = "EDGE_FUNCTION_ERROR",
    message,
    status = 0,
    retryable = false,
    details = null,
  } = {}) {
    super(message || "Edge Function Fehler");
    this.name = "EdgeFunctionRequestError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

const parseFetchPayload = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => "");
  return text ? { message: text } : {};
};

const functionUrl = (functionName) => {
  const supabaseUrl = String(process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) {
    throw new EdgeFunctionRequestError({
      code: "SUPABASE_URL_MISSING",
      message: "REACT_APP_SUPABASE_URL fehlt.",
    });
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

const functionAnonKey = () => {
  const anonKey = String(process.env.REACT_APP_SUPABASE_ANON_KEY || "");
  if (!anonKey) {
    throw new EdgeFunctionRequestError({
      code: "SUPABASE_ANON_KEY_MISSING",
      message: "REACT_APP_SUPABASE_ANON_KEY fehlt.",
    });
  }
  return anonKey;
};

/**
 * Authentifizierter JSON-Aufruf fuer laenger laufende Edge Functions.
 * Ein 401 erneuert die Sitzung genau einmal. Provider-/Netzwerkfehler werden
 * nicht automatisch wiederholt, damit keine KI-Anfrage doppelt abgerechnet wird.
 */
export async function fetchEdgeFunctionJsonWithAuthRetry(
  functionName,
  {
    body,
    headers = {},
    timeoutMs = 105_000,
  } = {},
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new EdgeFunctionRequestError({
      code: "AUTH_REQUIRED",
      message: "Nicht eingeloggt.",
      status: 401,
    });
  }

  const doFetch = async (token) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(functionUrl(functionName), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: functionAnonKey(),
          Authorization: `Bearer ${token}`,
          ...headers,
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new EdgeFunctionRequestError({
          code: "CLIENT_TIMEOUT",
          message: "Die KI-Anfrage hat nicht rechtzeitig geantwortet.",
          status: 504,
          retryable: true,
        });
      }
      throw new EdgeFunctionRequestError({
        code: "NETWORK_ERROR",
        message: "Der KI-Dienst ist derzeit nicht erreichbar.",
        status: 0,
        retryable: true,
        details: error,
      });
    } finally {
      window.clearTimeout(timer);
    }
  };

  let response = await doFetch(session.access_token);
  if (response.status === 401) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const freshToken = refreshData?.session?.access_token;
    if (refreshError || !freshToken) {
      throw expiredSessionError(refreshError);
    }
    response = await doFetch(freshToken);
  }

  const payload = await parseFetchPayload(response);
  if (!response.ok) {
    throw new EdgeFunctionRequestError({
      code: payload?.code || (response.status === 401 ? "AUTH_REQUIRED" : "EDGE_FUNCTION_ERROR"),
      message: payload?.message || payload?.error || `Edge Function Fehler (${response.status})`,
      status: payload?.status || response.status,
      retryable: Boolean(payload?.retryable),
      details: payload,
    });
  }
  return payload;
}

function expiredSessionError(refreshError) {
  const error = new Error(
    refreshError?.message
      ? `Sitzung konnte nicht erneuert werden: ${refreshError.message}`
      : "Sitzung abgelaufen. Bitte melde dich erneut an.",
  );
  error.name = "FunctionsAuthError";
  error.status = 401;
  error.code = "AUTH_REQUIRED";
  return error;
}

/**
 * Ruft eine authentifizierte Edge Function auf. Falls der Browser nach
 * längerer Inaktivität noch ein abgelaufenes Access-Token verwendet, wird die
 * Supabase-Sitzung genau einmal erneuert und der Aufruf mit dem neuen Token
 * wiederholt. Andere Fehler werden nicht automatisch wiederholt.
 */
export async function invokeEdgeFunctionWithAuthRetry(functionName, options) {
  const firstResult = await supabase.functions.invoke(functionName, options);
  if (!firstResult.error || functionErrorStatus(firstResult.error) !== 401) {
    return firstResult;
  }

  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const accessToken = data?.session?.access_token;
  if (refreshError || !accessToken) {
    return {
      data: null,
      error: expiredSessionError(refreshError),
    };
  }

  return supabase.functions.invoke(functionName, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
