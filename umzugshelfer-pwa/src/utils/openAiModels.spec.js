jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

import {
  findOpenAiModel,
  invokeOpenAiModels,
  isOpenAiModelBlocked,
  modelCapabilityForTarget,
  openAiModelNeedsTest,
} from "./openAiModels";
import { supabase } from "../supabaseClient";

const originalFetch = global.fetch;
const originalSupabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.REACT_APP_SUPABASE_URL = "https://supabase.example.test";
  process.env.REACT_APP_SUPABASE_ANON_KEY = "test-anon-key";
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  global.fetch = originalFetch;
});

afterAll(() => {
  process.env.REACT_APP_SUPABASE_URL = originalSupabaseUrl;
  process.env.REACT_APP_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
});

const models = [
  {
    id: "gpt-5.6",
    capabilities: { text: true, vision: true, tools: true, json: true },
  },
  {
    id: "future-model",
    capabilities: { text: null, vision: null, tools: null, json: null },
  },
  {
    id: "text-embedding-3-small",
    capabilities: { text: false, vision: false, tools: false, json: false },
  },
];

test("findOpenAiModel returns exact IDs only", () => {
  expect(findOpenAiModel(models, "gpt-5.6")).toBe(models[0]);
  expect(findOpenAiModel(models, "GPT-5.6")).toBeNull();
});

test("modelCapabilityForTarget uses target-specific capabilities", () => {
  expect(modelCapabilityForTarget(models[0], "global")).toBe(true);
  expect(modelCapabilityForTarget(models[0], "assistant")).toBe(true);
  expect(modelCapabilityForTarget(models[0], "cookbook")).toBe(true);
  expect(modelCapabilityForTarget(models[0], "vision")).toBe(true);
});

test("specialised models are blocked for the selected target", () => {
  expect(isOpenAiModelBlocked(models, "text-embedding-3-small", "global")).toBe(true);
  expect(isOpenAiModelBlocked(models, "text-embedding-3-small", "vision")).toBe(true);
});

test("unknown, manual and missing models require a test after a change", () => {
  const base = { models, target: "global", savedModelId: "gpt-4o" };
  expect(openAiModelNeedsTest({ ...base, modelId: "future-model" })).toBe(true);
  expect(openAiModelNeedsTest({ ...base, modelId: "manual-model-id" })).toBe(true);
  expect(openAiModelNeedsTest({ ...base, modelId: "gpt-5.6" })).toBe(false);
});

test("an unchanged stored model remains saveable even when absent from the catalogue", () => {
  expect(openAiModelNeedsTest({
    models,
    modelId: "retired-stored-model",
    target: "global",
    savedModelId: "retired-stored-model",
  })).toBe(false);
});

test("invokeOpenAiModels stops waiting after the configured timeout", async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
    error: null,
  });
  global.fetch = jest.fn((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }));

  const request = invokeOpenAiModels(
    { action: "list", keyScope: "general" },
    { timeoutMs: 10 },
  );

  await expect(request).rejects.toMatchObject({
    code: "FUNCTION_TIMEOUT",
    retryable: true,
  });
});

test("invokeOpenAiModels preserves structured server errors", async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
    error: null,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => JSON.stringify({
      error: "Einstellungen konnten nicht geladen werden.",
      code: "SETTINGS_UNAVAILABLE",
    }),
  });

  await expect(invokeOpenAiModels(
    { action: "list", keyScope: "vision" },
  )).rejects.toMatchObject({
    message: "Einstellungen konnten nicht geladen werden.",
    code: "SETTINGS_UNAVAILABLE",
    retryable: true,
  });
});

test("invokeOpenAiModels sends the current user token and returns the catalogue", async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
    error: null,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ models: [{ id: "gpt-4o" }] }),
  });

  await expect(invokeOpenAiModels(
    { action: "list", keyScope: "general" },
  )).resolves.toEqual({ models: [{ id: "gpt-4o" }] });

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/functions/v1/openai-models"),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-token",
      }),
    }),
  );
});
