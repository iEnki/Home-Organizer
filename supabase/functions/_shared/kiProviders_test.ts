import { buildOpenAiChatBody, isOpenAiReasoningModel } from "./kiProviders.ts";

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
