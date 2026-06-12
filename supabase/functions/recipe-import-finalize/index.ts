// Supabase Edge Function: recipe-import-finalize
// Internal callback used by recipe-source-parser after web/video extraction and
// local transcription. It performs household-key OpenAI recipe structuring and
// persists the review draft.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const OLLAMA_ANALYSIS_TIMEOUT_MS = 85_000;
const OLLAMA_TRANSCRIPT_LIMIT = 9_000;
const OLLAMA_WEB_TEXT_LIMIT = 7_000;
const OLLAMA_SEGMENT_LIMIT = 48;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function persistRecipeImage(recipe: Record<string, unknown>) {
  const parserUrl = String(Deno.env.get("RECIPE_PARSER_URL") || "").replace(/\/$/, "");
  const parserToken = Deno.env.get("RECIPE_PARSER_INTERNAL_TOKEN");
  if (!parserUrl || !parserToken) return;

  const response = await fetch(`${parserUrl}/recipe-images/persist`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${parserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipe }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Recipe image persistence failed (${response.status}): ${truncate(detail, 500)}`);
  }
}

function truncate(value: unknown, max = 1200) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function limitText(value: unknown, max: number) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function normalizeLocale(locale: unknown) {
  return locale === "en" || locale === "en-GB" ? "en-GB" : "de";
}

function cleanJson(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function arr(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function recipeUnitKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isLooseNonPurchasableUnit(value: unknown) {
  return ["prise", "prisen", "pinch", "etwas", "some", "nach geschmack", "to taste"].includes(recipeUnitKey(value));
}

function normalizeLooseAmount(quantity: number | null, unit: string | null, amountText: string | null) {
  return {
    quantity: isLooseNonPurchasableUnit(unit) && (quantity == null || quantity <= 0) ? null : quantity,
    unit,
    amountText: amountText ? amountText.replace(/^0(?:[.,]0+)?\s+/i, "") : amountText,
  };
}

function parseLooseIngredientAmount(item: Record<string, unknown>) {
  const text = String(item.amount_text || item.original_text || "").trim();
  const match = text.match(/\b(1|2|3|4|5|6|7|8|9|10|eine?|one|two|three)\s+(prise|prisen|pinch|päckchen|paeckchen|packet|packerl|teelöffel|teeloeffel|tsp|tl|esslöffel|essloeffel|tbsp|el)\b/i);
  if (!match) return normalizeLooseAmount(num(item.quantity), item.unit ? String(item.unit) : null, item.amount_text ? String(item.amount_text) : null);
  const word = match[1].toLowerCase();
  const quantityMap: Record<string, number> = { ein: 1, eine: 1, one: 1, two: 2, three: 3 };
  const unitMap: Record<string, string> = {
    prise: "Prise",
    prisen: "Prise",
    pinch: "Prise",
    "päckchen": "Päckchen",
    paeckchen: "Päckchen",
    packet: "Päckchen",
    packerl: "Päckchen",
    "teelöffel": "Teelöffel",
    teeloeffel: "Teelöffel",
    tsp: "Teelöffel",
    tl: "Teelöffel",
    "esslöffel": "Esslöffel",
    essloeffel: "Esslöffel",
    tbsp: "Esslöffel",
    el: "Esslöffel",
  };
  const parsedNumber = Number(word);
  const unit = item.unit ? String(item.unit) : unitMap[match[2].toLowerCase()] || null;
  const quantity = num(item.quantity) ?? quantityMap[word] ?? (Number.isFinite(parsedNumber) ? parsedNumber : null);
  return normalizeLooseAmount(quantity, unit, item.amount_text ? String(item.amount_text) : match[0]);
}

function normalizeTagKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[#_/-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseTag(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : "")
    .join(" ");
}

const tagAliases: Record<string, string> = {
  "air fryer": "Airfryer",
  airfryer: "Airfryer",
  backen: "Backen",
  baking: "Backen",
  backofen: "Backofen",
  oven: "Backofen",
  dessert: "Dessert",
  desserts: "Dessert",
  nachspeise: "Dessert",
  suessspeise: "Dessert",
  susspeise: "Dessert",
  abendessen: "Abendessen",
  dinner: "Abendessen",
  mittagessen: "Mittagessen",
  hauptgericht: "Hauptgericht",
  main: "Hauptgericht",
  "main course": "Hauptgericht",
  lunch: "Mittagessen",
  fruehstueck: "Frühstück",
  breakfast: "Frühstück",
  fleischfrei: "Fleischlos",
  fleischlos: "Fleischlos",
  meatless: "Fleischlos",
  "ohne fleisch": "Fleischlos",
  vegetarisch: "Vegetarisch",
  vegetarian: "Vegetarisch",
  veggie: "Vegetarisch",
  vegan: "Vegan",
  veganisch: "Vegan",
  schnell: "Schnell",
  quick: "Schnell",
  einfach: "Einfach",
  easy: "Einfach",
  kuchen: "Kuchen",
  cake: "Kuchen",
  gebaeck: "Gebäck",
  pastry: "Gebäck",
  suppe: "Suppe",
  soup: "Suppe",
  salat: "Salat",
  salad: "Salat",
  snack: "Snack",
  snacks: "Snack",
  pasta: "Pasta",
  nudeln: "Pasta",
  reis: "Reis",
  rice: "Reis",
  kartoffel: "Kartoffeln",
  kartoffeln: "Kartoffeln",
  potato: "Kartoffeln",
  potatoes: "Kartoffeln",
  mealprep: "Meal Prep",
  "meal prep": "Meal Prep",
};

const meatKeywords = [
  "fleisch", "rind", "rindfleisch", "beef", "schwein", "pork", "speck", "bacon",
  "schinken", "ham", "salami", "wurst", "wuerstchen", "wurstchen", "rostbratwurstchen",
  "bratwurstchen", "sausage", "bratwurst", "hackfleisch", "hack", "faschiertes", "mince", "huhn", "haehnchen", "hahnchen", "chicken", "pute",
  "truthahn", "turkey", "ente", "duck", "gans", "lamm", "lamb", "kalb", "veal",
  "wild", "venison", "fisch", "fish", "lachs", "salmon", "thunfisch", "tuna",
  "forelle", "trout", "garnelen", "shrimp", "prawns", "scampi", "krabbe", "crab",
  "muschel", "mussel", "meeresfruechte", "meeresfruchte", "seafood", "gelatine", "gelatin",
];

const plantBasedContext = [
  "vegetarisch", "vegan", "pflanzlich", "plant based", "ersatz", "tofu", "seitan",
  "tempeh", "soja", "beyond", "like meat", "veggie",
];

function includesNormalizedWord(text: string, keyword: string) {
  if (keyword.length >= 5 && text.includes(keyword)) return true;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i").test(text);
}

function ingredientText(entry: unknown) {
  const item = (entry || {}) as Record<string, unknown>;
  return normalizeTagKey([
    item.name,
    item.normalized_name,
    item.original_text,
  ].filter(Boolean).join(" "));
}

function hasMeatIngredient(ingredients: unknown[]) {
  return ingredients.some((entry) => {
    const text = ingredientText(entry);
    if (!text) return false;
    if (plantBasedContext.some((keyword) => includesNormalizedWord(text, keyword))) return false;
    return meatKeywords.some((keyword) => includesNormalizedWord(text, keyword));
  });
}

function recipeEvidenceText(recipe: Record<string, unknown>, ingredients: unknown[]) {
  return normalizeTagKey([
    recipe.title,
    recipe.description,
    recipe.group,
    recipe.gruppe,
    recipe.notes,
    ...arr(recipe.tags),
    ...arr(recipe.instructions),
    ...ingredients.map((entry) => ingredientText(entry)),
  ].filter(Boolean).join(" "));
}

function normalizeRecipeTags(recipe: Record<string, unknown>, ingredients: unknown[]) {
  const hasMeat = ingredients.length > 0 && hasMeatIngredient(ingredients);
  const normalized: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const key = normalizeTagKey(value);
    if (!key) return;
    const tag = tagAliases[key] || titleCaseTag(String(value).replace(/[#_/-]+/g, " "));
    const canonicalKey = normalizeTagKey(tag);
    if (!canonicalKey || seen.has(canonicalKey)) return;
    if (hasMeat && ["fleischlos", "vegetarisch", "vegan"].includes(canonicalKey)) return;
    seen.add(canonicalKey);
    normalized.push(tag);
  };

  arr(recipe.tags).forEach(add);
  add(recipe.group);
  add(recipe.gruppe);

  const evidence = recipeEvidenceText(recipe, ingredients);
  const inferredTags: Array<[string, string[]]> = [
    ["Schnell", ["schnell", "quick", "easy", "einfach"]],
    ["Einfach", ["einfach", "easy"]],
    ["Frühstück", ["fruehstueck", "breakfast", "brunch", "ruehrei"]],
    ["Hauptgericht", ["hauptgericht", "main course", "pfanne", "dinner", "abendessen", "mittagessen"]],
    ["Dessert", ["dessert", "nachtisch", "nachspeise", "suessspeise", "kuchen", "marmelade"]],
    ["Backen", ["backen", "backofen", "bake", "oven"]],
    ["Airfryer", ["airfryer", "heissluftfritteuse"]],
    ["Kartoffeln", ["kartoffel"]],
    ["Pasta", ["pasta", "nudeln"]],
    ["Reis", ["reis", "rice"]],
    ["Suppe", ["suppe", "soup"]],
    ["Salat", ["salat", "salad"]],
  ];
  inferredTags.forEach(([tag, keywords]) => {
    if (keywords.some((keyword) => includesNormalizedWord(evidence, keyword))) add(tag);
  });

  if (ingredients.length > 0 && !hasMeat) {
    add("Fleischlos");
    add("Vegetarisch");
  }

  return normalized.slice(0, 14);
}

function buildPrompt(payload: Record<string, unknown>, targetLocale: string, location: string, extractMacros = true) {
  const source = payload.source || {};
  const web = payload.web_extract || {};
  const transcript = payload.transcript || "";
  const captionTranscript = payload.caption_transcript || "";
  const segments = arr(payload.segments).slice(0, 120);
  const languageName = targetLocale === "en-GB" ? "English (United Kingdom)" : "German";
  return [
    {
      role: "system",
      content: `You are a recipe parser for a household organizer app.
Return only valid JSON. Extract a practical recipe from website metadata, social metadata and transcript.
Write the final recipe in ${languageName}. Keep brand names and source titles unchanged. Prefer metric units.
Do not invent ingredients without evidence. Estimate cautiously and mark estimated fields.
${extractMacros ? "Estimate calories, protein, carbohydrates and fat for the full recipe and per serving. Do not leave macro fields null unless ingredients are missing entirely." : "Macro extraction is disabled; macro fields may be null."}
Ingredient quantities must preserve non-standard amount phrases. Examples: "1 Prise Salz" => quantity 1, unit "Prise", amount_text "1 Prise", name "Salz"; "1 Päckchen Backpulver" => quantity 1, unit "Päckchen", amount_text "1 Päckchen", name "Backpulver".
Instructions must be small, complete and action-oriented. Do not merge separate source actions. Include relevant quantities and ingredient names in each step where the source provides them.
Keep alternatives as their own instruction steps. Example: air fryer baking and oven baking are two separate steps if both are mentioned.
Verify numbers against captions, transcript and description. If a size could be 8 or 18 cm, prefer the value explicitly present in captions/description/transcript and add a warning if uncertain. Never inflate small cutter sizes without evidence.
Use concise canonical tags. Do not create or assign recipe groups/lists during import; use categories such as FrÃ¼hstÃ¼ck, Hauptgericht or Dessert only as tags. If the evidence contains no meat, fish, seafood or gelatin, include "Fleischlos" and "Vegetarisch"; add "Vegan" only if the recipe has no animal products. Otherwise do not add vegetarian tags.
Include warnings for uncertain quantities, missing steps, weak transcript quality or translation uncertainty.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        target_locale: targetLocale,
        location,
        source,
        web_extract: web,
        caption_transcript: captionTranscript,
        transcript,
        transcript_segments: segments,
        required_shape: {
          language: {
            source_language: "string",
            source_language_label: "string",
            source_language_confidence: 0.0,
            target_locale: targetLocale,
            translated: true,
          },
          title: "string",
          description: "string",
          group: null,
          confidence: 0.0,
          servings: 4,
          prep_time_minutes: null,
          cook_time_minutes: null,
          ingredients: [{
            name: "string",
            normalized_name: "string",
            quantity: null,
            unit: "string",
            amount_text: "full amount phrase without ingredient name, e.g. 1 Prise",
            original_text: "string",
            category: "Lebensmittel",
            estimated: false,
            confidence: 0.0,
            cost_min: null,
            cost_max: null,
            currency: "EUR",
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            calories: null,
          }],
          instructions: ["short complete action step with relevant quantities and ingredients"],
          equipment: ["string"],
          notes: "string",
          total_cost: { min: null, max: null, currency: "EUR" },
          total_macros: { protein_g: null, carbs_g: null, fat_g: null, calories: null },
          per_serving_macros: { protein_g: null, carbs_g: null, fat_g: null, calories: null },
          dietary_substitutions: { vegan: "", vegetarian: "", gluten_free: "" },
          tags: ["string"],
          warnings: ["string"],
        },
      }),
    },
  ];
}

function buildInstructionRefinementPrompt(payload: Record<string, unknown>, recipe: Record<string, unknown>, targetLocale: string) {
  const languageName = targetLocale === "en-GB" ? "English (United Kingdom)" : "German";
  return [
    {
      role: "system",
      content: `You are a recipe instruction auditor. Return only valid JSON.
Rewrite only the instructions so they are complete, atomic and evidence-based in ${languageName}.
Use the source description, captions, transcript and current ingredients as evidence.
Rules:
- Split separate actions into separate steps.
- Preserve alternative cooking methods as separate steps.
- Include quantities and key ingredient names when evidence provides them.
- Correct obvious numeric transcription mistakes only when evidence supports the correction.
- For cookie/cutter sizes, 8 cm is plausible; 18 cm is suspicious and needs explicit evidence.
- Do not invent new ingredients or steps.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        target_locale: targetLocale,
        source: payload.source || {},
        web_extract: payload.web_extract || {},
        caption_transcript: payload.caption_transcript || "",
        transcript: payload.transcript || "",
        transcript_segments: arr(payload.segments).slice(0, 160),
        current_recipe: {
          ingredients: arr(recipe.ingredients),
          instructions: arr(recipe.instructions),
        },
        required_shape: {
          instructions: ["short complete action step"],
          warnings: ["string"],
        },
      }),
    },
  ];
}

function compactPayloadForOllama(payload: Record<string, unknown>) {
  const web = { ...((payload.web_extract || {}) as Record<string, unknown>) };
  if (web.text) web.text = limitText(web.text, OLLAMA_WEB_TEXT_LIMIT);
  return {
    ...payload,
    web_extract: web,
    caption_transcript: limitText(payload.caption_transcript, Math.floor(OLLAMA_TRANSCRIPT_LIMIT / 2)),
    transcript: limitText(payload.transcript, OLLAMA_TRANSCRIPT_LIMIT),
    segments: arr(payload.segments).slice(0, OLLAMA_SEGMENT_LIMIT),
  };
}

function resolveCookbookAi(settings: Record<string, unknown> | null | undefined, forceProvider?: string) {
  const override = forceProvider || String(settings?.kochbuch_ki_provider || "global");
  const provider = override === "global" ? String(settings?.ki_provider || "openai") : override;
  if (provider === "ollama") {
    return {
      provider: "ollama",
      configured: Boolean(settings?.ollama_base_url),
      model: String(settings?.kochbuch_ollama_model || settings?.ollama_model || "llama3.2").trim(),
      baseUrl: String(settings?.ollama_base_url || "").replace(/\/$/, ""),
      error: "Ollama ist für das Kochbuch nicht konfiguriert.",
    };
  }
  return {
    provider: "openai",
    configured: Boolean(settings?.openai_api_key),
    model: String(settings?.kochbuch_openai_model || settings?.kochbuch_ai_model || "gpt-4o-mini").trim(),
    apiKey: String(settings?.openai_api_key || ""),
    error: "OpenAI ist für das Kochbuch nicht konfiguriert.",
  };
}

function injectJsonInstruction(messages: unknown[], disableThinking = true) {
  const instruction = disableThinking
    ? "Return only valid JSON. No explanation text, no Markdown, no code fences. Do not use thinking or reasoning output."
    : "Return only valid JSON. No explanation text, no Markdown, no code fences.";
  const patched = [...messages] as Array<Record<string, unknown>>;
  const idx = patched.findIndex((message) => message?.role === "system" && typeof message?.content === "string");
  if (idx >= 0) {
    patched[idx] = { ...patched[idx], content: `${patched[idx].content}\n\n${instruction}` };
    return patched;
  }
  return [{ role: "system", content: instruction }, ...patched];
}

function isOllamaThinkingControlError(message: unknown) {
  const text = String(message || "").toLowerCase();
  return text.includes("think") || text.includes("reasoning_effort") || text.includes("reasoning effort");
}

async function callKiJson(settings: Record<string, unknown>, messages: unknown[], temperature = 0.1, forceProvider?: string) {
  const ai = resolveCookbookAi(settings, forceProvider);
  if (!ai.configured) throw new Error(ai.error);

  const endpoint = ai.provider === "ollama" ? `${ai.baseUrl}/v1/chat/completions` : "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ai.provider === "openai") headers.Authorization = `Bearer ${ai.apiKey}`;
  const disableOllamaThinking = ai.provider === "ollama" && !Boolean(settings?.kochbuch_ollama_thinking_enabled);

  let requestBody: Record<string, unknown> = ai.provider === "ollama"
    ? {
        model: ai.model,
        messages: injectJsonInstruction(messages, disableOllamaThinking),
        temperature,
        format: "json",
        ...(disableOllamaThinking ? { think: false, reasoning_effort: false } : {}),
      }
    : {
        model: ai.model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      };

  const fetchCompletion = async (body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeoutId = ai.provider === "ollama"
      ? setTimeout(() => controller.abort("ollama-timeout"), OLLAMA_ANALYSIS_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const responseText = await response.text().catch(() => "");
      return { response, responseText };
    } catch (err) {
      if (ai.provider === "ollama" && controller.signal.aborted) {
        const timeoutError = new Error("Ollama analysis timed out.");
        timeoutError.name = "OllamaTimeoutError";
        throw timeoutError;
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const parseResponseText = (responseText: string) => {
    try {
      return responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`${ai.provider} returned non-JSON response: ${truncate(responseText)}`);
    }
  };

  let { response, responseText } = await fetchCompletion(requestBody);
  let json: any = parseResponseText(responseText);

  if (!response.ok && ai.provider === "ollama" && disableOllamaThinking && isOllamaThinkingControlError(json?.error?.message || json?.error)) {
    const { think, reasoning_effort, ...bodyWithoutThinkingControls } = requestBody;
    requestBody = bodyWithoutThinkingControls;
    const retry = await fetchCompletion(requestBody);
    response = retry.response;
    responseText = retry.responseText;
    json = parseResponseText(responseText);
  }

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.error || `${ai.provider} HTTP ${response.status}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error(`${ai.provider} returned no message content.`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanJson(content)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`${ai.provider} returned invalid recipe JSON: ${truncate(content)} (${err instanceof Error ? err.message : String(err)})`);
  }

  return {
    provider: ai.provider,
    model: ai.model,
    raw: json,
    parsed,
  };
}

function shouldRunInstructionRefinement(payload: Record<string, unknown>, recipe: Record<string, unknown>) {
  const source = (payload.source || {}) as Record<string, unknown>;
  const web = (payload.web_extract || {}) as Record<string, unknown>;
  const evidence = [
    payload.caption_transcript,
    payload.transcript,
    source.description,
    web.text,
  ].join(" ");
  return arr(recipe.instructions).length > 0 && evidence.trim().length > 80;
}

function fallbackRecipe(payload: Record<string, unknown>, targetLocale: string) {
  const source = (payload.source || {}) as Record<string, unknown>;
  const web = (payload.web_extract || {}) as Record<string, unknown>;
  const title = String(web.title || source.title || (targetLocale === "en-GB" ? "Imported recipe" : "Importiertes Rezept"));
  return {
    language: {
      source_language: payload.detected_language || null,
      source_language_label: "",
      source_language_confidence: null,
      target_locale: targetLocale,
      translated: false,
    },
    title,
    description: String(web.description || source.description || ""),
    confidence: 0.35,
    servings: 4,
    prep_time_minutes: null,
    cook_time_minutes: null,
    ingredients: [],
    instructions: [],
    equipment: [],
    notes: targetLocale === "en-GB"
      ? "The AI recipe extraction failed. Please complete this recipe manually."
      : "Die KI-Rezeptextraktion ist fehlgeschlagen. Bitte vervollständige dieses Rezept manuell.",
    total_cost: { min: null, max: null, currency: "EUR" },
    total_macros: { protein_g: null, carbs_g: null, fat_g: null, calories: null },
    per_serving_macros: { protein_g: null, carbs_g: null, fat_g: null, calories: null },
    dietary_substitutions: {},
    group: null,
    tags: [],
    warnings: [targetLocale === "en-GB" ? "AI extraction failed." : "KI-Extraktion fehlgeschlagen."],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Nur POST erlaubt." }, 405);

  const token = Deno.env.get("RECIPE_PARSER_INTERNAL_TOKEN");
  const auth = req.headers.get("Authorization") || "";
  if (!token || auth !== `Bearer ${token}`) return jsonResponse({ error: "Nicht autorisiert." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungueltige JSON-Payload." }, 400);
  }
  const jobId = String(body.job_id || "");
  if (!jobId) return jsonResponse({ error: "job_id fehlt." }, 400);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: job, error: jobError } = await supabaseAdmin
    .from("home_rezept_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return jsonResponse({ error: jobError.message }, 500);
  if (!job) return jsonResponse({ error: "Importjob nicht gefunden." }, 404);

  let settings: Record<string, unknown> | null = null;
  try {
  const { error: updateJobError } = await supabaseAdmin
    .from("home_rezept_import_jobs")
    .update({
      status: "ai_extract",
      progress: 82,
      progress_message: "Rezept wird analysiert.",
      raw_web_extract: body.web_extract || null,
      raw_metadata: body.source || null,
      raw_transcript: [body.caption_transcript, body.transcript].filter(Boolean).join("\n\n") || null,
      transcription_engine: body.transcription_engine || body.engine || null,
      transcription_model: body.transcription_model || body.model || null,
      transcription_device: body.transcription_device || body.device || null,
      transcription_compute_type: body.transcription_compute_type || body.compute_type || null,
      transcription_fallback_used: Boolean(body.transcription_fallback_used),
      transcription_warnings: arr(body.transcription_warnings || body.warnings),
    })
    .eq("id", jobId);
  if (updateJobError) throw updateJobError;

  const { data: loadedSettings, error: settingsError } = await supabaseAdmin
    .from("household_settings")
    .select("ki_provider, openai_api_key, ollama_base_url, ollama_model, kochbuch_ai_model, kochbuch_ki_provider, kochbuch_openai_model, kochbuch_ollama_model, kochbuch_ollama_thinking_enabled, kochbuch_extract_costs, kochbuch_extract_macros")
    .eq("household_id", job.household_id)
    .maybeSingle();
  if (settingsError) throw settingsError;
  settings = loadedSettings || null;

  const targetLocale = normalizeLocale(job.ziel_locale || job.sprache);
  const location = String(job.standort || "Wien, Österreich");
  let recipe: Record<string, unknown>;
  let aiResult: unknown = null;
  const warnings: string[] = [];
  const forceProvider = String(body.force_ai_provider || "").trim() || undefined;

  const cookbookAi = resolveCookbookAi(settings, forceProvider);
  if (!cookbookAi.configured) {
    recipe = fallbackRecipe(body, targetLocale);
    warnings.push(cookbookAi.error);
  } else {
    try {
      const aiPayload = cookbookAi.provider === "ollama" ? compactPayloadForOllama(body) : body;
      const structured = await callKiJson(
        settings || {},
        buildPrompt(aiPayload, targetLocale, location, settings?.kochbuch_extract_macros !== false),
        0.15,
        forceProvider,
      );
      aiResult = {
        provider: structured.provider,
        model: structured.model,
        ...(forceProvider === "openai" ? { fallback_from: "ollama" } : {}),
        structure: structured.raw,
      };
      recipe = structured.parsed;
      if (cookbookAi.provider !== "ollama" && shouldRunInstructionRefinement(body, recipe)) {
        try {
          const refined = await callKiJson(
            settings || {},
            buildInstructionRefinementPrompt(body, recipe, targetLocale),
            0.05,
            forceProvider,
          );
          const refinedInstructions = arr(refined.parsed.instructions).map((item) => String(item || "").trim()).filter(Boolean);
          if (refinedInstructions.length >= arr(recipe.instructions).length) {
            recipe.instructions = refinedInstructions;
          }
          recipe.warnings = [...arr(recipe.warnings), ...arr(refined.parsed.warnings)];
          aiResult = {
            provider: structured.provider,
            model: structured.model,
            ...(forceProvider === "openai" ? { fallback_from: "ollama" } : {}),
            structure: structured.raw,
            instruction_refinement: refined.raw,
          };
        } catch (refineErr) {
          warnings.push(`Instruction refinement failed: ${refineErr instanceof Error ? refineErr.message : String(refineErr)}`);
        }
      }
    } catch (err) {
      if (cookbookAi.provider === "ollama" && err instanceof Error && err.name === "OllamaTimeoutError" && forceProvider !== "openai") {
        const fallbackMessage = "Ollama hat für diese Analyse zu lange gebraucht. Soll dieser Import mit OpenAI fortgesetzt werden?";
        await supabaseAdmin
          .from("home_rezept_import_jobs")
          .update({
            status: "needs_openai_fallback_confirmation",
            progress: 88,
            progress_message: "Ollama-Analyse wartet auf OpenAI-Bestätigung.",
            error_message: fallbackMessage,
            raw_ai_result: {
              provider: cookbookAi.provider,
              model: cookbookAi.model,
              error: err.message,
              retryable_with_openai: true,
              timeout_ms: OLLAMA_ANALYSIS_TIMEOUT_MS,
            },
          })
          .eq("id", jobId);
        return jsonResponse({
          status: "needs_openai_fallback_confirmation",
          job_id: jobId,
          error: fallbackMessage,
          provider: cookbookAi.provider,
          model: cookbookAi.model,
        });
      }
      recipe = fallbackRecipe(body, targetLocale);
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }

  const source = (body.source || {}) as Record<string, unknown>;
  const language = (recipe.language || {}) as Record<string, unknown>;
  const totalCost = (recipe.total_cost || {}) as Record<string, unknown>;
  const totalMacros = (recipe.total_macros || {}) as Record<string, unknown>;
  const perServingMacros = (recipe.per_serving_macros || {}) as Record<string, unknown>;
  const ingredients = arr(recipe.ingredients);
  const instructions = arr(recipe.instructions).map((item) => String(item || "").trim()).filter(Boolean);
  const recipeWarnings = [...arr(recipe.warnings).map(String), ...warnings];
  const normalizedTags = normalizeRecipeTags(recipe, ingredients);

  const title = String(recipe.title || source.title || "Importiertes Rezept").trim();
  const { data: rezept, error: rezeptError } = await supabaseAdmin
    .from("home_rezepte")
    .insert({
      household_id: job.household_id,
      user_id: job.user_id,
      titel: title,
      beschreibung: String(recipe.description || source.description || "").trim() || null,
      quelle_url: job.quelle_url,
      quelle_plattform: job.quelle_plattform,
      quelle_titel: source.title || null,
      quelle_uploader: source.uploader || null,
      thumbnail_url: source.thumbnail_url || null,
      video_dauer_sekunden: source.duration_seconds || body.duration_seconds || null,
      import_typ: job.quelle_plattform === "web" ? "web" : "video",
      analyse_modus: job.analyse_modus,
      sprache: targetLocale,
      original_sprache: language.source_language || body.detected_language || null,
      original_sprache_label: language.source_language_label || null,
      original_sprache_confidence: num(language.source_language_confidence),
      ziel_locale: targetLocale,
      wurde_uebersetzt: Boolean(language.translated),
      localized_content: {
        [targetLocale]: {
          title,
          description: recipe.description || "",
          instructions,
          notes: recipe.notes || "",
          tags: normalizedTags,
          ingredients: ingredients.map((entry) => {
            const item = entry as Record<string, unknown>;
            const amount = parseLooseIngredientAmount(item);
            return {
              name: String(item.name || item.original_text || "Zutat"),
              amount_text: amount.amountText || "",
              original_text: item.original_text ? String(item.original_text) : "",
            };
          }),
        },
      },
      standort: location,
      confidence: num(recipe.confidence),
      gruppe: null,
      portionen: Number(recipe.servings) || 4,
      vorbereitungszeit_minuten: num(recipe.prep_time_minutes),
      kochzeit_minuten: num(recipe.cook_time_minutes),
      gesamtzeit_minuten: num(recipe.total_time_minutes),
      kosten_min: num(totalCost.min),
      kosten_max: num(totalCost.max),
      waehrung: String(totalCost.currency || "EUR"),
      kalorien_gesamt: num(totalMacros.calories),
      protein_gesamt_g: num(totalMacros.protein_g),
      kohlenhydrate_gesamt_g: num(totalMacros.carbs_g),
      fett_gesamt_g: num(totalMacros.fat_g),
      kalorien_pro_portion: num(perServingMacros.calories),
      protein_pro_portion_g: num(perServingMacros.protein_g),
      kohlenhydrate_pro_portion_g: num(perServingMacros.carbs_g),
      fett_pro_portion_g: num(perServingMacros.fat_g),
      anleitung: instructions,
      equipment: arr(recipe.equipment),
      ersatzoptionen: recipe.dietary_substitutions || {},
      notizen: recipe.notes || null,
      tags: normalizedTags,
      status: "review",
      raw_import_result: body,
      warnings: recipeWarnings,
    })
    .select("id")
    .single();
  if (rezeptError) {
    await supabaseAdmin
      .from("home_rezept_import_jobs")
      .update({ status: "failed", error_message: rezeptError.message, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    return jsonResponse({ error: rezeptError.message }, 500);
  }

  if (ingredients.length > 0) {
    const rows = ingredients.map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const amount = parseLooseIngredientAmount(item);
      return {
        rezept_id: rezept.id,
        household_id: job.household_id,
        name: String(item.name || item.original_text || "Zutat"),
        normalized_name: String(item.normalized_name || item.name || "").toLowerCase().trim() || null,
        kategorie: String(item.category || "Lebensmittel"),
        menge: amount.quantity,
        einheit: amount.unit,
        menge_text: amount.amountText,
        original_text: item.original_text ? String(item.original_text) : null,
        geschaetzt: Boolean(item.estimated),
        confidence: num(item.confidence),
        kosten_min: num(item.cost_min),
        kosten_max: num(item.cost_max),
        waehrung: String(item.currency || "EUR"),
        kalorien: num(item.calories),
        protein_g: num(item.protein_g),
        kohlenhydrate_g: num(item.carbs_g),
        fett_g: num(item.fat_g),
        sortierung: index,
      };
    });
    const { error: ingredientsError } = await supabaseAdmin.from("home_rezept_zutaten").insert(rows);
    if (ingredientsError) {
      await supabaseAdmin
        .from("home_rezept_import_jobs")
        .update({
          status: "failed",
          progress: 100,
          progress_message: "Import fehlgeschlagen.",
          error_message: ingredientsError.message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return jsonResponse({ error: ingredientsError.message, job_id: jobId }, 500);
    }
  }

  const { error: finishError } = await supabaseAdmin
    .from("home_rezept_import_jobs")
    .update({
      status: "review",
      progress: 100,
      progress_message: "Review ist bereit.",
      result_rezept_id: rezept.id,
      raw_ai_result: aiResult || recipe,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (finishError) {
    return jsonResponse({ error: finishError.message, job_id: jobId }, 500);
  }

  try {
    await persistRecipeImage({
      id: rezept.id,
      household_id: job.household_id,
      quelle_url: job.quelle_url,
      quelle_plattform: job.quelle_plattform,
      thumbnail_url: source.thumbnail_url || null,
    });
  } catch (imageError) {
    console.warn("Recipe image could not be persisted", {
      recipe_id: rezept.id,
      error: imageError instanceof Error ? imageError.message : String(imageError),
    });
  }

  return jsonResponse({ status: "review", job_id: jobId, rezept_id: rezept.id, warnings: recipeWarnings });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("recipe-import-finalize failed", { job_id: jobId, detail });
    await supabaseAdmin
      .from("home_rezept_import_jobs")
      .update({
        status: "failed",
        progress: 100,
        progress_message: "Import fehlgeschlagen.",
        error_message: `Rezeptanalyse fehlgeschlagen: ${detail}`,
        raw_web_extract: body.web_extract || null,
        raw_metadata: body.source || null,
        raw_transcript: [body.caption_transcript, body.transcript].filter(Boolean).join("\n\n") || null,
        raw_ai_result: {
          error: detail,
          provider: resolveCookbookAi(settings || {}).provider,
          model: resolveCookbookAi(settings || {}).model,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return jsonResponse({
      error: "Rezeptanalyse fehlgeschlagen.",
      detail,
      job_id: jobId,
    }, 500);
  }
});
