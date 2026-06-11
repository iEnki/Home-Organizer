import { getRecipeQualityBadges } from "./recipeQualityBadges";

describe("recipeQualityBadges", () => {
  it("returns badges for imported recipes with source, nutrition and uncertain amounts", () => {
    const badges = getRecipeQualityBadges(
      {
        import_typ: "video",
        status: "review",
        quelle_url: "https://example.com",
        kalorien_pro_portion: 250,
        warnings: ["Die Mengen sind geschaetzt."],
      },
      [{ name: "Mehl", geschaetzt: true }]
    ).map((badge) => badge.key);

    expect(badges).toEqual(expect.arrayContaining([
      "aiImport",
      "reviewOpen",
      "source",
      "nutritionEstimated",
      "uncertainAmounts",
    ]));
  });

  it("keeps manual recipes without signals quiet", () => {
    expect(getRecipeQualityBadges({ import_typ: "manuell", status: "gespeichert" })).toHaveLength(0);
  });
});
