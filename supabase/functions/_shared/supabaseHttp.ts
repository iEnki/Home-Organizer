// Gemeinsamer, timeout-geschuetzter Zugriff von Edge Functions auf
// Supabase Auth und PostgREST. Interne Service-Adressen werden bevorzugt;
// der Kong-/SUPABASE_URL-Fallback wird ausschliesslich bei Transportfehlern
// verwendet, niemals nach einer erhaltenen HTTP-Antwort.

export const SUPABASE_INTERNAL_TIMEOUT_MS = 8_000;

export type SupabaseJsonResult = {
  response: Response;
  payload: any;
};

export class SupabaseHttpError extends Error {
  status: number;
  payload: any;

  constructor(result: SupabaseJsonResult) {
    const message = result.payload?.message
      || result.payload?.error
      || `Supabase HTTP ${result.response.status}`;
    super(String(message));
    this.name = "SupabaseHttpError";
    this.status = result.response.status;
    this.payload = result.payload;
  }
}

type FetchLike = typeof fetch;

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

export function supabaseRestHeaders(token: string): Record<string, string> {
  return {
    "apikey": token,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function supabaseServiceCandidates(
  internalBaseUrl: string | undefined,
  internalPath: string,
  publicPath: string,
): string[] {
  const publicBase = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const internalBase = internalBaseUrl?.trim().replace(/\/$/, "");
  return [
    ...(internalBase ? [`${internalBase}${internalPath}`] : []),
    `${publicBase}${publicPath}`,
  ];
}

export async function fetchSupabaseJson(
  url: string,
  init: RequestInit,
  timeoutMs = SUPABASE_INTERNAL_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch,
): Promise<SupabaseJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
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

export async function fetchFirstAvailableSupabaseJson(
  urls: string[],
  init: RequestInit,
  timeoutMs = SUPABASE_INTERNAL_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch,
): Promise<SupabaseJsonResult> {
  let lastError: unknown = null;
  for (const url of [...new Set(urls.filter(Boolean))]) {
    try {
      // Eine erhaltene HTTP-Antwort ist autoritativ. Nur ein echter
      // Transportfehler darf den naechsten Kandidaten ausloesen.
      return await fetchSupabaseJson(url, init, timeoutMs, fetchImpl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Supabase-Dienst ist nicht erreichbar.");
}

export function requireSupabaseOk(result: SupabaseJsonResult): any {
  if (!result.response.ok) throw new SupabaseHttpError(result);
  return result.payload;
}

export function supabaseTransportErrorCode(
  error: unknown,
  timeoutCode: string,
  unavailableCode: string,
): { code: string; httpStatus: number; messageKind: "timeout" | "unavailable" } {
  if (error instanceof Error && error.name === "AbortError") {
    return { code: timeoutCode, httpStatus: 504, messageKind: "timeout" };
  }
  return { code: unavailableCode, httpStatus: 502, messageKind: "unavailable" };
}
