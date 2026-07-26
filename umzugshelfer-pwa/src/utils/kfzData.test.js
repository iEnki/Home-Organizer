jest.mock("../supabaseClient", () => ({ supabase: {} }));

import { markFuelEntryReviewed } from "./kfzData";

describe("kfzData fuel review", () => {
  test("clears hidden import review flags after manual confirmation", () => {
    const reviewed = markFuelEntryReviewed({
      id: "fuel-1",
      tankstatus: "voll",
      tankstatus_quelle: "import",
      verbrauch_bestaetigt: false,
      kilometerstand: 158681,
      liter: 23.58,
    });

    expect(reviewed).toMatchObject({
      id: "fuel-1",
      tankstatus: "voll",
      tankstatus_quelle: "manuell",
      verbrauch_bestaetigt: true,
      kilometerstand: 158681,
      liter: 23.58,
    });
  });
});
