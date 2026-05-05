jest.mock("../supabaseClient", () => ({
  getActiveHouseholdId: jest.fn(),
  supabase: {},
}));

jest.mock("./kiClient", () => ({
  cleanKiJsonResponse: jest.fn((value) => value),
  getKiClient: jest.fn(),
}));

import { createShoppingDraft } from "./einkaufslisteUtils";

const draftFor = (text) =>
  createShoppingDraft({
    item: { original_text: text },
    correctionMap: new Map(),
  });

describe("shopping categorization", () => {
  test.each(["Speiseöl", "Speiseoel 100 ml", "Olivenöl", "Pflanzenöl"])(
    "%s is classified as oils/sauces",
    (text) => {
      const draft = draftFor(text);
      expect(draft.hauptkategorie).toBe("Lebensmittel");
      expect(draft.unterkategorie).toBe("Gewürze & Saucen");
    }
  );

  test.each(["Tiefkühlpizza", "TK Gemüse", "Pommes"])(
    "%s remains frozen food",
    (text) => {
      const draft = draftFor(text);
      expect(draft.hauptkategorie).toBe("Lebensmittel");
      expect(draft.unterkategorie).toBe("Tiefkühl");
    }
  );
});

describe("shopping amount parsing", () => {
  test.each([
    ["1 Prise Salz", 1, "Prise", "Salz"],
    ["eine Prise Salz", 1, "Prise", "Salz"],
    ["1 Päckchen Backpulver", 1, "Päckchen", "Backpulver"],
    ["2 Teelöffel Vanillezucker", 2, "Teelöffel", "Vanillezucker"],
  ])("%s keeps amount and unit", (text, amount, unit, name) => {
    const draft = draftFor(text);
    expect(draft.menge).toBe(amount);
    expect(draft.einheit).toBe(unit);
    expect(draft.name).toBe(name);
  });
});
