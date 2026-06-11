import { formatKfzDisplayText } from "./kfzPresentation";

describe("formatKfzDisplayText", () => {
  test("zeigt bekannte historische Ersatzschreibweisen mit Umlauten an", () => {
    expect(formatKfzDisplayText("Oelwechsel, Oelfilter und Bremsfluessigkeit Pruefung"))
      .toBe("Ölwechsel, Ölfilter und Bremsflüssigkeit Prüfung");
    expect(formatKfzDisplayText("Zubehoer")).toBe("Zubehör");
  });

  test("lässt unbekannte Werte unverändert", () => {
    expect(formatKfzDisplayText("SOCAR Wien")).toBe("SOCAR Wien");
  });
});
