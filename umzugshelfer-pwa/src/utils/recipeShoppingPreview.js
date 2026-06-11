import { createShoppingDraft } from "./einkaufslisteUtils";
import {
  formatIngredientAmount,
  isNonPurchasableRecipeUnit,
  normalizeIngredientName,
  normalizeRecipeUnitKey,
  scaleRecipeAmount,
} from "./recipeNormalize";

const normalizeLocale = (locale) => (locale === "en" || locale === "en-GB" ? "en-GB" : "de");

function itemKey(item) {
  return normalizeIngredientName(item?.normalized_name || item?.displayName || item?.name || item?.original_text);
}

function amountForServings(ingredient, recipe, servings) {
  const recipeServings = recipe?.portionen || ingredient.original_servings || ingredient.portionen || null;
  const targetServings = servings || recipeServings;
  const nonPurchasableUnit = isNonPurchasableRecipeUnit(ingredient.einheit);
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
  return { scaledAmount, displayAmountText, nonPurchasableUnit };
}

async function fetchOpenShoppingEntries({ supabase, userId }) {
  const { data } = await supabase
    .from("home_einkaufliste")
    .select("id, normalized_name, name, erledigt")
    .eq("user_id", userId)
    .eq("erledigt", false);
  return data || [];
}

async function fetchStock({ supabase, userId }) {
  const { data } = await supabase
    .from("home_vorraete")
    .select("id, name, bestand, einheit, kategorie")
    .eq("user_id", userId);
  return (data || []).map((item) => ({
    ...item,
    matchName: normalizeIngredientName(item.name),
  }));
}

export async function buildRecipeShoppingPreview({
  supabase,
  userId,
  recipe,
  ingredients = [],
  servings = null,
  locale = "de",
}) {
  if (!supabase || !userId || !recipe) return { items: [], grouped: {}, selectedIds: [] };
  const [openEntries, stock] = await Promise.all([
    fetchOpenShoppingEntries({ supabase, userId }),
    fetchStock({ supabase, userId }),
  ]);
  const openNames = new Set(openEntries.map((entry) => normalizeIngredientName(entry.normalized_name || entry.name)));

  const items = (ingredients || []).map((ingredient, index) => {
    const displayName = ingredient.displayName || ingredient.name;
    const key = itemKey(ingredient);
    const stockMatch = key
      ? stock.find((item) => item.matchName === key || item.matchName.includes(key) || key.includes(item.matchName))
      : null;
    const alreadyOpen = openNames.has(key);
    const uncertain = Boolean(ingredient.geschaetzt || ingredient.einkauf_noetig === null || Number(ingredient.confidence || 1) < 0.6);
    const { scaledAmount, displayAmountText, nonPurchasableUnit } = amountForServings(ingredient, recipe, servings);
    const status = alreadyOpen ? "existing" : stockMatch ? "available" : uncertain ? "uncertain" : "missing";
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
    return {
      id: `${recipe.id || "recipe"}-${ingredient.id || index}`,
      recipeId: recipe.id,
      recipeTitle: recipe.titel || recipe.title || "",
      ingredient,
      draft,
      key,
      name: displayName,
      amountText: displayAmountText,
      category: draft.hauptkategorie || ingredient.kategorie || "Lebensmittel",
      status,
      selected: status === "missing" || status === "uncertain",
      stockMatch,
      existingEntry: alreadyOpen ? openEntries.find((entry) => normalizeIngredientName(entry.normalized_name || entry.name) === key) : null,
      locale: normalizeLocale(locale || recipe.ziel_locale || recipe.sprache || "de"),
    };
  });

  return {
    items,
    grouped: groupPreviewItems(items),
    selectedIds: items.filter((item) => item.selected).map((item) => item.id),
  };
}

export function groupPreviewItems(items = []) {
  return items.reduce((acc, item) => {
    const group = item.status || "missing";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

export function combinePlannerPreviewItems(previews = []) {
  const combined = new Map();
  const separate = [];

  previews.flatMap((preview) => preview.items || []).forEach((item) => {
    const unitKey = normalizeRecipeUnitKey(item.draft?.einheit || item.ingredient?.einheit || "");
    const key = `${item.key}|${unitKey}`;
    if (!unitKey || item.status === "existing" || item.status === "available") {
      separate.push(item);
      return;
    }
    const current = combined.get(key);
    if (!current) {
      combined.set(key, { ...item, sourceItems: [item] });
      return;
    }
    current.sourceItems.push(item);
    current.draft = {
      ...current.draft,
      menge: Number(current.draft?.menge || 0) + Number(item.draft?.menge || 0),
      original_text: `${current.draft?.original_text || current.name} + ${item.draft?.original_text || item.name}`,
    };
    current.recipeTitle = Array.from(new Set([...current.sourceItems.map((source) => source.recipeTitle).filter(Boolean)])).join(", ");
    current.amountText = current.draft.einheit ? `${current.draft.menge} ${current.draft.einheit}` : current.amountText;
  });

  const items = [...combined.values(), ...separate].map((item, index) => ({ ...item, id: `planner-${index}-${item.id}` }));
  return {
    items,
    grouped: groupPreviewItems(items),
    selectedIds: items.filter((item) => item.selected).map((item) => item.id),
  };
}

export async function insertSelectedPreviewItems({ supabase, userId, previewItems = [], selectedIds = [], locale = "de" }) {
  if (!supabase || !userId) return { inserted: 0, skipped: 0 };
  const selectedSet = new Set(selectedIds);
  const inserts = [];
  const seen = new Set();
  let skipped = 0;

  for (const item of previewItems) {
    if (!selectedSet.has(item.id) || item.status === "available" || item.status === "existing") {
      skipped += 1;
      continue;
    }
    const normalized = normalizeIngredientName(item.draft?.normalized_name || item.draft?.name || item.name);
    const unitKey = normalizeRecipeUnitKey(item.draft?.einheit || item.ingredient?.einheit || "");
    const insertKey = `${normalized}|${unitKey}`;
    if (!normalized || seen.has(insertKey)) {
      skipped += 1;
      continue;
    }
    seen.add(insertKey);
    const note = `Aus Rezept: ${item.recipeTitle || ""}`.trim();
    const contentLocale = normalizeLocale(locale || item.locale || "de");
    inserts.push({
      user_id: userId,
      name: item.draft?.name || item.name,
      normalized_name: normalized,
      menge: item.draft?.no_amount ? null : (item.draft?.menge || 1),
      einheit: item.draft?.no_amount ? null : (item.draft?.einheit || "Stück"),
      kategorie: item.draft?.hauptkategorie || item.category || "Lebensmittel",
      hauptkategorie: item.draft?.hauptkategorie || item.category || "Lebensmittel",
      unterkategorie: item.draft?.unterkategorie || null,
      confidence: item.draft?.confidence || 0.9,
      review_noetig: Boolean(item.draft?.review_noetig || item.status === "uncertain"),
      erledigt: false,
      quelle: "kochbuch",
      notizen: note,
      localized_content: {
        [contentLocale]: {
          name: item.draft?.name || item.name,
          notes: note,
          original_text: item.draft?.original_text || item.name,
        },
      },
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("home_einkaufliste").insert(inserts);
    if (error) throw error;
  }

  return { inserted: inserts.length, skipped };
}
