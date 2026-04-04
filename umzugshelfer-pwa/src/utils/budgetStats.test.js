import {
  buildCashflowPreview,
  buildMonthStatsData,
  buildYearStatsData,
} from "./budgetStats";

describe("budgetStats", () => {
  const kategorien = ["Lebensmittel", "Haushalt", "Abonnements"];
  const farben = {
    Lebensmittel: "#10B981",
    Haushalt: "#3B82F6",
    Abonnements: "#8B5CF6",
  };
  const monate = ["Jan", "Feb", "Maer", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  const posten = [
    { id: "1", datum: "2026-01-15", kategorie: "Lebensmittel", betrag: -100, budget_scope: "haushalt", typ: "ausgabe" },
    { id: "2", datum: "2026-01-20", kategorie: "Haushalt", betrag: -50, budget_scope: "haushalt", typ: "ausgabe" },
    { id: "3", datum: "2026-02-10", kategorie: "Abonnements", betrag: -20, budget_scope: "privat", typ: "ausgabe" },
    { id: "4", datum: "2025-12-10", kategorie: "Lebensmittel", betrag: -999, budget_scope: "haushalt", typ: "ausgabe" },
    { id: "5", datum: "2026-01-01", kategorie: "Lebensmittel", betrag: 500, budget_scope: "haushalt", typ: "einnahme" },
    { id: "6", wiederholen: true, naechstes_datum: "2026-04-10", beschreibung: "Miete", betrag: -800, budget_scope: "haushalt" },
    { id: "7", wiederholen: true, naechstes_datum: "2026-05-02", beschreibung: "Versicherung", betrag: -120, budget_scope: "privat" },
  ];

  test("berechnet Jahresdaten nur aus Jahr, Scope und Ausgaben", () => {
    const result = buildYearStatsData({
      posten,
      selJahr: 2026,
      scopeFilter: "haushalt",
      kategorien,
      kategoriefarben: farben,
      monate,
    });

    expect(result.total).toBe(150);
    expect(result.aktiveKategorien).toBe(2);
    expect(result.durchschnittProMonat).toBeCloseTo(12.5);
    expect(result.barData.datasets[0].data[0]).toBe(150);
    expect(result.barData.datasets[0].data[1]).toBe(0);
    expect(result.lineData.datasets[0].data[0]).toBe(150);
  });

  test("berechnet Monatsdaten inkl. groesster Kategorie", () => {
    const result = buildMonthStatsData({
      posten,
      selJahr: 2026,
      selMonat: 0,
      scopeFilter: "alle",
      kategorien,
      kategoriefarben: farben,
    });

    expect(result.total).toBe(150);
    expect(result.aktiveKategorien).toBe(2);
    expect(result.groessteKategorie).toEqual({ name: "Lebensmittel", summe: 100 });
    expect(result.barData.labels).toEqual(["Lebensmittel", "Haushalt"]);
  });

  test("cashflow preview bleibt bei wiederkehrenden Eintraegen mit upper bound", () => {
    const result = buildCashflowPreview({
      posten,
      scopeFilter: "alle",
      fromDateIso: "2026-04-05",
      days: 30,
    });

    expect(result.count).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(["6", "7"]);
    expect(result.total).toBe(920);
  });
});
