import { createVerlaufQuery, logVerlauf } from "./homeVerlauf";
import { VERLAUF_FILTER_TABELLEN } from "./homeVerlaufPresentation";
import { getActiveHouseholdId } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  getActiveHouseholdId: jest.fn(),
}));

const createInsertClient = () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  return {
    insert,
    supabase: {
      from: jest.fn(() => ({ insert })),
    },
  };
};

const createQueryClient = () => {
  const builder = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
  };
  return {
    builder,
    supabase: {
      from: jest.fn(() => builder),
    },
  };
};

describe("homeVerlauf", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stellt Budget- und Rechnungsfilter bereit", () => {
    expect(VERLAUF_FILTER_TABELLEN).toEqual(
      expect.arrayContaining(["budget_posten", "rechnungen"]),
    );
  });

  it("schreibt household_id in neue Verlaufseintraege, wenn ein Haushalt aktiv ist", async () => {
    getActiveHouseholdId.mockReturnValue("household-1");
    const { supabase, insert } = createInsertClient();

    await logVerlauf(supabase, "user-1", "budget_posten", "Miete", "erstellt");

    expect(supabase.from).toHaveBeenCalledWith("home_verlauf");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      household_id: "household-1",
      tabelle: "budget_posten",
      datensatz_name: "Miete",
      aktion: "erstellt",
    });
  });

  it("nutzt explizite householdId vor aktivem Haushalt", async () => {
    getActiveHouseholdId.mockReturnValue("household-active");
    const { supabase, insert } = createInsertClient();

    await logVerlauf(supabase, "user-1", "rechnungen", "Billa", "erstellt", {
      householdId: "household-explicit",
    });

    expect(insert.mock.calls[0][0].household_id).toBe("household-explicit");
  });

  it("liest Verlauf haushaltsweit mit Legacy-Fallback", () => {
    getActiveHouseholdId.mockReturnValue("household-1");
    const { supabase, builder } = createQueryClient();

    createVerlaufQuery({
      supabase,
      userId: "user-1",
      tabelle: "rechnungen",
      limit: 6,
      select: "aktion",
    });

    expect(supabase.from).toHaveBeenCalledWith("home_verlauf");
    expect(builder.select).toHaveBeenCalledWith("aktion");
    expect(builder.or).toHaveBeenCalledWith(
      "household_id.eq.household-1,and(household_id.is.null,user_id.eq.user-1)",
    );
    expect(builder.eq).toHaveBeenCalledWith("tabelle", "rechnungen");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(6);
  });
});
