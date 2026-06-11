import { findSimilarRecipes } from "./recipeDuplicateMatcher";

describe("recipeDuplicateMatcher", () => {
  const recipes = [
    { id: "1", titel: "Krep Pizza" },
    { id: "2", titel: "Tomatensuppe" },
  ];
  const ingredientsByRecipe = {
    1: [{ name: "Mehl" }, { name: "Milch" }, { name: "Ei" }, { name: "Kaese" }],
    2: [{ name: "Tomaten" }, { name: "Zwiebel" }],
  };

  it("warns for similar title and shared ingredients", () => {
    const matches = findSimilarRecipes({
      recipes,
      ingredientsByRecipe,
      candidateRecipe: { titel: "Crepe Pizza Rezept" },
      candidateIngredients: [{ name: "Mehl" }, { name: "Milch" }, { name: "Ei" }],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].recipe.id).toBe("1");
  });

  it("does not warn for unrelated recipes", () => {
    const matches = findSimilarRecipes({
      recipes,
      ingredientsByRecipe,
      candidateRecipe: { titel: "Schoko Kuchen" },
      candidateIngredients: [{ name: "Kakao" }, { name: "Zucker" }, { name: "Butter" }],
    });

    expect(matches).toHaveLength(0);
  });

  it("ignores the edited recipe itself", () => {
    const matches = findSimilarRecipes({
      recipes,
      ingredientsByRecipe,
      candidateRecipe: { titel: "Krep Pizza" },
      candidateIngredients: ingredientsByRecipe[1],
      excludeRecipeId: "1",
    });

    expect(matches).toHaveLength(0);
  });
});
