import { supabase } from "../supabaseClient";

export const OPENAI_MODEL_REQUEST_TIMEOUT_MS = 45_000;

async function parseResponsePayload(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function requestError(message, code, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

export async function invokeOpenAiModels(
  body,
  { timeoutMs = OPENAI_MODEL_REQUEST_TIMEOUT_MS } = {},
) {
  const supabaseUrl = String(process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.REACT_APP_SUPABASE_ANON_KEY || "");
  if (!supabaseUrl || !anonKey) {
    throw requestError(
      "Der OpenAI-Modellservice ist nicht konfiguriert.",
      "FUNCTION_CONFIGURATION_ERROR",
    );
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) {
    throw requestError(
      "Bitte melde dich erneut an, um OpenAI-Modelle zu laden.",
      "AUTH_REQUIRED",
    );
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/openai-models`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    const payload = await parseResponsePayload(response);
    if (!response.ok) {
      throw requestError(
        payload?.error || payload?.message || `OpenAI-Modellservice HTTP ${response.status}`,
        payload?.code || "FUNCTION_ERROR",
        payload?.retryable === true || response.status === 429 || response.status >= 500,
      );
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw requestError(
        "OpenAI-Modellservice hat nicht rechtzeitig geantwortet.",
        "FUNCTION_TIMEOUT",
        true,
      );
    }
    if (error?.code) throw error;
    throw requestError(
      "OpenAI-Modellservice ist nicht erreichbar.",
      "FUNCTION_UNAVAILABLE",
      true,
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadOpenAiModels(keyScope) {
  return invokeOpenAiModels({ action: "list", keyScope });
}

export async function testOpenAiModel(target, model) {
  return invokeOpenAiModels({ action: "test", target, model });
}

export function modelCapabilityForTarget(model, target) {
  if (!model?.capabilities) return null;
  if (target === "vision") return model.capabilities.vision;
  if (target === "assistant") {
    return model.capabilities.text === false ? false : model.capabilities.tools;
  }
  if (target === "cookbook") {
    return model.capabilities.text === false ? false : model.capabilities.json;
  }
  return model.capabilities.text;
}

export function findOpenAiModel(models, modelId) {
  const id = String(modelId || "").trim();
  return (models || []).find((model) => model.id === id) || null;
}

export function isOpenAiModelBlocked(models, modelId, target) {
  const model = findOpenAiModel(models, modelId);
  return modelCapabilityForTarget(model, target) === false;
}

export function openAiModelNeedsTest({ models, modelId, target, savedModelId }) {
  const id = String(modelId || "").trim();
  if (!id || id === String(savedModelId || "").trim()) return false;
  const model = findOpenAiModel(models, id);
  return modelCapabilityForTarget(model, target) !== true;
}
