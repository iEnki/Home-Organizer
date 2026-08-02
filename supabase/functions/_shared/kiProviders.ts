// _shared/kiProviders.ts
// Gemeinsamer KI-Provider-Client fuer ki-chat, ki-vision und recipe-import-*.
// Provider: openai | ollama | lmstudio (OpenAI-kompatibel) | claude (Anthropic).
// callChatProvider liefert IMMER eine OpenAI-chat.completions-Form zurueck —
// fuer Claude uebernimmt der Uebersetzer (toAnthropicRequest/fromAnthropicResponse)
// die Konvertierung von Request und Response.

export type ProviderId = "openai" | "ollama" | "lmstudio" | "claude";
export type KiContext = "assistant" | "kochbuch" | string | undefined;

export const CLAUDE_DEFAULT_MODEL = "claude-opus-4-8";
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const OPENAI_API_BASE = "https://api.openai.com";
export const DEFAULT_CLAUDE_MAX_TOKENS = 8192;

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export interface KiSettingsRow {
  ki_provider?: string | null;
  openai_api_key?: string | null;
  openai_model?: string | null;
  ollama_base_url?: string | null;
  ollama_model?: string | null;
  lmstudio_base_url?: string | null;
  lmstudio_model?: string | null;
  lmstudio_api_key?: string | null;
  anthropic_api_key?: string | null;
  claude_model?: string | null;
  kochbuch_ki_provider?: string | null;
  kochbuch_ai_model?: string | null;
  kochbuch_openai_model?: string | null;
  kochbuch_ollama_model?: string | null;
  kochbuch_lmstudio_model?: string | null;
  kochbuch_claude_model?: string | null;
  kochbuch_ollama_thinking_enabled?: boolean | null;
  assistant_ki_provider?: string | null;
  assistant_openai_model?: string | null;
  assistant_ollama_model?: string | null;
  assistant_lmstudio_model?: string | null;
  assistant_claude_model?: string | null;
  assistant_ollama_thinking_enabled?: boolean | null;
}

export interface ResolvedProvider {
  provider: ProviderId;
  configured: boolean;
  notConfiguredMessage: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  disableThinking?: boolean; // nur Ollama
}

export interface ChatOptions {
  messages: AnyRecord[];
  tools?: AnyRecord[];
  toolChoice?: unknown;
  responseFormat?: { type: string } | null;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export type ChatResult =
  | { ok: true; json: AnyRecord }
  | {
      ok: false;
      status: number;
      code:
        | "TOOLS_UNSUPPORTED"
        | "UPSTREAM_ERROR"
        | "UPSTREAM_TIMEOUT"
        | "RATE_LIMITED"
        | "MODEL_UNAVAILABLE"
        | "PROVIDER_AUTH_ERROR"
        | "CLAUDE_REFUSAL";
      message: string;
      retryable: boolean;
    };

const trimBase = (value: string) => value.replace(/\/$/, "");

const isKnownProvider = (value: string): value is ProviderId =>
  value === "openai" || value === "ollama" || value === "lmstudio" || value === "claude";

/**
 * Loest den effektiven Provider + Modell fuer den Kontext auf.
 * Kontext-Overrides ("global" = Haushalts-Standard) wie bisher in ki-chat.
 */
export function resolveProvider(
  settings: KiSettingsRow,
  context: KiContext,
  opts: { forceProvider?: string | null; requestedModel?: string | null } = {},
): ResolvedProvider {
  const cookbookProvider = settings.kochbuch_ki_provider || "global";
  const assistantProvider = settings.assistant_ki_provider || "global";

  let providerRaw: string;
  if (opts.forceProvider && isKnownProvider(opts.forceProvider)) {
    providerRaw = opts.forceProvider;
  } else if (context === "assistant" && assistantProvider !== "global") {
    providerRaw = assistantProvider;
  } else if (context === "kochbuch" && cookbookProvider !== "global") {
    providerRaw = cookbookProvider;
  } else {
    providerRaw = settings.ki_provider || "openai";
  }
  const provider: ProviderId = isKnownProvider(providerRaw) ? providerRaw : "openai";

  if (provider === "ollama") {
    const model = (
      context === "assistant"
        ? settings.assistant_ollama_model || settings.ollama_model || "llama3.2"
        : context === "kochbuch"
        ? settings.kochbuch_ollama_model || settings.ollama_model || "llama3.2"
        : settings.ollama_model || "llama3.2"
    ).trim();
    const disableThinking =
      context === "assistant"
        ? !settings.assistant_ollama_thinking_enabled
        : context === "kochbuch"
        ? !settings.kochbuch_ollama_thinking_enabled
        : true;
    return {
      provider,
      configured: Boolean(settings.ollama_base_url),
      notConfiguredMessage:
        context === "kochbuch"
          ? "Ollama ist für das Kochbuch nicht konfiguriert."
          : "Ollama ist im Haushalt nicht konfiguriert.",
      model,
      baseUrl: settings.ollama_base_url ? trimBase(settings.ollama_base_url) : undefined,
      disableThinking,
    };
  }

  if (provider === "lmstudio") {
    const model = (
      (context === "assistant"
        ? settings.assistant_lmstudio_model || settings.lmstudio_model
        : context === "kochbuch"
        ? settings.kochbuch_lmstudio_model || settings.lmstudio_model
        : settings.lmstudio_model) || ""
    ).trim();
    const hasBase = Boolean(settings.lmstudio_base_url);
    return {
      provider,
      configured: hasBase && model.length > 0,
      notConfiguredMessage: !hasBase
        ? "LM Studio ist im Haushalt nicht konfiguriert (Server-URL fehlt)."
        : "LM Studio ist konfiguriert, aber es ist kein Modell gesetzt.",
      model,
      baseUrl: settings.lmstudio_base_url ? trimBase(settings.lmstudio_base_url) : undefined,
      apiKey: settings.lmstudio_api_key || undefined,
    };
  }

  if (provider === "claude") {
    const model = (
      (context === "assistant"
        ? settings.assistant_claude_model || settings.claude_model
        : context === "kochbuch"
        ? settings.kochbuch_claude_model || settings.claude_model
        : settings.claude_model) || CLAUDE_DEFAULT_MODEL
    ).trim();
    return {
      provider,
      configured: Boolean(settings.anthropic_api_key),
      notConfiguredMessage: "Anthropic API-Key (Claude) ist im Haushalt nicht konfiguriert.",
      model,
      apiKey: settings.anthropic_api_key || undefined,
    };
  }

  // openai
  const model =
    context === "assistant"
      ? settings.assistant_openai_model || settings.openai_model || "gpt-4o"
      : context === "kochbuch"
      ? settings.kochbuch_openai_model || settings.kochbuch_ai_model || "gpt-4o-mini"
      : settings.openai_model || opts.requestedModel || "gpt-4o";
  return {
    provider: "openai",
    configured: Boolean(settings.openai_api_key),
    notConfiguredMessage: "OpenAI API-Key ist im Haushalt nicht konfiguriert.",
    model,
    apiKey: settings.openai_api_key || undefined,
  };
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function injectJsonInstruction(messages: AnyRecord[], disableThinking = true): AnyRecord[] {
  const instruction = disableThinking
    ? "Antworte AUSSCHLIESSLICH mit gueltigem JSON. Kein Erklaerungstext, kein Markdown, keine Code-Bloecke. Nutze keine Thinking- oder Reasoning-Ausgabe."
    : "Antworte AUSSCHLIESSLICH mit gueltigem JSON. Kein Erklaerungstext, kein Markdown, keine Code-Bloecke.";
  const idx = messages.findIndex((m) => m.role === "system");
  if (idx !== -1 && typeof messages[idx].content === "string") {
    const patched = [...messages];
    patched[idx] = { ...patched[idx], content: `${patched[idx].content}\n\n${instruction}` };
    return patched;
  }
  return [{ role: "system", content: instruction }, ...messages];
}

function isOllamaThinkingControlError(message: unknown) {
  const text = String(message || "").toLowerCase();
  return text.includes("think") || text.includes("reasoning_effort") || text.includes("reasoning effort");
}

const isToolsUnsupportedMessage = (message: unknown) =>
  /tool|function.?call/i.test(String(message || ""));

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function providerFailure(
  providerLabel: string,
  status: number,
  message: unknown,
): Exclude<ChatResult, { ok: true }> {
  const text = String(message || `${providerLabel} HTTP ${status}`);
  if (status === 429) {
    return {
      ok: false,
      status,
      code: "RATE_LIMITED",
      message: text,
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      status,
      code: "PROVIDER_AUTH_ERROR",
      message: `${providerLabel} hat den konfigurierten API-Zugang abgelehnt.`,
      retryable: false,
    };
  }
  if (
    status === 404
    || /model.+(?:not found|does not exist|not available|access)/i.test(text)
  ) {
    return {
      ok: false,
      status,
      code: "MODEL_UNAVAILABLE",
      message: text,
      retryable: false,
    };
  }
  return {
    ok: false,
    status,
    code: "UPSTREAM_ERROR",
    message: text,
    retryable: status >= 500,
  };
}

function providerTransportFailure(
  providerLabel: string,
  error: unknown,
): Exclude<ChatResult, { ok: true }> {
  if (isAbortError(error)) {
    return {
      ok: false,
      status: 504,
      code: "UPSTREAM_TIMEOUT",
      message: `${providerLabel} hat nicht rechtzeitig geantwortet.`,
      retryable: true,
    };
  }
  return {
    ok: false,
    status: 0,
    code: "UPSTREAM_ERROR",
    message: `${providerLabel} nicht erreichbar: ${
      error instanceof Error ? error.message : String(error)
    }`,
    retryable: true,
  };
}

export const isOpenAiReasoningModel = (model: string) =>
  /^(?:o\d|gpt-5(?:[.-]|$))/i.test(String(model || "").trim());

const isGpt56Family = (model: string) =>
  /^gpt-5\.6(?:[.-]|$)/i.test(String(model || "").trim());

export function buildOpenAiChatBody(model: string, o: ChatOptions, toolsSent: boolean): AnyRecord {
  const reasoningModel = isOpenAiReasoningModel(model);
  const body: AnyRecord = {
    model,
    messages: o.messages,
    ...(o.responseFormat ? { response_format: o.responseFormat } : {}),
    ...(toolsSent ? { tools: o.tools, tool_choice: o.toolChoice ?? "auto" } : {}),
  };

  // Reasoning-Modelle lehnen klassische Sampling-Parameter teilweise ab.
  if (!reasoningModel && typeof o.temperature === "number") body.temperature = o.temperature;
  if (typeof o.maxTokens === "number") {
    body[reasoningModel ? "max_completion_tokens" : "max_tokens"] = o.maxTokens;
  }
  // GPT-5.6 Chat Completions kann Function Tools nur ohne Reasoning verwenden.
  if (toolsSent && isGpt56Family(model)) body.reasoning_effort = "none";
  return body;
}

function removeUnsupportedOptionalParameter(body: AnyRecord, json: AnyRecord, toolsSent: boolean) {
  const code = String(json?.error?.code || "");
  const message = String(json?.error?.message || json?.error || "");
  if (code !== "unsupported_parameter" && !/unsupported parameter|does not support/i.test(message)) return null;

  const namedParam = String(json?.error?.param || "");
  const removableParams = new Set([
    "temperature",
    "max_tokens",
    "max_completion_tokens",
    "response_format",
    "reasoning_effort",
  ]);
  const candidates = namedParam
    ? (removableParams.has(namedParam) ? [namedParam] : [])
    : [...removableParams];
  const retryBody = { ...body };
  let changed = false;
  for (const param of candidates) {
    if (param === "reasoning_effort" && toolsSent && isGpt56Family(String(body.model || ""))) continue;
    if (param in retryBody) {
      delete retryBody[param];
      changed = true;
    }
  }
  return changed ? retryBody : null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  if (!timeoutMs) return await fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generischer OpenAI-kompatibler Chat-Aufruf (OpenAI, Ollama, LM Studio).
 */
export async function callOpenAiCompatible(
  endpointBase: string,
  apiKey: string | undefined,
  body: AnyRecord,
  timeoutMs?: number,
): Promise<{ res: Response; json: AnyRecord }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetchWithTimeout(
    `${trimBase(endpointBase)}/v1/chat/completions`,
    { method: "POST", headers, body: JSON.stringify(body) },
    timeoutMs,
  );
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

// ── Anthropic-Uebersetzer ─────────────────────────────────────────────────────

const parseDataUrl = (url: string): { mediaType: string; data: string } | null => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(url || "");
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
};

// deno-lint-ignore no-explicit-any
const toAnthropicContentBlocks = (content: any): AnyRecord[] => {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const blocks: AnyRecord[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const parsed = parseDataUrl(part.image_url?.url || "");
      if (parsed) {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
        });
      }
    }
  }
  return blocks;
};

/**
 * Uebersetzt OpenAI-Chat-Optionen in einen Anthropic-/v1/messages-Body.
 * WICHTIG: max_tokens ist Pflicht; temperature/thinking werden NIE gesendet
 * (claude-opus-4-8 lehnt Sampling-Parameter mit 400 ab).
 */
export function toAnthropicRequest(o: ChatOptions & { model: string }): AnyRecord {
  const systemParts: string[] = [];
  const messages: AnyRecord[] = [];

  for (const msg of o.messages || []) {
    if (!msg || typeof msg !== "object") continue;
    const role = msg.role;

    if (role === "system") {
      if (typeof msg.content === "string" && msg.content) systemParts.push(msg.content);
      continue;
    }

    if (role === "tool") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id || "",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
          },
        ],
      });
      continue;
    }

    if (role === "assistant") {
      const blocks: AnyRecord[] = toAnthropicContentBlocks(msg.content);
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          let input: AnyRecord = {};
          try {
            input = JSON.parse(tc?.function?.arguments || "{}") || {};
          } catch {
            input = {};
          }
          blocks.push({
            type: "tool_use",
            id: tc?.id || crypto.randomUUID(),
            name: tc?.function?.name || "tool",
            input,
          });
        }
      }
      if (blocks.length > 0) messages.push({ role: "assistant", content: blocks });
      continue;
    }

    // user (Strings und multimodale Parts)
    const blocks = toAnthropicContentBlocks(msg.content);
    if (blocks.length > 0) messages.push({ role: "user", content: blocks });
  }

  if (o.responseFormat?.type === "json_object") {
    systemParts.push(
      "Antworte ausschliesslich mit gueltigem JSON. Kein Erklaerungstext, kein Markdown, keine Code-Bloecke.",
    );
  }

  const body: AnyRecord = {
    model: o.model,
    max_tokens: o.maxTokens ?? DEFAULT_CLAUDE_MAX_TOKENS,
    messages,
  };
  if (systemParts.length > 0) body.system = systemParts.join("\n\n");

  if (Array.isArray(o.tools) && o.tools.length > 0) {
    body.tools = o.tools
      .map((tool) => {
        const fn = tool?.function || {};
        if (!fn.name) return null;
        return {
          name: fn.name,
          description: fn.description || "",
          input_schema: fn.parameters || { type: "object", properties: {} },
        };
      })
      .filter(Boolean);
    body.tool_choice = { type: "auto" };
  }

  return body;
}

const ANTHROPIC_STOP_MAP: Record<string, string> = {
  tool_use: "tool_calls",
  end_turn: "stop",
  max_tokens: "length",
  stop_sequence: "stop",
};

/**
 * Normalisiert eine Anthropic-Response in die OpenAI-chat.completions-Form.
 */
export function fromAnthropicResponse(json: AnyRecord): AnyRecord {
  const contentBlocks: AnyRecord[] = Array.isArray(json?.content) ? json.content : [];
  const text = contentBlocks
    .filter((block) => block?.type === "text")
    .map((block) => block.text || "")
    .join("");
  const toolCalls = contentBlocks
    .filter((block) => block?.type === "tool_use")
    .map((block) => ({
      id: block.id,
      type: "function",
      function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
    }));

  const message: AnyRecord = {
    role: "assistant",
    content: toolCalls.length > 0 && !text ? null : text,
  };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  return {
    id: json?.id || null,
    object: "chat.completion",
    model: json?.model || null,
    choices: [
      {
        index: 0,
        message,
        finish_reason: ANTHROPIC_STOP_MAP[json?.stop_reason] || "stop",
      },
    ],
    usage: {
      prompt_tokens: json?.usage?.input_tokens ?? 0,
      completion_tokens: json?.usage?.output_tokens ?? 0,
      total_tokens: (json?.usage?.input_tokens ?? 0) + (json?.usage?.output_tokens ?? 0),
    },
  };
}

// ── Haupt-Dispatcher ─────────────────────────────────────────────────────────

/**
 * Fuehrt den Chat-Aufruf fuer den aufgeloesten Provider aus.
 * Rueckgabe ist bei ok:true IMMER OpenAI-chat.completions-foermig.
 */
export async function callChatProvider(r: ResolvedProvider, o: ChatOptions): Promise<ChatResult> {
  const toolsSent = Array.isArray(o.tools) && o.tools.length > 0;

  if (r.provider === "claude") {
    const body = toAnthropicRequest({ ...o, model: r.model });
    let res: Response;
    let json: AnyRecord;
    try {
      res = await fetchWithTimeout(
        ANTHROPIC_API_URL,
        { method: "POST", headers: anthropicHeaders(r.apiKey || ""), body: JSON.stringify(body) },
        o.timeoutMs,
      );
      json = await res.json().catch(() => ({}));
    } catch (err) {
      return providerTransportFailure("Anthropic", err);
    }
    if (!res.ok) {
      return providerFailure(
        "Anthropic",
        res.status,
        json?.error?.message || `Anthropic HTTP ${res.status}`,
      );
    }
    if (json?.stop_reason === "refusal") {
      return {
        ok: false,
        status: 200,
        code: "CLAUDE_REFUSAL",
        message: "Claude hat die Anfrage aus Sicherheitsgruenden abgelehnt.",
        retryable: false,
      };
    }
    return { ok: true, json: fromAnthropicResponse(json) };
  }

  if (r.provider === "ollama") {
    const disableThinking = r.disableThinking !== false;
    const useJsonFormat = !toolsSent && o.responseFormat?.type === "json_object";
    const ollamaMessages = useJsonFormat
      ? injectJsonInstruction(o.messages, disableThinking)
      : o.messages;
    let body: AnyRecord = {
      model: r.model,
      messages: ollamaMessages,
      temperature: o.temperature ?? 0.2,
      ...(disableThinking ? { think: false, reasoning_effort: false } : {}),
      ...(useJsonFormat ? { format: "json" } : {}),
      ...(toolsSent ? { tools: o.tools, tool_choice: o.toolChoice ?? "auto" } : {}),
      ...(typeof o.maxTokens === "number" ? { max_tokens: o.maxTokens } : {}),
    };
    let res: Response;
    let json: AnyRecord;
    try {
      ({ res, json } = await callOpenAiCompatible(r.baseUrl || "", undefined, body, o.timeoutMs));
      if (!res.ok && disableThinking && isOllamaThinkingControlError(json?.error?.message || json?.error)) {
        const { think: _t, reasoning_effort: _r, ...withoutThinking } = body;
        body = withoutThinking;
        ({ res, json } = await callOpenAiCompatible(r.baseUrl || "", undefined, body, o.timeoutMs));
      }
    } catch (error) {
      return providerTransportFailure("Ollama", error);
    }
    if (!res.ok) {
      const message = json?.error?.message || json?.error || `Ollama HTTP ${res.status}`;
      if (toolsSent && isToolsUnsupportedMessage(message)) {
        return {
          ok: false,
          status: res.status,
          code: "TOOLS_UNSUPPORTED",
          message: `Das Ollama-Modell "${r.model}" unterstuetzt kein Tool-Calling.`,
          retryable: false,
        };
      }
      return providerFailure("Ollama", res.status, message);
    }
    return { ok: true, json };
  }

  // openai + lmstudio (beide OpenAI-kompatibel)
  const endpointBase = r.provider === "lmstudio" ? r.baseUrl || "" : OPENAI_API_BASE;
  let body: AnyRecord = r.provider === "openai"
    ? buildOpenAiChatBody(r.model, o, toolsSent)
    : {
        model: r.model,
        messages: o.messages,
        temperature: o.temperature ?? 0.2,
        ...(o.responseFormat ? { response_format: o.responseFormat } : {}),
        ...(toolsSent ? { tools: o.tools, tool_choice: o.toolChoice ?? "auto" } : {}),
        ...(typeof o.maxTokens === "number" ? { max_tokens: o.maxTokens } : {}),
      };
  let res: Response;
  let json: AnyRecord;
  try {
    ({ res, json } = await callOpenAiCompatible(endpointBase, r.apiKey, body, o.timeoutMs));
    if (!res.ok && r.provider === "openai") {
      const retryBody = removeUnsupportedOptionalParameter(body, json, toolsSent);
      if (retryBody) {
        body = retryBody;
        ({ res, json } = await callOpenAiCompatible(endpointBase, r.apiKey, body, o.timeoutMs));
      }
    }
  } catch (err) {
    return providerTransportFailure(
      r.provider === "lmstudio" ? "LM Studio" : "OpenAI",
      err,
    );
  }
  if (!res.ok) {
    const message = json?.error?.message || json?.error || `${r.provider} HTTP ${res.status}`;
    if (toolsSent && isToolsUnsupportedMessage(message) && (res.status === 400 || r.provider === "lmstudio")) {
      return {
        ok: false,
        status: res.status,
        code: "TOOLS_UNSUPPORTED",
        message: `Das ${r.provider === "lmstudio" ? "LM Studio" : "OpenAI"}-Modell "${r.model}" unterstuetzt kein Tool-Calling.`,
        retryable: false,
      };
    }
    return providerFailure(
      r.provider === "lmstudio" ? "LM Studio" : "OpenAI",
      res.status,
      message,
    );
  }
  return { ok: true, json };
}
