export function normalizeIngredientName(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9äöüß ]/gi, "")
    .replace(/\s+/g, " ");
}

export function scaleRecipeAmount(value, fromServings, toServings) {
  const amount = Number(value);
  const from = Number(fromServings);
  const to = Number(toServings);
  if (!Number.isFinite(amount) || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0) {
    return value;
  }
  const scaled = amount * (to / from);
  return Math.round(scaled * 100) / 100;
}

const NON_PURCHASABLE_UNITS = new Set([
  "prise",
  "prisen",
  "pinch",
  "etwas",
  "some",
  "nach geschmack",
  "to taste",
]);

export function normalizeRecipeUnitKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ");
}

export function isNonPurchasableRecipeUnit(unit) {
  return NON_PURCHASABLE_UNITS.has(normalizeRecipeUnitKey(unit));
}

export function formatIngredientAmount(ingredient, servings, fallbackServings = null) {
  if (!ingredient) return "";
  const hasNumericAmount = Number.isFinite(Number(ingredient.menge));
  const originalServings = ingredient.original_servings || ingredient.portionen || fallbackServings || null;
  const amount = hasNumericAmount && originalServings
    ? scaleRecipeAmount(ingredient.menge, originalServings, servings)
    : ingredient.menge;
  if (isNonPurchasableRecipeUnit(ingredient.einheit)) {
    if (hasNumericAmount && Number(amount) > 0) return `${amount} ${ingredient.einheit}`;
    const text = ingredient.displayAmountText || ingredient.menge_text || "";
    return /^0(?:[.,]0+)?\s+/i.test(String(text).trim()) ? "" : text;
  }
  if (hasNumericAmount && amount != null && ingredient.einheit) return `${amount} ${ingredient.einheit}`;
  return ingredient.displayAmountText || ingredient.menge_text || "";
}
