import {
  buildKfzStats,
  calculateConsumptionSegments,
  calculateMileageDistance,
  normalizeKfzTransactions,
} from "./kfzStats";

describe("kfzStats", () => {
  test("summiert Teiltankungen bis zum naechsten Volltankpunkt", () => {
    const segments = calculateConsumptionSegments([
      { id: "a", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, betrag: 64, vollgetankt: true },
      { id: "b", fahrzeug_id: "v1", datum: "2026-01-10", kilometerstand: 1250, liter: 20, betrag: 32, vollgetankt: false },
      { id: "c", fahrzeug_id: "v1", datum: "2026-01-20", kilometerstand: 1500, liter: 20, betrag: 32, vollgetankt: true },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].distance).toBe(500);
    expect(segments[0].liters).toBe(40);
    expect(segments[0].consumption).toBeCloseTo(8);
  });

  test("wertet den Fuellstand vor einer echten Volltankung nicht als Fehler", () => {
    const segments = calculateConsumptionSegments([
      { id: "start", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 35, tankstatus: "voll", tankstatus_quelle: "manuell" },
      { id: "end", fahrzeug_id: "v1", datum: "2026-01-20", kilometerstand: 1500, liter: 40, tankstatus: "voll", tankstatus_quelle: "manuell" },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ liters: 40, distance: 500, quality: "verified" });
    expect(segments[0].consumption).toBeCloseTo(8);
  });

  test("schliesst teilweise und unbekannte Tankungen nicht als Volltankpunkt ab", () => {
    const segments = calculateConsumptionSegments([
      { id: "start", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, tankstatus: "voll", tankstatus_quelle: "manuell" },
      { id: "partial", fahrzeug_id: "v1", datum: "2026-01-08", kilometerstand: 1200, liter: 12, tankstatus: "teilweise", tankstatus_quelle: "manuell" },
      { id: "unknown", fahrzeug_id: "v1", datum: "2026-01-14", kilometerstand: 1350, liter: 10, tankstatus: "unbekannt", tankstatus_quelle: "import" },
      { id: "end", fahrzeug_id: "v1", datum: "2026-01-20", kilometerstand: 1500, liter: 18, tankstatus: "voll", tankstatus_quelle: "manuell" },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      liters: 40,
      distance: 500,
      intermediateEntryIds: ["partial", "unknown"],
      includedEntryIds: ["start", "partial", "unknown", "end"],
    });
    expect(segments[0].consumption).toBeCloseTo(8);
  });

  test("summiert eine Zwischentankung auch bei identischem Kilometerstand", () => {
    const segments = calculateConsumptionSegments([
      { id: "start", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, tankstatus: "voll", tankstatus_quelle: "manuell" },
      { id: "partial", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 5, tankstatus: "teilweise", tankstatus_quelle: "manuell" },
      { id: "end", fahrzeug_id: "v1", datum: "2026-01-20", kilometerstand: 1500, liter: 35, tankstatus: "voll", tankstatus_quelle: "manuell" },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ liters: 40, distance: 500, intermediateEntryIds: ["partial"] });
  });

  test("verwendet den ersten Volltankpunkt nur als Anker", () => {
    expect(calculateConsumptionSegments([
      { id: "start", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, tankstatus: "voll", tankstatus_quelle: "manuell" },
      { id: "partial", fahrzeug_id: "v1", datum: "2026-01-10", kilometerstand: 1250, liter: 20, tankstatus: "teilweise", tankstatus_quelle: "manuell" },
    ])).toEqual([]);
  });

  test("kennzeichnet kompatible alte Volltankpunkte als legacy", () => {
    const segments = calculateConsumptionSegments([
      { id: "start", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, vollgetankt: true },
      { id: "end", fahrzeug_id: "v1", datum: "2026-01-20", kilometerstand: 1500, liter: 40, tankstatus: "voll", tankstatus_quelle: "manuell" },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].quality).toBe("legacy");
  });

  test("berechnet angrenzende Abschnitte nach einer Statuskorrektur neu", () => {
    const rows = [
      { id: "a", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, tankstatus: "voll", tankstatus_quelle: "manuell" },
      { id: "b", fahrzeug_id: "v1", datum: "2026-01-10", kilometerstand: 1250, liter: 20, tankstatus: "voll", tankstatus_quelle: "manuell" },
      { id: "c", fahrzeug_id: "v1", datum: "2026-01-20", kilometerstand: 1500, liter: 20, tankstatus: "voll", tankstatus_quelle: "manuell" },
    ];
    expect(calculateConsumptionSegments(rows)).toHaveLength(2);
    const corrected = rows.map((row) => row.id === "b" ? { ...row, tankstatus: "teilweise" } : row);
    const segments = calculateConsumptionSegments(corrected);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ liters: 40, distance: 500, intermediateEntryIds: ["b"] });
  });

  test("ignoriert rueckwaerts laufende Kilometerstaende", () => {
    const segments = calculateConsumptionSegments([
      { fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, vollgetankt: true },
      { fahrzeug_id: "v1", datum: "2026-01-02", kilometerstand: 900, liter: 20, vollgetankt: true },
    ]);
    expect(segments).toEqual([]);
  });

  test("behaelt nach einem ungueltigen Ruecksprung den letzten gueltigen Volltankanker", () => {
    const segments = calculateConsumptionSegments([
      { fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, vollgetankt: true },
      { fahrzeug_id: "v1", datum: "2026-01-02", kilometerstand: 900, liter: 20, vollgetankt: true },
      { fahrzeug_id: "v1", datum: "2026-01-10", kilometerstand: 1500, liter: 40, vollgetankt: true },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ fromKm: 1000, toKm: 1500, liters: 40 });
  });

  test("zaehlt unbestaetigte automatische Tankungen als Kosten, aber nicht im Verbrauch", () => {
    const fuelEntries = [
      { id: "a", fahrzeug_id: "v1", datum: "2026-01-01", kilometerstand: 1000, liter: 40, betrag: 60, vollgetankt: true, verbrauch_bestaetigt: true },
      { id: "b", fahrzeug_id: "v1", datum: "2026-01-10", kilometerstand: 1500, liter: 40, betrag: 64, vollgetankt: true, verbrauch_bestaetigt: false },
    ];
    expect(calculateConsumptionSegments(fuelEntries)).toEqual([]);
    expect(buildKfzStats({ fuelEntries }).totalCost).toBe(124);
  });

  test("zaehlt verknuepfte Ausgaben nur einmal", () => {
    const rows = normalizeKfzTransactions({
      fuelEntries: [{ id: "f", fahrzeug_id: "v1", datum: "2026-01-01", betrag: 50, budget_posten_id: "b1" }],
      expenses: [
        { id: "duplicate", fahrzeug_id: "v1", datum: "2026-01-01", betrag: 50, budget_posten_id: "b1", kategorie: "Sonstiges" },
        { id: "e", fahrzeug_id: "v1", datum: "2026-01-02", betrag: 25, budget_posten_id: "b2", kategorie: "Maut" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(75);
    expect(rows.find((row) => row.budgetId === "b1")?.type).toBe("fuel");
  });

  test("dedupliziert Service und Ausgabe ueber dieselbe Rechnung", () => {
    const rows = normalizeKfzTransactions({
      services: [{ id: "s", fahrzeug_id: "v1", datum: "2026-01-02", kosten: 200, rechnung_id: "r1" }],
      expenses: [{ id: "e", fahrzeug_id: "v1", datum: "2026-01-02", betrag: 200, rechnung_id: "r1", kategorie: "Sonstiges" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "service", invoiceId: "r1", amount: 200 });
  });

  test("berechnet Verbrauch mit einem Volltankanker vor Periodenbeginn", () => {
    const stats = buildKfzStats({
      fuelEntries: [
        { id: "a", fahrzeug_id: "v1", datum: "2026-01-25", kilometerstand: 1000, liter: 40, vollgetankt: true },
        { id: "b", fahrzeug_id: "v1", datum: "2026-02-05", kilometerstand: 1500, liter: 40, vollgetankt: true },
      ],
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(stats.consumptionSegments).toHaveLength(1);
    expect(stats.averageConsumption).toBeCloseTo(8);
  });

  test("berechnet TCO-Distanz aus der Kilometerhistorie statt aus Tanksegmenten", () => {
    const stats = buildKfzStats({
      expenses: [{ id: "e", fahrzeug_id: "v1", datum: "2026-02-15", betrag: 100, kategorie: "Steuer" }],
      mileageEntries: [
        { id: "m1", fahrzeug_id: "v1", datum: "2026-01-31", kilometerstand: 1000 },
        { id: "m2", fahrzeug_id: "v1", datum: "2026-02-28", kilometerstand: 1500 },
      ],
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(stats.totalDistance).toBe(500);
    expect(stats.costPerKm).toBeCloseTo(0.2);
    expect(stats.averageConsumption).toBeNull();
  });

  test("ignoriert Rueckspruenge in der Kilometerhistorie", () => {
    expect(calculateMileageDistance([
      { vehicleId: "v1", date: "2026-01-01", mileage: 1000 },
      { vehicleId: "v1", date: "2026-01-02", mileage: 900 },
      { vehicleId: "v1", date: "2026-01-03", mileage: 1300 },
    ])).toBe(300);
  });

  test("liefert Fahrzeugvergleich und TCO", () => {
    const stats = buildKfzStats({
      vehicles: [{ id: "v1", name: "Auto 1" }, { id: "v2", name: "Auto 2" }],
      expenses: [
        { id: "1", fahrzeug_id: "v1", datum: "2026-01-01", betrag: 100, kategorie: "Steuer" },
        { id: "2", fahrzeug_id: "v2", datum: "2026-01-01", betrag: 200, kategorie: "Versicherung" },
      ],
    });
    expect(stats.totalCost).toBe(300);
    expect(stats.byVehicle.map((row) => row.cost)).toEqual([100, 200]);
  });

  test("wendet den Kategorienfilter auf TCO und Exportzeilen an", () => {
    const stats = buildKfzStats({
      fuelEntries: [{ id: "f", fahrzeug_id: "v1", datum: "2026-01-01", betrag: 50 }],
      expenses: [{ id: "e", fahrzeug_id: "v1", datum: "2026-01-02", betrag: 25, kategorie: "Maut" }],
      category: "Maut",
    });
    expect(stats.totalCost).toBe(25);
    expect(stats.transactions.map((row) => row.category)).toEqual(["Maut"]);
  });

  test("berechnet Vorperiodentrend und Monatsvergleich", () => {
    const stats = buildKfzStats({
      expenses: [
        { id: "old", fahrzeug_id: "v1", datum: "2026-01-15", betrag: 100, kategorie: "Steuer" },
        { id: "current-1", fahrzeug_id: "v1", datum: "2026-02-15", betrag: 150, kategorie: "Steuer" },
        { id: "current-2", fahrzeug_id: "v1", datum: "2026-03-15", betrag: 300, kategorie: "Service" },
      ],
      from: "2026-02-01",
      to: "2026-03-31",
    });
    expect(stats.totalCost).toBe(450);
    expect(stats.comparison.previousTotalCost).toBe(100);
    expect(stats.comparison.totalCostChange).toBeCloseTo(350);
    expect(stats.comparison.monthlyChange).toBeCloseTo(100);
  });

  test("liefert Kategorieanteile und sortierte Fahrzeugrangfolge", () => {
    const stats = buildKfzStats({
      vehicles: [{ id: "v1", name: "Klein" }, { id: "v2", name: "Gross" }],
      expenses: [
        { id: "1", fahrzeug_id: "v1", datum: "2026-01-01", betrag: 100, kategorie: "Steuer" },
        { id: "2", fahrzeug_id: "v2", datum: "2026-01-01", betrag: 300, kategorie: "Versicherung" },
      ],
    });
    expect(stats.categoryShares[0]).toMatchObject({ label: "Versicherung", value: 300, share: 0.75 });
    expect(stats.vehicleRanking.map((row) => [row.vehicleId, row.rank])).toEqual([["v2", 1], ["v1", 2]]);
  });

  test("nutzt fuer den Monatsdurchschnitt alle Monate des Filterzeitraums", () => {
    const stats = buildKfzStats({
      expenses: [{ id: "1", fahrzeug_id: "v1", datum: "2026-03-10", betrag: 300, kategorie: "Steuer" }],
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(stats.monthCount).toBe(3);
    expect(stats.averageMonthlyCost).toBe(100);
  });
});
