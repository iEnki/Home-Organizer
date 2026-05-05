import { cleanKiJsonResponse, getKiClient } from "./kiClient";

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
};

const hasValue = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export const hasRecipeNutrition = (recipe) =>
  Boolean(
    recipe &&
      hasValue(recipe.kalorien_pro_portion) &&
      hasValue(recipe.protein_pro_portion_g) &&
      hasValue(recipe.kohlenhydrate_pro_portion_g) &&
      hasValue(recipe.fett_pro_portion_g)
  );

export const nutritionSummaryParts = (recipe, t) => {
  if (!hasRecipeNutrition(recipe)) return [];
  return [
    `${Math.round(Number(recipe.kalorien_pro_portion))} ${t("nutrition.calories")}`,
    `${numberOrNull(recipe.protein_pro_portion_g)}g ${t("nutrition.protein")}`,
    `${numberOrNull(recipe.kohlenhydrate_pro_portion_g)}g ${t("nutrition.carbs")}`,
    `${numberOrNull(recipe.fett_pro_portion_g)}g ${t("nutrition.fat")}`,
  ];
};

const parseJsonObject = (raw) => {
  const cleaned = cleanKiJsonResponse(raw || "{}", "object") || "{}";
  return JSON.parse(cleaned);
};

const buildNutritionPayload = (recipe, ingredients = [], locale) => ({
  target_locale: locale,
  recipe: {
    title: recipe?.titel || recipe?.title || "",
    description: recipe?.beschreibung || recipe?.description || "",
    servings: recipe?.portionen || 4,
    instructions: Array.isArray(recipe?.anleitung) ? recipe.anleitung : [],
  },
  ingredients: ingredients.map((item) => ({
    name: item.displayName || item.name || "",
    amount: item.menge ?? null,
    unit: item.einheit || "",
    amount_text: item.displayAmountText || item.menge_text || "",
    original_text: item.displayOriginalText || item.original_text || "",
  })),
});

const normaliseEstimate = (estimate, servings) => {
  const per = estimate?.per_serving || estimate?.perServing || {};
  const total = estimate?.total || {};
  const s = Number(servings) > 0 ? Number(servings) : 4;
  const caloriesPer = numberOrNull(per.calories ?? per.kalorien ?? (hasValue(total.calories ?? total.kalorien) ? Number(total.calories ?? total.kalorien) / s : null));
  const proteinPer = numberOrNull(per.protein_g ?? per.protein ?? (hasValue(total.protein_g ?? total.protein) ? Number(total.protein_g ?? total.protein) / s : null));
  const carbsPer = numberOrNull(per.carbs_g ?? per.carbohydrates_g ?? per.kohlenhydrate_g ?? (hasValue(total.carbs_g ?? total.carbohydrates_g ?? total.kohlenhydrate_g) ? Number(total.carbs_g ?? total.carbohydrates_g ?? total.kohlenhydrate_g) / s : null));
  const fatPer = numberOrNull(per.fat_g ?? per.fett_g ?? (hasValue(total.fat_g ?? total.fett_g) ? Number(total.fat_g ?? total.fett_g) / s : null));
  if (![caloriesPer, proteinPer, carbsPer, fatPer].every((value) => hasValue(value))) return null;
  return {
    kalorien_pro_portion: caloriesPer,
    protein_pro_portion_g: proteinPer,
    kohlenhydrate_pro_portion_g: carbsPer,
    fett_pro_portion_g: fatPer,
    kalorien_gesamt: numberOrNull(total.calories ?? total.kalorien ?? caloriesPer * s),
    protein_gesamt_g: numberOrNull(total.protein_g ?? total.protein ?? proteinPer * s),
    kohlenhydrate_gesamt_g: numberOrNull(total.carbs_g ?? total.carbohydrates_g ?? total.kohlenhydrate_g ?? carbsPer * s),
    fett_gesamt_g: numberOrNull(total.fat_g ?? total.fett_g ?? fatPer * s),
  };
};

export async function estimateRecipeNutritionIfMissing({ supabase, userId, recipe, ingredients = [], locale = "de", force = false }) {
  if (!supabase || !userId || !recipe?.id || (!force && hasRecipeNutrition(recipe))) return recipe;
  const { client, model } = await getKiClient(userId);
  const response = await client.chat.completions.create({
    model,
    context: "kochbuch",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Estimate recipe nutrition from ingredients and servings. Return only JSON. Use realistic food database knowledge. If exact values are unavailable, estimate conservatively and set estimated=true.",
      },
      {
        role: "user",
        content: JSON.stringify({
          required_shape: {
            total: { calories: "number", protein_g: "number", carbs_g: "number", fat_g: "number" },
            per_serving: { calories: "number", protein_g: "number", carbs_g: "number", fat_g: "number" },
            estimated: true,
            warnings: ["string"],
          },
          ...buildNutritionPayload(recipe, ingredients, locale),
        }),
      },
    ],
  });
  const parsed = parseJsonObject(response?.choices?.[0]?.message?.content || "{}");
  const nutrition = normaliseEstimate(parsed, recipe.portionen || 4);
  if (!nutrition) return recipe;
  const nextWarnings = Array.isArray(recipe.warnings) ? [...recipe.warnings] : [];
  if (!nextWarnings.some((warning) => String(warning).includes("nutrition_estimated"))) {
    nextWarnings.push({ type: "nutrition_estimated", message: "Nährwerte wurden geschätzt." });
  }
  const patch = { ...nutrition, warnings: nextWarnings };
  const { error } = await supabase.from("home_rezepte").update(patch).eq("id", recipe.id);
  if (error) throw error;
  return { ...recipe, ...patch };
}
