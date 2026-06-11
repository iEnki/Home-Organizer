process.env.REACT_APP_SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "http://localhost:54321";
process.env.REACT_APP_SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "test-anon-key";

const { generiereZusammenfassung } = require("./rechnungAnalyse");
const { resolveLocalizedKnowledge } = require("./localizedKnowledge");

describe("localized knowledge and invoice summaries", () => {
  const positions = [
    { name: "Philips Hue Bridge", gesamtpreis: 39.99 },
    { name: "Philips Hue Smart Plug", gesamtpreis: 20.79 },
  ];

  it("renders invoice summaries in German", () => {
    expect(generiereZusammenfassung("Hornbach Baumarkt GmbH", "2026-04-11", 60.78, positions, "de"))
      .toContain("Du hast am 11.04.2026 bei Hornbach Baumarkt GmbH gekauft");
    expect(generiereZusammenfassung("Hornbach Baumarkt GmbH", "2026-04-11", 60.78, positions, "de"))
      .toContain("Gesamtbetrag");
  });

  it("renders invoice summaries in en-GB", () => {
    const summary = generiereZusammenfassung("Hornbach Baumarkt GmbH", "2026-04-11", 60.78, positions, "en-GB");
    expect(summary).toContain("On 11/04/2026, you bought from Hornbach Baumarkt GmbH");
    expect(summary).toContain("Total amount");
  });

  it("prefers cached localized content for automatic entries", () => {
    const entry = {
      titel: "Deutsch",
      inhalt: "Deutsch Inhalt",
      herkunft: "auto_full",
      localized_content: {
        "en-GB": { title: "English", content: "English content", headline: "English headline" },
      },
      summary: {},
    };
    expect(resolveLocalizedKnowledge(entry, "en-GB")).toEqual({
      title: "English",
      content: "English content",
      headline: "English headline",
    });
  });

  it("does not replace manual entry text", () => {
    const entry = {
      titel: "Manuell",
      inhalt: "Eigener Text",
      herkunft: "manuell",
      localized_content: {
        "en-GB": { title: "English", content: "English content", headline: "English headline" },
      },
      summary: { manual_override: true },
    };
    expect(resolveLocalizedKnowledge(entry, "en-GB")).toEqual({
      title: "Manuell",
      content: "Eigener Text",
      headline: "",
    });
  });
});
