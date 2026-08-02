import {
  buildOpenAiChatBody,
  callChatProvider,
  isOpenAiReasoningModel,
  type ResolvedProvider,
} from "./kiProviders.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const messages = [{ role: "user", content: "Hallo" }];
const tools = [{
  type: "function",
  function: {
    name: "test",
    description: "Test",
    parameters: { type: "object", properties: {} },
  },
}];

const openAiProvider: ResolvedProvider = {
  provider: "openai",
  configured: true,
  notConfiguredMessage: "",
  model: "gpt-4o",
  apiKey: "test-key",
};

async function withMockFetch<T>(
  mock: typeof fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("legacy OpenAI chat models retain sampling and max_tokens", () => {
  const body = buildOpenAiChatBody("gpt-4o", {
    messages,
    temperature: 0.2,
    maxTokens: 100,
  }, false);

  assert(body.temperature === 0.2, "legacy temperature must be retained");
  assert(body.max_tokens === 100, "legacy models must use max_tokens");
  assert(
    !("max_completion_tokens" in body),
    "legacy models must not use max_completion_tokens",
  );
});

Deno.test("reasoning models omit sampling and use max_completion_tokens", () => {
  const body = buildOpenAiChatBody("gpt-5.6", {
    messages,
    temperature: 0.2,
    maxTokens: 100,
  }, false);

  assert(
    isOpenAiReasoningModel("gpt-5.6"),
    "GPT-5.6 must be classified as a reasoning model",
  );
  assert(!("temperature" in body), "reasoning models must omit temperature");
  assert(
    body.max_completion_tokens === 100,
    "reasoning models must use max_completion_tokens",
  );
  assert(
    !("reasoning_effort" in body),
    "reasoning_effort is only needed for GPT-5.6 tools",
  );
});

Deno.test("GPT-5.6 Chat Completions tools force reasoning none", () => {
  const body = buildOpenAiChatBody("gpt-5.6", {
    messages,
    tools,
    toolChoice: "required",
    maxTokens: 100,
  }, true);

  assert(
    body.reasoning_effort === "none",
    "GPT-5.6 tool calls require reasoning_effort none",
  );
  assert(body.tools === tools, "tools must be preserved");
  assert(body.tool_choice === "required", "tool choice must be preserved");
});

Deno.test("OpenAI provider errors are mapped without leaking credentials", async () => {
  const cases = [
    { status: 401, expectedCode: "PROVIDER_AUTH_ERROR", retryable: false },
    { status: 429, expectedCode: "RATE_LIMITED", retryable: true },
    { status: 404, expectedCode: "MODEL_UNAVAILABLE", retryable: false },
    { status: 503, expectedCode: "UPSTREAM_ERROR", retryable: true },
  ] as const;

  for (const testCase of cases) {
    const result = await withMockFetch(
      async () => new Response(JSON.stringify({
        error: {
          message: testCase.status === 404
            ? "The model does not exist."
            : `provider error ${testCase.status}`,
        },
      }), {
        status: testCase.status,
        headers: { "Content-Type": "application/json" },
      }),
      () => callChatProvider(openAiProvider, { messages, timeoutMs: 100 }),
    );

    assert(!result.ok, `HTTP ${testCase.status} must fail`);
    if (result.ok) continue;
    assert(result.code === testCase.expectedCode, `HTTP ${testCase.status} code mismatch`);
    assert(result.retryable === testCase.retryable, `HTTP ${testCase.status} retryability mismatch`);
    assert(!result.message.includes("test-key"), "provider credentials must not be exposed");
  }
});

Deno.test("OpenAI timeout becomes a structured upstream timeout without retry", async () => {
  let callCount = 0;
  const result = await withMockFetch(
    ((_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch,
    () => callChatProvider(openAiProvider, { messages, timeoutMs: 5 }),
  );

  assert(!result.ok, "timeout must fail");
  if (result.ok) return;
  assert(result.code === "UPSTREAM_TIMEOUT", "timeout code mismatch");
  assert(result.status === 504, "timeout status mismatch");
  assert(callCount === 1, "timeouts must never be retried");
});

Deno.test("unsupported OpenAI parameters trigger exactly one compatibility retry", async () => {
  const bodies: Record<string, unknown>[] = [];
  let callCount = 0;
  const result = await withMockFetch(
    (async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      bodies.push(JSON.parse(String(init?.body || "{}")));
      if (callCount === 1) {
        return new Response(JSON.stringify({
          error: {
            code: "unsupported_parameter",
            param: "temperature",
            message: "Unsupported parameter: temperature",
          },
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    () => callChatProvider(openAiProvider, {
      messages,
      temperature: 0.2,
      maxTokens: 100,
      timeoutMs: 100,
    }),
  );

  assert(result.ok, "compatibility retry should succeed");
  assert(callCount === 2, "only one compatibility retry is allowed");
  assert(bodies[0].temperature === 0.2, "first request must contain temperature");
  assert(!("temperature" in bodies[1]), "retry must remove the unsupported parameter");
  assert(bodies[1].max_tokens === 100, "supported parameters must be retained");
});
