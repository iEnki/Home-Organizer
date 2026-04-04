jest.mock("../supabaseClient", () => ({
  supabase: {},
  getActiveHouseholdId: jest.fn(() => null),
}));

jest.mock("./kiClient", () => ({
  cleanKiJsonResponse: (value) => value,
  getKiClient: jest.fn(),
}));

import {
  applyLegacyShoppingFields,
  buildShoppingGroups,
  createShoppingDraft,
  filterShoppingEntries,
  getDuplicateSuggestions,
  prepareShoppingBatch,
} from "./einkaufslisteUtils";

describe("einkaufslisteUtils", () => {
  test("mappt Legacy-Kategorien auf die neue Taxonomie", () => {
    const entry = applyLegacyShoppingFields({
      id: "1",
      name: "Badreiniger",
      menge: 1,
      einheit: "Flasche",
      kategorie: "Reinigung",
      erledigt: false,
    });

    expect(entry.hauptkategorie).toBe("Haushalt");
    expect(entry.unterkategorie).toBe("Reinigung");
    expect(entry.review_noetig).toBe(false);
  });

  test("erzeugt Drafts mit Regelklassifizierung und Review-Fallback", () => {
    const milch = createShoppingDraft({
      item: { original_text: "2 Liter Milch" },
      correctionMap: new Map(),
      source: "manuell",
    });
    const unbekannt = createShoppingDraft({
      item: { original_text: "Spezialdingens" },
      correctionMap: new Map(),
      source: "manuell",
    });

    expect(milch.name).toBe("Milch");
    expect(milch.hauptkategorie).toBe("Lebensmittel");
    expect(milch.unterkategorie).toBe("Milchprodukte");
    expect(milch.review_noetig).toBe(false);

    expect(unbekannt.hauptkategorie).toBe("Sonstiges");
    expect(unbekannt.review_noetig).toBe(true);
  });

  test("dedupliziert Batch-Einträge und erkennt Merge-Kandidaten", async () => {
    const result = await prepareShoppingBatch({
      rawItems: [
        { original_text: "Milch 1 Liter" },
        { original_text: "Milch 2 Liter" },
        { original_text: "Küchenrolle" },
      ],
      userId: "user-1",
      source: "manuell",
      corrections: [],
      existingEntries: [
        {
          id: "existing-1",
          name: "Milch",
          normalized_name: "Milch",
          menge: 1,
          einheit: "Liter",
          hauptkategorie: "Lebensmittel",
          unterkategorie: "Milchprodukte",
          erledigt: false,
        },
      ],
    });

    const milchDraft = result.drafts.find((draft) => draft.name === "Milch");
    expect(result.drafts).toHaveLength(2);
    expect(milchDraft.menge).toBe(3);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].existing_entry.id).toBe("existing-1");
  });

  test("filtert und gruppiert nach Markt-Reihenfolge", () => {
    const entries = [
      {
        id: "1",
        name: "Milch",
        normalized_name: "Milch",
        menge: 1,
        einheit: "Liter",
        hauptkategorie: "Lebensmittel",
        unterkategorie: "Milchprodukte",
        erledigt: false,
      },
      {
        id: "2",
        name: "Bananen",
        normalized_name: "Bananen",
        menge: 6,
        einheit: "Stück",
        hauptkategorie: "Lebensmittel",
        unterkategorie: "Obst & Gemüse",
        erledigt: false,
      },
      {
        id: "3",
        name: "Pflaster",
        normalized_name: "Pflaster",
        menge: 1,
        einheit: "Packung",
        hauptkategorie: "Apotheke / Gesundheit",
        unterkategorie: "Erste Hilfe",
        review_noetig: true,
        erledigt: false,
      },
    ];

    const filtered = filterShoppingEntries(entries, { filter: "Prüfen", search: "pflaster" });
    const groups = buildShoppingGroups(entries, "Markt");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Pflaster");
    expect(groups.map((group) => group.label)).toEqual([
      "Obst & Gemüse",
      "Milchprodukte",
      "Erste Hilfe",
    ]);
  });

  test("erkennt kompatible Duplikate über normalized_name und Einheit", () => {
    const duplicates = getDuplicateSuggestions(
      [
        {
          client_id: "draft-1",
          name: "Küchenrolle",
          normalized_name: "Küchenrolle",
          einheit: "Rolle",
          erledigt: false,
        },
      ],
      [
        {
          id: "entry-1",
          name: "Küchenrolle",
          normalized_name: "Küchenrolle",
          einheit: "Rolle",
          erledigt: false,
        },
      ]
    );

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].existing_id).toBe("entry-1");
  });
});
