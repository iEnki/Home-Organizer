import { normalizeIngredientName } from "./recipeNormalize";

const TITLE_STOP_WORDS = new Set([
  "rezept",
  "recipe",
  "einfach",
  "schnell",
  "easy",
  "quick",
  "homemade",
  "hausgemacht",
]);

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((part) => part && !TITLE_STOP_WORDS.has(part))
    .join(" ");
}

function tokenSet(value) {
  return new Set(normalizeTitle(value).split(/\s+/).filter(Boolean));
}

function ingredientSet(ingredients = []) {
  return new Set(
    (ingredients || [])
      .map((item) => normalizeIngredientName(item?.displayName || item?.name || item?.normalized_name || item?.original_text))
      .filter(Boolean)
  );
}

function overlapScore(leftSet, rightSet) {
  if (!leftSet.size || !rightSet.size) return { shared: 0, ratio: 0 };
  const shared = Array.from(leftSet).filter((item) => rightSet.has(item)).length;
  return { shared, ratio: shared / Math.min(leftSet.size, rightSet.size) };
}

export function findSimilarRecipes({
  recipes = [],
  ingredientsByRecipe = {},
  candidateRecipe = {},
  candidateIngredients = [],
  excludeRecipeId = null,
  limit = 5,
} = {}) {
  const candidateTitle = candidateRecipe?.titel || candidateRecipe?.title || "";
  const candidateTitleTokens = tokenSet(candidateTitle);
  const candidateIngredientSet = ingredientSet(candidateIngredients);

  return (recipes || [])
    .filter((recipe) => recipe?.id && recipe.id !== excludeRecipeId)
    .map((recipe) => {
      const titleOverlap = overlapScore(candidateTitleTokens, tokenSet(recipe.titel || recipe.title));
      const ingredientOverlap = overlapScore(candidateIngredientSet, ingredientSet(ingredientsByRecipe[recipe.id] || []));
      const strongTitle = candidateTitleTokens.size > 0 && titleOverlap.ratio >= 0.75;
      const ingredientMatch = ingredientOverlap.shared >= 3 && ingredientOverlap.ratio >= 0.6;
      const titleIngredientMatch = strongTitle && ingredientOverlap.shared >= 2;
      const score = Math.max(
        titleOverlap.ratio * 0.45 + ingredientOverlap.ratio * 0.55,
        ingredientMatch ? 0.82 : 0,
        titleIngredientMatch ? 0.78 : 0
      );
      return {
        recipe,
        score,
        sharedIngredients: ingredientOverlap.shared,
        titleSimilarity: titleOverlap.ratio,
        ingredientSimilarity: ingredientOverlap.ratio,
        isDuplicateLike: ingredientMatch || titleIngredientMatch,
      };
    })
    .filter((match) => match.isDuplicateLike)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function hasSimilarRecipes(options) {
  return findSimilarRecipes(options).length > 0;
}
