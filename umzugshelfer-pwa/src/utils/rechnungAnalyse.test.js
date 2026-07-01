jest.mock("./kiClient", () => ({
  cleanKiJsonResponse: (value) => value,
}));

jest.mock("../supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import {
  analyzeWithChatGptVision,
  normalizeVisionError,
} from "./rechnungAnalyse";
import { supabase } from "../supabaseClient";

describe("rechnungAnalyse vision errors", () => {
  beforeEach(() => {
    supabase.functions.invoke.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps missing image analysis configuration as a clear 409 error", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 409,
          json: async () => ({ error: "Kein OpenAI API-Key fuer Bildanalyse konfiguriert." }),
        },
      },
    });

    await expect(analyzeWithChatGptVision("base64", "image/jpeg", { access_token: "token" }))
      .rejects
      .toMatchObject({
        message: "Kein OpenAI API-Key fuer Bildanalyse konfiguriert.",
        status: 409,
        code: "vision_not_configured",
        canFallbackToOcrRules: false,
      });
  });

  test("turns 503 into a readable retry error without suggesting a mode switch", () => {
    const error = normalizeVisionError({ status: 503, payload: {} });

    expect(error).toMatchObject({
      status: 503,
      code: "vision_service_unavailable",
      canFallbackToOcrRules: true,
    });
    expect(error.message).toContain("Vision-Dienst");
    expect(error.message).not.toContain("OCR + Regeln");
  });

  test("prefers structured provider error body over generic status text", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 502,
          json: async () => ({
            error: "OpenAI Vision ist nicht erreichbar: upstream reset",
            provider: "openai",
            code: "vision_provider_unreachable",
          }),
        },
      },
    });

    await expect(analyzeWithChatGptVision("base64", "image/jpeg", { access_token: "token" }))
      .rejects
      .toMatchObject({
        message: expect.stringContaining("OpenAI Vision ist nicht erreichbar"),
        status: 502,
        provider: "openai",
        code: "vision_provider_unreachable",
        canFallbackToOcrRules: true,
      });
  });

  test("invokes ki-vision through Supabase client with the configured vision mode", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        status: "ok",
        text: JSON.stringify({
          haendler: "Test Markt",
          datum: "2026-06-18",
          gesamt: 12.34,
          positionen: [],
        }),
      },
      error: null,
    });

    const result = await analyzeWithChatGptVision("base64", "image/jpeg", { access_token: "stale-token" }, "de");

    expect(supabase.functions.invoke).toHaveBeenCalledWith("ki-vision", {
      body: expect.objectContaining({
        mode: "chatgpt_vision",
        file_base64: "base64",
        mime_type: "image/jpeg",
        locale: "de",
      }),
    });
    expect(result).toMatchObject({
      haendler: "Test Markt",
      datum: "2026-06-18",
      gesamt: 12.34,
    });
  });

  test("normalizes Ollama DNS failures into a clear configuration hint", () => {
    const error = normalizeVisionError({
      status: 502,
      payload: {
        error: "Ollama Vision ist nicht erreichbar: name resolution failed",
        provider: "ollama",
        code: "vision_provider_unreachable",
      },
    });

    expect(error).toMatchObject({
      status: 502,
      provider: "ollama",
      code: "vision_provider_unreachable",
    });
    expect(error.message).toContain("Ollama-Adresse");
    expect(error.message).toContain("Supabase Edge Worker");
    expect(error.message).not.toContain("OCR + Regeln");
  });
});
