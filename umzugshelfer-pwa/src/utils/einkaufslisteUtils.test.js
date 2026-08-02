jest.mock("../supabaseClient", () => ({
  getActiveHouseholdId: jest.fn(),
  supabase: {},
}));

jest.mock("./kiClient", () => ({
  cleanKiJsonResponse: (value) => value,
  getKiClient: jest.fn(),
}));

import { getKiClient } from "./kiClient";
import { prepareShoppingBatch } from "./einkaufslisteUtils";

beforeEach(() => {
  jest.clearAllMocks();
});

test("skips AI classification for a confidently known shopping item", async () => {
  const result = await prepareShoppingBatch({
    rawItems: ["Milch"],
    userId: "user-1",
    corrections: [],
    existingEntries: [],
  });

  expect(result.aiStatus).toBe("not-needed");
  expect(result.warnings).toEqual([]);
  expect(result.drafts[0]).toMatchObject({
    hauptkategorie: "Lebensmittel",
    review_noetig: false,
  });
  expect(getKiClient).not.toHaveBeenCalled();
});

test("marks the result as fallback when AI classification is unavailable", async () => {
  getKiClient.mockRejectedValue(Object.assign(
    new Error("OpenAI hat nicht rechtzeitig geantwortet."),
    { code: "UPSTREAM_TIMEOUT" },
  ));

  const result = await prepareShoppingBatch({
    rawItems: ["Quendorplax"],
    userId: "user-1",
    corrections: [],
    existingEntries: [],
  });

  expect(result.aiStatus).toBe("fallback");
  expect(result.warnings).toEqual([
    expect.objectContaining({
      code: "UPSTREAM_TIMEOUT",
    }),
  ]);
  expect(result.drafts[0]).toMatchObject({
    hauptkategorie: "Sonstiges",
    review_noetig: true,
  });
});

test("marks a successful AI classification as used", async () => {
  getKiClient.mockResolvedValue({
    model: "configured-server-model",
    client: {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify([{
                  original_text: "Quendorplax",
                  normalized_name: "Quendorplax",
                  hauptkategorie: "Haushalt",
                  unterkategorie: "Reinigung",
                  confidence: 0.96,
                }]),
              },
            }],
          }),
        },
      },
    },
  });

  const result = await prepareShoppingBatch({
    rawItems: ["Quendorplax"],
    userId: "user-1",
    corrections: [],
    existingEntries: [],
  });

  expect(result.aiStatus).toBe("used");
  expect(result.warnings).toEqual([]);
  expect(result.drafts[0]).toMatchObject({
    hauptkategorie: "Haushalt",
    unterkategorie: "Reinigung",
    review_noetig: false,
  });
});
