import {
  deleteBudgetCategoryDirect,
  loadCategoryDeleteImpact,
  reassignAndDeleteBudgetCategory,
} from "./budgetCategoryDelete";

class FakeQuery {
  constructor(tables, table) {
    this.tables = tables;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
    this.selectOptions = {};
  }

  select(_columns, options = {}) {
    this.operation = "select";
    this.selectOptions = options || {};
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  matches(row) {
    return this.filters.every(({ column, value }) => {
      if (column === "klassifikation->>budget_kategorie") {
        return row.klassifikation?.budget_kategorie === value;
      }
      return row[column] === value;
    });
  }

  exec() {
    const rows = this.tables[this.table] || [];
    const matches = rows.filter((row) => this.matches(row));

    if (this.operation === "select") {
      if (this.selectOptions.head) {
        return Promise.resolve({ data: null, count: matches.length, error: null });
      }
      return Promise.resolve({ data: matches.map((row) => ({ ...row })), count: matches.length, error: null });
    }

    if (this.operation === "update") {
      this.tables[this.table] = rows.map((row) => (this.matches(row) ? { ...row, ...this.payload } : row));
      return Promise.resolve({ data: null, error: null });
    }

    if (this.operation === "delete") {
      this.tables[this.table] = rows.filter((row) => !this.matches(row));
      return Promise.resolve({ data: null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

const createSupabase = (tables) => ({
  from: (table) => new FakeQuery(tables, table),
});

describe("budgetCategoryDelete", () => {
  test("loads delete impact counts for all budget references", async () => {
    const tables = {
      budget_posten: [{ id: "bp1", household_id: "h1", kategorie: "Snacks" }],
      home_budget_limits: [{ id: "l1", household_id: "h1", kategorie: "Snacks" }],
      home_budget_split_defaults: [{ id: "s1", household_id: "h1", kategorie: "Snacks" }],
      rechnungs_positionen: [
        { id: "rp1", household_id: "h1", klassifikation: { budget_kategorie: "Snacks" } },
        { id: "rp2", household_id: "h1", klassifikation: { budget_kategorie: "Other" } },
      ],
    };

    const impact = await loadCategoryDeleteImpact({
      supabase: createSupabase(tables),
      householdId: "h1",
      categoryName: "Snacks",
    });

    expect(impact).toEqual({
      budgetEntries: 1,
      budgetLimits: 1,
      splitDefaults: 1,
      invoicePositions: 1,
      total: 4,
    });
  });

  test("deletes a custom category without references directly", async () => {
    const tables = {
      home_budget_categories: [{ id: "11111111-1111-4111-8111-111111111111", name: "Snacks", is_system: false }],
    };

    await deleteBudgetCategoryDirect({
      supabase: createSupabase(tables),
      category: tables.home_budget_categories[0],
    });

    expect(tables.home_budget_categories).toEqual([]);
  });

  test("does not delete system categories", async () => {
    const tables = {
      home_budget_categories: [{ id: "22222222-2222-4222-8222-222222222222", name: "Lebensmittel", is_system: true }],
    };

    await expect(
      deleteBudgetCategoryDirect({
        supabase: createSupabase(tables),
        category: tables.home_budget_categories[0],
      }),
    ).rejects.toThrow("Systemkategorien");

    expect(tables.home_budget_categories).toHaveLength(1);
  });

  test("reassigns references and preserves invoice classification fields before deleting", async () => {
    const tables = {
      home_budget_categories: [{ id: "33333333-3333-4333-8333-333333333333", name: "Snacks", is_system: false }],
      budget_posten: [{ id: "bp1", household_id: "h1", kategorie: "Snacks" }],
      home_budget_limits: [],
      home_budget_split_defaults: [],
      rechnungs_positionen: [
        {
          id: "rp1",
          household_id: "h1",
          klassifikation: { budget_kategorie: "Snacks", quelle: "scan" },
        },
      ],
    };

    await reassignAndDeleteBudgetCategory({
      supabase: createSupabase(tables),
      householdId: "h1",
      category: { id: "33333333-3333-4333-8333-333333333333", name: "Snacks", is_system: false },
      targetCategoryName: "Lebensmittel",
    });

    expect(tables.budget_posten[0].kategorie).toBe("Lebensmittel");
    expect(tables.rechnungs_positionen[0].klassifikation).toEqual({
      budget_kategorie: "Lebensmittel",
      quelle: "scan",
    });
    expect(tables.home_budget_categories).toEqual([]);
  });

  test("keeps target limit and split default rows when target conflicts exist", async () => {
    const tables = {
      home_budget_categories: [{ id: "44444444-4444-4444-8444-444444444444", name: "Snacks", is_system: false }],
      budget_posten: [],
      home_budget_limits: [
        { id: "l-source", household_id: "h1", kategorie: "Snacks", limit_betrag: 10 },
        { id: "l-target", household_id: "h1", kategorie: "Lebensmittel", limit_betrag: 100 },
      ],
      home_budget_split_defaults: [
        { id: "s-source", household_id: "h1", kategorie: "Snacks" },
        { id: "s-target", household_id: "h1", kategorie: "Lebensmittel" },
      ],
      rechnungs_positionen: [],
    };

    await reassignAndDeleteBudgetCategory({
      supabase: createSupabase(tables),
      householdId: "h1",
      category: { id: "44444444-4444-4444-8444-444444444444", name: "Snacks", is_system: false },
      targetCategoryName: "Lebensmittel",
    });

    expect(tables.home_budget_limits).toEqual([
      { id: "l-target", household_id: "h1", kategorie: "Lebensmittel", limit_betrag: 100 },
    ]);
    expect(tables.home_budget_split_defaults).toEqual([
      { id: "s-target", household_id: "h1", kategorie: "Lebensmittel" },
    ]);
  });
});
