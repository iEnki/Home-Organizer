jest.mock("./einkaufslisteUtils", () => ({
  createShoppingDraft: ({ item }) => ({
    name: item.name,
    menge: item.menge,
    einheit: item.einheit,
    original_text: item.original_text,
    hauptkategorie: "Lebensmittel",
    unterkategorie: null,
    confidence: 0.9,
    review_noetig: false,
  }),
}));

const { combinePlannerPreviewItems } = require("./recipeShoppingPreview");

describe("recipeShoppingPreview", () => {
  it("combines compatible planner ingredients", () => {
    const combined = combinePlannerPreviewItems([
      {
        items: [
          {
            id: "a",
            key: "mehl",
            name: "Mehl",
            status: "missing",
            selected: true,
            recipeTitle: "Pizza",
            draft: { name: "Mehl", menge: 200, einheit: "g", original_text: "200 g Mehl" },
          },
        ],
      },
      {
        items: [
          {
            id: "b",
            key: "mehl",
            name: "Mehl",
            status: "missing",
            selected: true,
            recipeTitle: "Kuchen",
            draft: { name: "Mehl", menge: 100, einheit: "g", original_text: "100 g Mehl" },
          },
        ],
      },
    ]);

    expect(combined.items).toHaveLength(1);
    expect(combined.items[0].draft.menge).toBe(300);
    expect(combined.selectedIds).toHaveLength(1);
  });

  it("keeps incompatible units separate", () => {
    const combined = combinePlannerPreviewItems([
      {
        items: [
          {
            id: "a",
            key: "milch",
            name: "Milch",
            status: "missing",
            selected: true,
            draft: { name: "Milch", menge: 1, einheit: "l" },
          },
          {
            id: "b",
            key: "milch",
            name: "Milch",
            status: "missing",
            selected: true,
            draft: { name: "Milch", menge: 250, einheit: "ml" },
          },
        ],
      },
    ]);

    expect(combined.items).toHaveLength(2);
  });

  it("keeps selected inserts separate when units differ", async () => {
    const { insertSelectedPreviewItems } = require("./recipeShoppingPreview");
    const insert = jest.fn().mockResolvedValue({ error: null });
    const supabase = { from: jest.fn(() => ({ insert })) };
    const previewItems = [
      {
        id: "a",
        status: "missing",
        name: "Milch",
        recipeTitle: "A",
        draft: { name: "Milch", menge: 1, einheit: "l", hauptkategorie: "Lebensmittel" },
      },
      {
        id: "b",
        status: "missing",
        name: "Milch",
        recipeTitle: "B",
        draft: { name: "Milch", menge: 250, einheit: "ml", hauptkategorie: "Lebensmittel" },
      },
    ];

    const result = await insertSelectedPreviewItems({
      supabase,
      userId: "user",
      previewItems,
      selectedIds: ["a", "b"],
    });

    expect(result.inserted).toBe(2);
    expect(insert.mock.calls[0][0]).toHaveLength(2);
  });
});
