jest.mock("../supabaseClient", () => ({ supabase: {} }));

import {
  buildFuelEntryPayload,
  getLinkedFuelInvoiceIds,
  isFuelBudgetCandidate,
  isFuelText,
  normalizeFuelCandidate,
  reconcileFuelImportState,
} from "./kfzFuelImports";

describe("kfzFuelImports", () => {
  test("recognises fuel categories, merchants and invoice positions", () => {
    expect(isFuelText("Eurosuper 95")).toBe(true);
    expect(isFuelBudgetCandidate({ budget: { kategorie: "Tanken" } })).toMatchObject({
      matches: true,
      reason: "budget_category",
    });
    expect(isFuelBudgetCandidate({
      budget: { kategorie: "Sonstiges" },
      invoice: { lieferant_name: "SOCAR Tankstelle" },
    })).toMatchObject({ matches: true, reason: "fuel_merchant" });
  });

  test("extracts litres, unit price, amount and fuel type", () => {
    const result = normalizeFuelCandidate({
      budget: {
        id: "budget-1",
        datum: "2026-06-08",
        betrag: 54.6,
        beschreibung: "SOCAR",
        kategorie: "Tanken",
      },
      invoice: {
        id: "invoice-1",
        dokument_id: "document-1",
        lieferant_name: "SOCAR",
      },
      positions: [{
        beschreibung: "Super E10",
        menge: 42,
        einheit: "Liter",
        einzelpreis: 1.3,
        gesamtpreis: 54.6,
      }],
    });

    expect(result).toMatchObject({
      budget_posten_id: "budget-1",
      rechnung_id: "invoice-1",
      dokument_id: "document-1",
      snapshot: {
        liter: 42,
        preis_pro_liter: 1.3,
        kraftstoffart: "Super E10",
        betrag: 54.6,
      },
    });
  });

  test("rejects unrelated budget entries", () => {
    expect(normalizeFuelCandidate({
      budget: { id: "budget-2", kategorie: "Lebensmittel", beschreibung: "Supermarkt" },
      positions: [{ beschreibung: "Brot" }],
    })).toBeNull();
  });

  test("treats an imported row without an existing refuelling as pending repair", () => {
    expect(reconcileFuelImportState({
      current: { status: "imported", tankvorgang_id: "missing" },
      existingFuel: null,
    })).toEqual({ status: "pending", orphaned: true });
  });

  test("keeps ignored receipts hidden but trusts an existing refuelling", () => {
    expect(reconcileFuelImportState({
      current: { status: "ignored" },
      existingFuel: null,
    })).toEqual({ status: "ignored", orphaned: false });
    expect(reconcileFuelImportState({
      current: { status: "ignored" },
      existingFuel: { id: "fuel-1" },
    })).toEqual({ status: "imported", orphaned: false });
  });

  test("includes the household when creating an automatic refuelling", () => {
    expect(buildFuelEntryPayload({
      household_id: "household-1",
      budget_posten_id: "budget-1",
      quell_snapshot: { datum: "2026-06-02", betrag: 54.4, tankstelle: "SOCAR" },
    }, "vehicle-1", "user-1")).toMatchObject({
      household_id: "household-1",
      fahrzeug_id: "vehicle-1",
      created_by_user_id: "user-1",
      budget_posten_id: "budget-1",
      betrag: 54.4,
      tankstelle: "SOCAR",
      verbrauch_bestaetigt: false,
    });
  });

  test("loads invoice positions only for invoices linked to current budget entries", () => {
    expect(getLinkedFuelInvoiceIds({
      budgets: [{ id: "budget-1" }, { id: "budget-2" }],
      links: [
        { entity_id: "budget-1", dokument_id: "document-1" },
        { entity_id: "unrelated-budget", dokument_id: "document-2" },
      ],
      invoices: [
        { id: "invoice-1", dokument_id: "document-1" },
        { id: "invoice-2", dokument_id: "document-2" },
        { id: "invoice-3", dokument_id: "document-3" },
      ],
    })).toEqual(["invoice-1"]);
  });
});
