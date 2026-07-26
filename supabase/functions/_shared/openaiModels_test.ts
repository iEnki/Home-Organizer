import {
  buildOpenAiVisionRequest,
  classifyOpenAiModel,
  extractOpenAiResponseText,
  normaliseOpenAiModels,
} from "./openaiModels.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("normaliseOpenAiModels preserves, deduplicates and sorts model IDs", () => {
  const models = normaliseOpenAiModels({
    data: [
      { id: "text-embedding-3-small", created: 2, owned_by: "openai" },
      { id: "gpt-5.6", created: 3, owned_by: "openai" },
      { id: "gpt-5.6", created: 4, owned_by: "duplicate" },
      { id: "brand-new-model", created: 1, owned_by: "project" },
    ],
  }, "general");

  assert(models.length === 3, "duplicate IDs must be removed");
  assert(
    models.map((model) => model.id).join(",") ===
      "brand-new-model,gpt-5.6,text-embedding-3-small",
    "IDs must be sorted alphabetically",
  );
  assert(
    models[0].compatibility === "unknown",
    "unknown models must remain testable",
  );
  assert(
    models[1].compatibility === "supported",
    "known text models must be supported",
  );
  assert(
    models[2].compatibility === "unsupported",
    "embedding models must be blocked",
  );
});

Deno.test("classifyOpenAiModel marks specialised endpoint models as unsuitable", () => {
  for (
    const id of [
      "text-embedding-3-large",
      "omni-moderation-latest",
      "gpt-4o-mini-tts",
      "gpt-4o-transcribe",
      "gpt-image-1",
      "gpt-realtime",
      "codex-mini-latest",
    ]
  ) {
    const classification = classifyOpenAiModel(id);
    assert(
      classification.capabilities.text === false,
      `${id} must not be selectable for text`,
    );
    assert(
      classification.capabilities.vision === false,
      `${id} must not be selectable for vision`,
    );
  }
});

Deno.test("buildOpenAiVisionRequest creates a multimodal Responses API payload", () => {
  const request = buildOpenAiVisionRequest({
    model: "gpt-5.6",
    prompt: "Read this image",
    imageUrl: "data:image/png;base64,AA==",
    maxOutputTokens: 42,
  });

  assert(request.model === "gpt-5.6", "model is missing");
  assert(request.max_output_tokens === 42, "max_output_tokens is missing");
  assert(
    request.input[0].content[0].type === "input_text",
    "input_text is missing",
  );
  assert(
    request.input[0].content[1].type === "input_image",
    "input_image is missing",
  );
  assert(
    request.input[0].content[1].detail === "high",
    "image detail must be high",
  );
});

Deno.test("extractOpenAiResponseText joins text and exposes refusals", () => {
  const output = extractOpenAiResponseText({
    output: [{
      type: "message",
      content: [
        { type: "output_text", text: "Hallo " },
        { type: "output_text", text: "Welt" },
        { type: "refusal", refusal: "Nicht erlaubt" },
      ],
    }],
  });

  assert(output.text === "Hallo Welt", "text output must be joined");
  assert(output.refusal === "Nicht erlaubt", "refusal must be exposed");
});
