import {
  DEFAULT_BUDGET_VIEW_STATE,
  applyBudgetViewState,
  isBudgetViewStateEqual,
  sanitizeBudgetViewState,
  serializeBudgetViewState,
} from "./budgetViewState";

describe("budgetViewState", () => {
  const today = new Date("2026-04-05T00:00:00");

  test("liefert Defaults und heutige Monatswerte fuer fehlende Angaben", () => {
    const state = sanitizeBudgetViewState({}, today);

    expect(state).toEqual({
      ...DEFAULT_BUDGET_VIEW_STATE,
      selJahr: 2026,
      selMonat: 3,
    });
  });

  test("normalisiert ungueltige Werte auf sichere Fallbacks", () => {
    const state = sanitizeBudgetViewState(
      {
        suchbegriff: "  Supermarkt  ",
        scopeFilter: "kaputt",
        zeitraum: "foo",
        selJahr: 1900,
        selMonat: 15,
        sortierung: "neu",
        gruppierung: "team",
        nurWiederkehrend: 1,
        nurMitRechnung: 0,
      },
      today,
    );

    expect(state).toMatchObject({
      suchbegriff: "Supermarkt",
      kontoFilter: "",
      scopeFilter: "alle",
      zeitraum: "monat",
      selJahr: 2026,
      selMonat: 3,
      sortierung: "datum_desc",
      gruppierung: "tag",
      nurWiederkehrend: true,
      nurMitRechnung: false,
    });
  });

  test("serializeBudgetViewState enthaelt nur persistierbare Felder", () => {
    const serialized = serializeBudgetViewState(
      {
        ...DEFAULT_BUDGET_VIEW_STATE,
        selJahr: 2027,
        selMonat: 2,
        filterSheetOffen: true,
        expandedRows: { a: true },
        aktiverTab: "limits",
      },
      today,
    );

    expect(serialized).toEqual({
      suchbegriff: "",
      kategFilter: "",
      bewohnerFilter: "",
      kontoFilter: "",
      scopeFilter: "alle",
      zeitraum: "monat",
      selJahr: 2027,
      selMonat: 2,
      sortierung: "datum_desc",
      gruppierung: "tag",
      nurWiederkehrend: false,
      nurMitRechnung: false,
    });
    expect(serialized.filterSheetOffen).toBeUndefined();
    expect(serialized.aktiverTab).toBeUndefined();
  });

  test("applyBudgetViewState schreibt alle persistierbaren Setter", () => {
    const calls = {};
    const setters = Object.fromEntries(
      [
        "setSuchbegriff",
        "setKategFilter",
        "setBewohnerFilter",
        "setKontoFilter",
        "setScopeFilter",
        "setZeitraum",
        "setSelJahr",
        "setSelMonat",
        "setSortierung",
        "setGruppierung",
        "setNurWiederkehrend",
        "setNurMitRechnung",
      ].map((key) => [key, jest.fn((value) => { calls[key] = value; })]),
    );

    applyBudgetViewState(
      {
        suchbegriff: "Strom",
        kategFilter: "Haushalt",
        bewohnerFilter: "bew-1",
        kontoFilter: "konto-1",
        scopeFilter: "privat",
        zeitraum: "jahr",
        selJahr: 2027,
        selMonat: 1,
        sortierung: "betrag_desc",
        gruppierung: "konto",
        nurWiederkehrend: true,
        nurMitRechnung: true,
      },
      setters,
      today,
    );

    expect(calls).toEqual({
      setSuchbegriff: "Strom",
      setKategFilter: "Haushalt",
      setBewohnerFilter: "bew-1",
      setKontoFilter: "konto-1",
      setScopeFilter: "privat",
      setZeitraum: "jahr",
      setSelJahr: 2027,
      setSelMonat: 1,
      setSortierung: "betrag_desc",
      setGruppierung: "konto",
      setNurWiederkehrend: true,
      setNurMitRechnung: true,
    });
  });

  test("Gleichheitsvergleich arbeitet nach Sanitizing stabil", () => {
    expect(
      isBudgetViewStateEqual(
        { suchbegriff: " Test ", selJahr: 2026, selMonat: 3 },
        { suchbegriff: "Test", selJahr: "2026", selMonat: "3" },
        today,
      ),
    ).toBe(true);

    expect(
      isBudgetViewStateEqual(
        { suchbegriff: "Test", selJahr: 2026, selMonat: 3 },
        { suchbegriff: "Anders", selJahr: 2026, selMonat: 3 },
        today,
      ),
    ).toBe(false);
  });
});
