import {
  resolveLocalizedRecipe,
  resolveLocalizedRecipeIngredients,
  resolveLocalizedShoppingEntry,
  translateShoppingEntryIfMissing,
} from "./localizedRecipeShopping";
import { getKiClient } from "./kiClient";

jest.mock("./kiClient", () => ({
  cleanKiJsonResponse: jest.fn((value) => value),
  getKiClient: jest.fn(),
}));

describe("localized recipe resolver", () => {
  test("uses cached target locale and falls back to base fields", () => {
    const recipe = {
      titel: "Topfenherzen",
      beschreibung: "Schnelles Gebäck",
      anleitung: ["Teig mischen."],
      localized_content: {
        "en-GB": {
          title: "Quark hearts",
          instructions: ["Mix the dough."],
          ingredients: [{ name: "Salt", amount_text: "1 pinch", original_text: "1 pinch salt" }],
        },
      },
    };

    expect(resolveLocalizedRecipe(recipe, "en-GB")).toEqual({
      title: "Quark hearts",
      description: "Schnelles Gebäck",
      instructions: ["Mix the dough."],
      notes: "",
      tags: [],
    });
    expect(resolveLocalizedRecipe(recipe, "de").title).toBe("Topfenherzen");
    expect(resolveLocalizedRecipeIngredients(recipe, [{ name: "Salz", menge_text: "1 Prise" }], "en-GB")[0])
      .toMatchObject({ displayName: "Salt", displayAmountText: "1 pinch" });
  });
});

describe("localized shopping resolver", () => {
  test("uses cached shopping-list item translation", () => {
    const entry = {
      name: "Speiseöl",
      notizen: "Aus Rezept",
      localized_content: {
        "en-GB": { name: "Cooking oil", notes: "From recipe" },
      },
    };

    expect(resolveLocalizedShoppingEntry(entry, "en-GB")).toEqual({
      name: "Cooking oil",
      notes: "From recipe",
      originalText: "",
    });
  });

  test("translates a shopping item back from cached English to German", async () => {
    const update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    const supabase = { from: jest.fn(() => ({ update })) };
    getKiClient.mockResolvedValue({
      model: "test-model",
      client: {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: JSON.stringify({ name: "Salz", notes: "Aus Rezept", original_text: "1 Prise Salz" }) } }],
            }),
          },
        },
      },
    });

    const result = await translateShoppingEntryIfMissing({
      supabase,
      userId: "user-1",
      locale: "de",
      entry: {
        id: "item-1",
        name: "Salt",
        original_text: "1 pinch Salt",
        localized_content: {
          "en-GB": { name: "Salt", notes: "From recipe", original_text: "1 pinch Salt" },
        },
      },
    });

    expect(result.localized_content.de.name).toBe("Salz");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      localized_content: expect.objectContaining({
        de: expect.objectContaining({ name: "Salz" }),
      }),
    }));
  });
});
