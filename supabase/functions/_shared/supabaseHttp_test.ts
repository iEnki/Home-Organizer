import { fetchFirstAvailableSupabaseJson } from "./supabaseHttp.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("Supabase helper falls back only after a transport error", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (calls.length === 1) throw new TypeError("connection refused");
    return new Response(JSON.stringify({ id: "user-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await fetchFirstAvailableSupabaseJson(
    ["http://auth:9999/user", "http://kong:8000/auth/v1/user"],
    { method: "GET" },
    100,
    fetchImpl,
  );

  assert(result.response.status === 200, "fallback response must be returned");
  assert(result.payload.id === "user-1", "fallback payload must be parsed");
  assert(calls.length === 2, "transport failure must try the public fallback");
});

Deno.test("Supabase helper never retries an HTTP authentication response", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await fetchFirstAvailableSupabaseJson(
    ["http://auth:9999/user", "http://kong:8000/auth/v1/user"],
    { method: "GET" },
    100,
    fetchImpl,
  );

  assert(result.response.status === 401, "HTTP response must be authoritative");
  assert(calls.length === 1, "HTTP 401 must not be retried through Kong");
});
