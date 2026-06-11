import { applyManualInvoiceAssistantItems } from "./assistantDomainAdapters";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  getActiveHouseholdId: jest.fn(() => "household-1"),
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("./pushNotifications", () => ({
  notifyHouseholdBatchEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./localizedKnowledge", () => ({
  buildInvoiceKnowledgeContent: jest.fn((summary) => JSON.stringify(summary)),
}));

const insertedByTable = {};

beforeEach(() => {
  Object.keys(insertedByTable).forEach((key) => delete insertedByTable[key]);
  supabase.from.mockImplementation((table) => ({
    select: () => ({
      eq: () => ({
        limit: () => ({
          maybeSingle: async () => ({
            data: table === "household_members" ? { household_id: "household-1" } : null,
            error: null,
          }),
        }),
      }),
    }),
    insert: (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      const insertedRows = rows.map((row, index) => ({
        id: `${table}-${(insertedByTable[table] || []).length + index + 1}`,
        ...row,
      }));
      insertedByTable[table] = [...(insertedByTable[table] || []), ...insertedRows];
      return {
        select: () => ({
          single: async () => ({ data: insertedRows[0], error: null }),
          then: (resolve) => resolve({ data: insertedRows, error: null }),
        }),
      };
    },
    delete: () => ({ eq: jest.fn(() => Promise.resolve({ error: null })) }),
  }));
});

test("manual invoice assistant writes invoice positions without generated prices", async () => {
  const result = await applyManualInvoiceAssistantItems({
    session: { user: { id: "user-1" } },
    items: [{
      lieferant_name: "Rewe",
      brutto: 25.3,
      beschreibung: "Lebensmittel",
      kategorie: "Lebensmittel",
      rechnungsdatum: "2026-05-07",
      positionen: [
        { beschreibung: "Milch" },
        { beschreibung: "Brot" },
        { beschreibung: "Eier" },
        { beschreibung: "Kaese" },
        { beschreibung: "Kaffee" },
      ],
    }],
  });

  expect(result.count).toBe(1);
  expect(insertedByTable.dokumente[0].storage_pfad).toMatch(
    /^user-1\/assistant-manual\/\d+-Rewe 2026-05-07\.pdf$/,
  );
  expect(insertedByTable.home_wissen[0].herkunft).toBe("auto_full");
  expect(insertedByTable.rechnungs_positionen).toHaveLength(5);
  expect(insertedByTable.rechnungs_positionen[0]).toMatchObject({
    household_id: "household-1",
    rechnung_id: "rechnungen-1",
    pos_nr: 1,
    beschreibung: "Milch",
    menge: null,
    einzelpreis: null,
    gesamtpreis: null,
    klassifikation: {
      source: "global_assistant",
      budget_kategorie: "Lebensmittel",
    },
  });
  expect(insertedByTable.home_wissen[0].summary.items).toHaveLength(5);
  expect(result.receipts[0].result_payload.rechnungs_positionen).toHaveLength(5);
});
