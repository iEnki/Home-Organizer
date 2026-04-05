import {
  getGoalMonatlichNoetig,
  getGoalProgress,
  getGoalRestbetrag,
  getGoalStatus,
  groupGoalsByStatus,
} from "./budgetGoals";

describe("budgetGoals", () => {
  const today = new Date("2026-04-05T00:00:00");
  const ziele = [
    { id: "1", name: "Notgroschen", ziel_betrag: 1000, aktueller_betrag: 100, zieldatum: "2026-10-01" },
    { id: "2", name: "Reise", ziel_betrag: 1000, aktueller_betrag: 920, zieldatum: "2026-08-01" },
    { id: "3", name: "Laptop", ziel_betrag: 1500, aktueller_betrag: 1500, zieldatum: "2026-12-01" },
  ];

  test("berechnet progress, status und restbetrag korrekt", () => {
    expect(getGoalProgress(ziele[0])).toBe(10);
    expect(getGoalStatus(ziele[0])).toBe("aktiv");
    expect(getGoalStatus(ziele[1])).toBe("fast_erreicht");
    expect(getGoalStatus(ziele[2])).toBe("erreicht");
    expect(getGoalRestbetrag(ziele[1])).toBe(80);
  });

  test("monatlich noetig nutzt nur die verbleibenden vollen Kalendermonate", () => {
    const target = { ziel_betrag: 250, aktueller_betrag: 50, zieldatum: "2026-06-30" };
    expect(getGoalMonatlichNoetig(target, today)).toBe(100);
  });

  test("monatlich noetig nutzt im Zielmonat den offenen Restbetrag", () => {
    const sameMonthTarget = { ziel_betrag: 500, aktueller_betrag: 300, zieldatum: "2026-04-30" };
    expect(getGoalMonatlichNoetig(sameMonthTarget, today)).toBe(200);
  });

  test("monatlich noetig nutzt bei abgelaufenem Ziel ebenfalls den offenen Restbetrag", () => {
    const overdueTarget = { ziel_betrag: 500, aktueller_betrag: 300, zieldatum: "2026-04-01" };
    expect(getGoalMonatlichNoetig(overdueTarget, today)).toBe(200);
  });

  test("gruppiert stabil nach status in fixer reihenfolge", () => {
    const groups = groupGoalsByStatus(ziele);
    expect(groups.map((group) => group.key)).toEqual(["aktiv", "fast_erreicht", "erreicht"]);
    expect(groups[0].items.map((ziel) => ziel.id)).toEqual(["1"]);
    expect(groups[1].items.map((ziel) => ziel.id)).toEqual(["2"]);
    expect(groups[2].items.map((ziel) => ziel.id)).toEqual(["3"]);
  });
});
