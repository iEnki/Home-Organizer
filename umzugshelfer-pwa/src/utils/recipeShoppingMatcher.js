import { createShoppingDraft } from "./einkaufslisteUtils";
import {
  formatIngredientAmount,
  isNonPurchasableRecipeUnit,
  normalizeIngredientName,
  scaleRecipeAmount,
} from "./recipeNormalize";

export async function matchRecipeIngredientsToStock({ supabase, userId, ingredients = [] }) {
  if (!supabase || !userId || ingredients.length === 0) return [];
  const { data } = await supabase
    .from("home_vorraete")
    .select("id, name, bestand, einheit, kategorie")
    .eq("user_id", userId);
  const stock = (data || []).map((item) => ({
    ...item,
    matchName: normalizeIngredientName(item.name),
  }));
  return ingredients.map((ingredient) => {
    const sourceName = ingredient.displayName || ingredient.normalized_name || ingredient.name;
    const name = normalizeIngredientName(sourceName);
    const matched = stock.find((item) => item.matchName === name || item.matchName.includes(name) || name.includes(item.matchName));
    return {
      ...ingredient,
      matched_vorrat_id: matched?.id || null,
      einkauf_noetig: !matched,
    };
  });
}

const normalizeLocale = (locale) => (locale === "en" || locale === "en-GB" ? "en-GB" : "de");

export async function addMissingRecipeIngredientsToShoppingList({ supabase, userId, recipe, ingredients = [], locale = null, servings = null }) {
  if (!supabase || !userId) return { inserted: 0, skipped: 0 };
  const missing = ingredients.filter((item) => item.einkauf_noetig || item.selected);
  if (missing.length === 0) return { inserted: 0, skipped: 0 };

  const { data: existing } = await supabase
    .from("home_einkaufliste")
    .select("id, normalized_name, name, erledigt")
    .eq("user_id", userId)
    .eq("erledigt", false);
  const existingNames = new Set((existing || []).map((item) => normalizeIngredientName(item.normalized_name || item.name)));
  const inserts = [];
  let skipped = 0;

  for (const ingredient of missing) {
    const displayName = ingredient.displayName || ingredient.name;
    const nonPurchasableUnit = isNonPurchasableRecipeUnit(ingredient.einheit);
    const recipeServings = recipe?.portionen || ingredient.original_servings || ingredient.portionen || null;
    const targetServings = servings || recipeServings;
    const scaledAmount = !nonPurchasableUnit && targetServings && recipeServings && Number.isFinite(Number(ingredient.menge))
      ? scaleRecipeAmount(ingredient.menge, recipeServings, targetServings)
      : (nonPurchasableUnit ? null : ingredient.menge);
    const displayAmountText = nonPurchasableUnit
      ? ""
      : formatIngredientAmount(
          { ...ingredient, menge: scaledAmount, original_servings: targetServings, portionen: targetServings },
          targetServings,
          targetServings
        ) || ingredient.displayAmountText || ingredient.menge_text || "";
    const normalized = normalizeIngredientName(ingredient.normalized_name || displayName);
    if (!normalized || existingNames.has(normalized)) {
      skipped += 1;
      continue;
    }
    existingNames.add(normalized);

    const draft = createShoppingDraft({
      item: {
        original_text: [displayAmountText, displayName].filter(Boolean).join(" "),
        name: displayName,
        menge: nonPurchasableUnit ? null : (scaledAmount || 1),
        einheit: nonPurchasableUnit ? null : (ingredient.einheit || undefined),
        no_amount: nonPurchasableUnit,
      },
      correctionMap: new Map(),
      source: "kochbuch",
    });
    const note = `Aus Rezept: ${recipe?.titel || recipe?.title || ""}`.trim();
    const contentLocale = normalizeLocale(locale || recipe?.ziel_locale || recipe?.sprache || "de");

    inserts.push({
      user_id: userId,
      name: draft.name || displayName,
      normalized_name: normalized,
      menge: nonPurchasableUnit ? null : (draft.menge || scaledAmount || 1),
      einheit: nonPurchasableUnit ? null : (draft.einheit || ingredient.einheit || "Stück"),
      kategorie: draft.hauptkategorie || "Lebensmittel",
      hauptkategorie: draft.hauptkategorie || "Lebensmittel",
      unterkategorie: draft.unterkategorie || null,
      confidence: draft.confidence || 0.9,
      review_noetig: Boolean(draft.review_noetig),
      erledigt: false,
      quelle: "kochbuch",
      notizen: note,
      localized_content: {
        [contentLocale]: {
          name: displayName,
          notes: note,
          original_text: [displayAmountText, displayName].filter(Boolean).join(" "),
        },
      },
    });
  }
  if (inserts.length > 0) await supabase.from("home_einkaufliste").insert(inserts);
  return { inserted: inserts.length, skipped };
}
