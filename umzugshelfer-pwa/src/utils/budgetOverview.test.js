import {
  computeBudgetOverviewKpis,
  getBudgetEntryMeta,
  groupBudgetEntries,
  matchBudgetSearch,
  sortBudgetEntries,
} from "./budgetOverview";

describe("budgetOverview", () => {
  const entries = [
    {
      id: "entry-1",
      beschreibung: "Billa Einkauf",
      kategorie: "Lebensmittel",
      betrag: -45.2,
      datum: "2026-04-03",
      budget_scope: "haushalt",
      bewohner_id: "person-1",
      zahlungskonto_id: "konto-1",
      typ: "ausgabe",
    },
    {
      id: "entry-2",
      beschreibung: "Streaming",
      kategorie: "Abonnements",
      betrag: -12.99,
      datum: "2026-04-02",
      budget_scope: "privat",
      bewohner_id: null,
      typ: "ausgabe",
      wiederholen: true,
      naechstes_datum: "2026-02-10",
      intervall: "Monatlich",
    },
    {
      id: "entry-3",
      beschreibung: "Strom April",
      kategorie: "Haushalt",
      betrag: -89.5,
      datum: "2026-04-01",
      budget_scope: "haushalt",
      bewohner_id: "person-2",
      ursprung_template_id: "template-1",
      typ: "ausgabe",
    },
    {
      id: "entry-4",
      beschreibung: "Gehalt",
      kategorie: "Einkommen",
      betrag: 2500,
      datum: "2026-04-01",
      budget_scope: "haushalt",
      typ: "einnahme",
    },
  ];

  const ctx = {
    bewohnerById: {
      "person-1": { id: "person-1", name: "Anna" },
      "person-2": { id: "person-2", name: "Ben" },
    },
    kontoById: {
      "konto-1": { id: "konto-1", name: "Haushaltskonto" },
    },
    budgetRechnungMap: {
      "entry-1": [{ id: "rechnung-1" }],
    },
    isFutureMonth: true,
    selJahr: 2026,
    selMonat: 3,
  };

  test("liefert Meta für Template, Occurrence und projizierte Zukunftsmonate", () => {
    const templateMeta = getBudgetEntryMeta(entries[1], ctx);
    const occurrenceMeta = getBudgetEntryMeta(entries[2], ctx);

    expect(templateMeta.istTemplate).toBe(true);
    expect(templateMeta.istOccurrence).toBe(false);
    expect(templateMeta.istRecurring).toBe(true);
    expect(templateMeta.datumIstProjiziert).toBe(true);
    expect(templateMeta.anzeigeDatum).toBe("2026-04-10");

    expect(occurrenceMeta.istTemplate).toBe(false);
    expect(occurrenceMeta.istOccurrence).toBe(true);
    expect(occurrenceMeta.istRecurring).toBe(true);
  });

  test("durchsucht Beschreibung, Kategorie, Person, Konto und Scope", () => {
    expect(matchBudgetSearch(entries[0], "billa", ctx)).toBe(true);
    expect(matchBudgetSearch(entries[0], "lebensmittel", ctx)).toBe(true);
    expect(matchBudgetSearch(entries[0], "anna", ctx)).toBe(true);
    expect(matchBudgetSearch(entries[0], "haushaltskonto", ctx)).toBe(true);
    expect(matchBudgetSearch(entries[1], "privat", ctx)).toBe(true);
    expect(matchBudgetSearch(entries[0], "versicherung", ctx)).toBe(false);
  });

  test("sortiert Beträge nach Absolutwert", () => {
    const desc = sortBudgetEntries(entries.slice(0, 3), "betrag_desc", ctx);
    const asc = sortBudgetEntries(entries.slice(0, 3), "betrag_asc", ctx);

    expect(desc.map((entry) => entry.id)).toEqual(["entry-3", "entry-1", "entry-2"]);
    expect(asc.map((entry) => entry.id)).toEqual(["entry-2", "entry-1", "entry-3"]);
  });

  test("gruppiert nach projiziertem Tag, Monat und Konto", () => {
    const groupsByDay = groupBudgetEntries([entries[1]], "tag", ctx);
    const groupsByMonth = groupBudgetEntries([entries[1]], "monat", ctx);
    const groupsByAccount = groupBudgetEntries([entries[0], entries[1]], "konto", ctx);

    expect(groupsByDay).toHaveLength(1);
    expect(groupsByDay[0].key).toBe("2026-04-10");
    expect(groupsByMonth).toHaveLength(1);
    expect(groupsByMonth[0].key).toBe("2026-04");
    expect(groupsByAccount).toHaveLength(2);
    expect(groupsByAccount[0].label).toBe("Haushaltskonto");
    expect(groupsByAccount[1].label).toBe("Ohne Konto");
  });

  test("berechnet KPIs nur für sichtbare Ausgaben", () => {
    const result = computeBudgetOverviewKpis(entries);

    expect(result.haushaltSumme).toBeCloseTo(134.7);
    expect(result.privatSumme).toBeCloseTo(12.99);
    expect(result.anzahl).toBe(3);
  });
});
