import {
  formatLimitMeta,
  getLimitProgress,
  getLimitStatus,
} from "./budgetLimits";

describe("budgetLimits", () => {
  const fmt = (value) => `${Number(value || 0).toFixed(2)} EUR`;

  test("kein limit liefert progress 0 und status kein_limit", () => {
    expect(getLimitProgress({ verbrauch: 50, limitEuro: 0 })).toBe(0);
    expect(getLimitStatus({ verbrauch: 50, limitEuro: 0 })).toBe("kein_limit");
  });

  test("ok, warnung und ueberschritten werden korrekt erkannt", () => {
    expect(getLimitStatus({ verbrauch: 20, limitEuro: 100 })).toBe("ok");
    expect(getLimitStatus({ verbrauch: 80, limitEuro: 100 })).toBe("warnung");
    expect(getLimitStatus({ verbrauch: 100, limitEuro: 100 })).toBe("ueberschritten");
  });

  test("format meta liefert passende Labels und Hinweise", () => {
    const warnung = formatLimitMeta({
      verbrauch: 80,
      limitEuro: 100,
      progress: getLimitProgress({ verbrauch: 80, limitEuro: 100 }),
      status: "warnung",
      fmt,
    });
    const ueberschritten = formatLimitMeta({
      verbrauch: 120,
      limitEuro: 100,
      progress: getLimitProgress({ verbrauch: 120, limitEuro: 100 }),
      status: "ueberschritten",
      fmt,
    });

    expect(warnung.statusLabel).toBe("Warnung");
    expect(warnung.hintText).toBe("20 % verbleibend");
    expect(ueberschritten.statusLabel).toBe("Ueberschritten");
    expect(ueberschritten.summaryText).toBe("120.00 EUR von 100.00 EUR");
  });
});
