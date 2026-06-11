import { renderHook, waitFor } from "@testing-library/react";
import useKfzData from "./useKfzData";
import { supabase } from "../supabaseClient";
import { syncFuelImports } from "../utils/kfzFuelImports";

jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn() },
}));
jest.mock("../utils/kfzFuelImports", () => ({
  syncFuelImports: jest.fn(),
}));

const queryFor = (table, responseFactory) => {
  let householdId = "";
  return {
    select() { return this; },
    eq(column, value) {
      if (column === "household_id") householdId = value;
      return this;
    },
    order() {
      return responseFactory(table, householdId);
    },
  };
};

describe("useKfzData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    syncFuelImports.mockResolvedValue({ report: {} });
  });

  test("isolates optional table errors without hiding vehicles", async () => {
    supabase.from.mockImplementation((table) => queryFor(table, async () => (
      table === "vertraege"
        ? { data: null, error: new Error("optional unavailable") }
        : { data: table === "home_fahrzeuge" ? [{ id: "vehicle-1" }] : [], error: null }
    )));

    const { result } = renderHook(() => useKfzData({ householdId: "household-1", userId: "user-1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.vehicles).toEqual([{ id: "vehicle-1" }]);
    expect(result.current.loadError).toBe("");
    expect(result.current.warnings.join(" ")).toMatch(/vertraege/);
  });

  test("ignores a late response from the previous household", async () => {
    let releaseFirst;
    const firstHousehold = new Promise((resolve) => { releaseFirst = resolve; });
    supabase.from.mockImplementation((table) => queryFor(table, async (_, householdId) => {
      if (householdId === "household-1") await firstHousehold;
      return {
        data: table === "home_fahrzeuge" ? [{ id: householdId }] : [],
        error: null,
      };
    }));

    const { result, rerender } = renderHook(
      ({ householdId }) => useKfzData({ householdId, userId: "user-1" }),
      { initialProps: { householdId: "household-1" } },
    );
    rerender({ householdId: "household-2" });
    await waitFor(() => expect(result.current.data.vehicles).toEqual([{ id: "household-2" }]));
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.data.vehicles).toEqual([{ id: "household-2" }]);
  });
});
