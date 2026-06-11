import { formatLocalizedDateInput, parseLocalizedDate } from "./kfzDate";

describe("kfzDate", () => {
  test("konvertiert lokales Datum nach ISO", () => {
    expect(parseLocalizedDate("07.06.2026")).toEqual({ iso: "2026-06-07", error: null });
  });

  test("weist ungueltige Kalendertage ab", () => {
    expect(parseLocalizedDate("31.02.2026").error).toBeTruthy();
  });

  test("formatiert ISO fuer die sichtbare Eingabe", () => {
    expect(formatLocalizedDateInput("2026-06-07")).toBe("07.06.2026");
  });
});
