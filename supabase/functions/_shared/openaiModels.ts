export type OpenAiModelCompatibility = "supported" | "unknown" | "unsupported";
export type OpenAiModelTarget = "general" | "vision";

export interface OpenAiModelCapabilities {
  text: boolean | null;
  vision: boolean | null;
  tools: boolean | null;
  json: boolean | null;
}

export interface OpenAiCatalogModel {
  id: string;
  created: number | null;
  ownedBy: string | null;
  capabilities: OpenAiModelCapabilities;
  compatibility: OpenAiModelCompatibility;
  reason: string | null;
}

type AnyRecord = Record<string, any>;

export const OPENAI_API_BASE = "https://api.openai.com";
export const OPENAI_RESPONSES_URL = `${OPENAI_API_BASE}/v1/responses`;

const SPECIALISED_MODEL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(?:^|[-_.])embedding(?:s)?(?:[-_.]|$)/i,
    reason: "Embedding-Modell",
  },
  { pattern: /moderation/i, reason: "Moderationsmodell" },
  {
    pattern: /(?:^|[-_.])(?:tts|speech)(?:[-_.]|$)/i,
    reason: "Sprachausgabe-Modell",
  },
  { pattern: /whisper|transcrib/i, reason: "Transkriptionsmodell" },
  { pattern: /dall-e|gpt-image/i, reason: "Bildgenerierungsmodell" },
  {
    pattern: /(?:^|[-_.])(?:audio|realtime)(?:[-_.]|$)/i,
    reason: "Audio-/Realtime-Modell",
  },
  { pattern: /(?:^|[-_.])sora(?:[-_.]|$)/i, reason: "Videogenerierungsmodell" },
  { pattern: /(?:^|[-_.])codex(?:[-_.]|$)/i, reason: "Codex-Spezialmodell" },
  { pattern: /computer-use/i, reason: "Computer-Use-Spezialmodell" },
];

const KNOWN_TEXT_MODEL_PATTERN = /^(?:gpt-|chatgpt-|o\d|computer-use)/i;
const KNOWN_VISION_MODEL_PATTERN =
  /^(?:gpt-(?:4o|4\.1|4\.5|5)|o3(?:-|$)|o4-mini)/i;
const KNOWN_TOOLS_AND_JSON_MODEL_PATTERN =
  /^(?:gpt-(?:3\.5-turbo|4o|4\.1|4\.5|5)(?:[-.]|$)|o1(?:-|$)|o3(?:-|$)|o4-mini(?:-|$))/i;

export function classifyOpenAiModel(idValue: unknown): {
  capabilities: OpenAiModelCapabilities;
  reason: string | null;
} {
  const id = String(idValue || "").trim();
  const specialised = SPECIALISED_MODEL_PATTERNS.find(({ pattern }) =>
    pattern.test(id)
  );
  if (specialised) {
    return {
      capabilities: { text: false, vision: false, tools: false, json: false },
      reason: specialised.reason,
    };
  }

  const text = KNOWN_TEXT_MODEL_PATTERN.test(id) ? true : null;
  const vision = KNOWN_VISION_MODEL_PATTERN.test(id) ? true : null;
  const toolsAndJson = KNOWN_TOOLS_AND_JSON_MODEL_PATTERN.test(id)
    ? true
    : null;
  return {
    capabilities: {
      text,
      vision,
      tools: toolsAndJson,
      json: toolsAndJson,
    },
    reason: null,
  };
}

export function compatibilityForTarget(
  capabilities: OpenAiModelCapabilities,
  target: OpenAiModelTarget,
): OpenAiModelCompatibility {
  const value = target === "vision" ? capabilities.vision : capabilities.text;
  if (value === true) return "supported";
  if (value === false) return "unsupported";
  return "unknown";
}

export function normaliseOpenAiModels(
  payload: AnyRecord,
  target: OpenAiModelTarget,
): OpenAiCatalogModel[] {
  const unique = new Map<string, OpenAiCatalogModel>();
  const models = Array.isArray(payload?.data) ? payload.data : [];

  for (const raw of models) {
    const id = String(raw?.id || "").trim();
    if (!id || unique.has(id)) continue;
    const classification = classifyOpenAiModel(id);
    unique.set(id, {
      id,
      created: Number.isFinite(raw?.created) ? Number(raw.created) : null,
      ownedBy: typeof raw?.owned_by === "string" ? raw.owned_by : null,
      capabilities: classification.capabilities,
      compatibility: compatibilityForTarget(
        classification.capabilities,
        target,
      ),
      reason: classification.reason,
    });
  }

  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildOpenAiVisionRequest({
  model,
  prompt,
  imageUrl,
  maxOutputTokens = 1800,
}: {
  model: string;
  prompt: string;
  imageUrl: string;
  maxOutputTokens?: number;
}) {
  return {
    model,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageUrl, detail: "high" },
      ],
    }],
    max_output_tokens: maxOutputTokens,
  };
}

export function extractOpenAiResponseText(payload: AnyRecord): {
  text: string;
  refusal: string | null;
} {
  const texts: string[] = [];
  const refusals: string[] = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        texts.push(part.text);
      }
      if (part?.type === "refusal" && typeof part.refusal === "string") {
        refusals.push(part.refusal);
      }
    }
  }

  return {
    text: texts.join("").trim(),
    refusal: refusals.join(" ").trim() || null,
  };
}

export async function fetchOpenAiJson(
  url: string,
  apiKey: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<{ response: Response; payload: AnyRecord }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${apiKey}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callOpenAiVisionResponse({
  apiKey,
  model,
  prompt,
  imageUrl,
  maxOutputTokens,
  timeoutMs,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  imageUrl: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}) {
  return await fetchOpenAiJson(
    OPENAI_RESPONSES_URL,
    apiKey,
    {
      method: "POST",
      body: JSON.stringify(
        buildOpenAiVisionRequest({ model, prompt, imageUrl, maxOutputTokens }),
      ),
    },
    timeoutMs,
  );
}
