jest.mock("../supabaseClient", () => ({ supabase: {}, getActiveHouseholdId: () => null }));

import { buildCalendarEvents, expandRecurringBudgetDates } from "./calendarEvents";

describe("calendarEvents", () => {
  test("expandRecurringBudgetDates expandiert monatlich auf 3 Termine", () => {
    const dates = expandRecurringBudgetDates("2026-01-15", "Monatlich", 3);
    expect(dates).toHaveLength(3);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(dates[1].toISOString().slice(0, 10)).toBe("2026-02-15");
    expect(dates[2].toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  test("expandRecurringBudgetDates bricht bei unbekanntem Intervall nach 1 Termin ab", () => {
    const dates = expandRecurringBudgetDates("2026-01-15", "Alle 3 Tage", 3);
    expect(dates).toHaveLength(1);
  });

  test("expandRecurringBudgetDates ohne Datum -> leer", () => {
    expect(expandRecurringBudgetDates(null, "Monatlich")).toEqual([]);
  });

  test("buildCalendarEvents baut Aufgaben-, Wartungs- und Budget-Events", () => {
    const events = buildCalendarEvents({
      appMode: "home",
      aufgaben: [
        { id: "a1", beschreibung: "Keller aufraeumen", faelligkeitsdatum: "2026-07-10", prioritaet: "Hoch" },
        { id: "a2", beschreibung: "ohne Datum", faelligkeitsdatum: null },
      ],
      geraete: [{ id: "g1", name: "Waschmaschine", naechste_wartung: "2026-08-01", hersteller: "Bosch" }],
      budget: [{ id: "b1", beschreibung: "Miete", betrag: 900, intervall: "Monatlich", naechstes_datum: "2026-07-01", kategorie: "Wohnen" }],
    });

    const typen = events.map((event) => event.typ);
    expect(typen.filter((typ) => typ === "aufgabe")).toHaveLength(1);
    expect(typen.filter((typ) => typ === "wartung")).toHaveLength(1);
    expect(typen.filter((typ) => typ === "budget")).toHaveLength(3);

    const aufgabe = events.find((event) => event.typ === "aufgabe");
    expect(aufgabe.title).toBe("Keller aufraeumen");
    expect(aufgabe.link).toBe("/home/aufgaben");

    const wartung = events.find((event) => event.typ === "wartung");
    expect(wartung.title).toContain("Waschmaschine");
    expect(wartung.sub).toContain("Bosch");
  });

  test("buildCalendarEvents: Umzugsmodus -> Aufgaben-Link /todos + Meilensteine", () => {
    const events = buildCalendarEvents({
      appMode: "umzug",
      aufgaben: [{ id: "a1", beschreibung: "Kartons kaufen", faelligkeitsdatum: "2026-07-05" }],
      meilensteine: [{ id: "m1", titel: "Uebergabe", datum: "2026-07-31", beschreibung: null }],
    });
    expect(events.find((event) => event.typ === "aufgabe").link).toBe("/todos");
    const meilenstein = events.find((event) => event.typ === "meilenstein");
    expect(meilenstein.title).toBe("Uebergabe");
    expect(meilenstein.link).toBe("/zeitstrahl");
  });

  test("buildCalendarEvents: Labels sind ueberschreibbar (i18n)", () => {
    const events = buildCalendarEvents({
      appMode: "home",
      geraete: [{ id: "g1", name: "Boiler", naechste_wartung: "2026-08-01" }],
      labels: { maintenanceTitle: (name) => `Service due: ${name}`, deviceMaintenance: () => "Device service" },
    });
    expect(events[0].title).toBe("Service due: Boiler");
    expect(events[0].sub).toBe("Device service");
  });
});
