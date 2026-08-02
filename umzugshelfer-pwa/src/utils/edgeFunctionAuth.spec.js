jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from "../supabaseClient";
import {
  EdgeFunctionRequestError,
  fetchEdgeFunctionJsonWithAuthRetry,
  invokeEdgeFunctionWithAuthRetry,
} from "./edgeFunctionAuth";

const originalFetch = global.fetch;
const originalSupabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

function httpError(status) {
  return {
    name: "FunctionsHttpError",
    context: { status },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REACT_APP_SUPABASE_URL = "https://supabase.example.test";
  process.env.REACT_APP_SUPABASE_ANON_KEY = "test-anon-key";
  global.fetch = originalFetch;
});

afterAll(() => {
  process.env.REACT_APP_SUPABASE_URL = originalSupabaseUrl;
  process.env.REACT_APP_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  global.fetch = originalFetch;
});

test("returns a successful first response without refreshing the session", async () => {
  supabase.functions.invoke.mockResolvedValue({
    data: { status: "ok" },
    error: null,
  });

  const result = await invokeEdgeFunctionWithAuthRetry("ki-vision", {
    body: { mode: "chatgpt_vision" },
  });

  expect(result.data).toEqual({ status: "ok" });
  expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
});

test("refreshes once after 401 and retries with the new access token", async () => {
  supabase.functions.invoke
    .mockResolvedValueOnce({ data: null, error: httpError(401) })
    .mockResolvedValueOnce({ data: { status: "ok" }, error: null });
  supabase.auth.refreshSession.mockResolvedValue({
    data: { session: { access_token: "fresh-token" } },
    error: null,
  });

  const result = await invokeEdgeFunctionWithAuthRetry("ki-vision", {
    body: { mode: "chatgpt_vision" },
  });

  expect(result.data).toEqual({ status: "ok" });
  expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
  expect(supabase.functions.invoke).toHaveBeenLastCalledWith("ki-vision", {
    body: { mode: "chatgpt_vision" },
    headers: { Authorization: "Bearer fresh-token" },
  });
});

test("does not retry non-authentication errors", async () => {
  const error = httpError(503);
  supabase.functions.invoke.mockResolvedValue({ data: null, error });

  const result = await invokeEdgeFunctionWithAuthRetry("ki-vision", {
    body: {},
  });

  expect(result.error).toBe(error);
  expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
});

test("returns a clear authentication error when refresh fails", async () => {
  supabase.functions.invoke.mockResolvedValue({
    data: null,
    error: httpError(401),
  });
  supabase.auth.refreshSession.mockResolvedValue({
    data: { session: null },
    error: new Error("refresh token expired"),
  });

  const result = await invokeEdgeFunctionWithAuthRetry("ki-vision", {
    body: {},
  });

  expect(result.error).toMatchObject({
    name: "FunctionsAuthError",
    status: 401,
    code: "AUTH_REQUIRED",
  });
  expect(result.error.message).toContain("refresh token expired");
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
});

test("JSON fetch refreshes once after 401 and returns the successful payload", async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "old-token" } },
  });
  supabase.auth.refreshSession.mockResolvedValue({
    data: { session: { access_token: "fresh-token" } },
    error: null,
  });
  global.fetch = jest.fn()
    .mockResolvedValueOnce(new Response(
      JSON.stringify({ code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ))
    .mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

  await expect(fetchEdgeFunctionJsonWithAuthRetry("ki-chat", {
    body: { messages: [{ role: "user", content: "Hallo" }] },
  })).resolves.toEqual({ ok: true });

  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[1][1].headers.apikey).toBe("test-anon-key");
  expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh-token");
});

test("JSON fetch does not retry provider errors", async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "token" } },
  });
  global.fetch = jest.fn().mockResolvedValue(new Response(
    JSON.stringify({
      code: "UPSTREAM_ERROR",
      message: "OpenAI unavailable",
      retryable: true,
    }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  ));

  await expect(fetchEdgeFunctionJsonWithAuthRetry("ki-chat", {
    body: {},
  })).rejects.toMatchObject({
    code: "UPSTREAM_ERROR",
    status: 502,
    retryable: true,
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
});

test("JSON fetch maps its client timeout without retrying", async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "token" } },
  });
  global.fetch = jest.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }));

  const request = fetchEdgeFunctionJsonWithAuthRetry("ki-chat", {
    body: {},
    timeoutMs: 10,
  });

  await expect(request).rejects.toEqual(expect.objectContaining({
    name: "EdgeFunctionRequestError",
    code: "CLIENT_TIMEOUT",
    status: 504,
  }));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  expect(EdgeFunctionRequestError).toBeDefined();
});
