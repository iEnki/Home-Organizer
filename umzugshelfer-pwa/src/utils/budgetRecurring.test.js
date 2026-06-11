import { ensureTemplateOccurrenceForMonth } from "./budgetRecurring";

const chain = (methods = {}) => {
  const builder = {};
  ["select", "eq", "gte", "lt", "order", "limit", "insert"].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  Object.assign(builder, methods);
  return builder;
};

const template = {
  id: "template-1",
  user_id: "user-1",
  wiederholen: true,
  intervall: "Monatlich",
  datum: "2026-01-15",
  beschreibung: "Miete",
  betrag: 650,
  kategorie: "Haushalt",
  typ: "ausgabe",
  app_modus: "home",
};

describe("budgetRecurring occurrence callbacks", () => {
  it("ruft den Created-Callback nicht fuer bestehende Occurrences auf", async () => {
    const existing = { id: "existing-1", beschreibung: "Miete" };
    const lookup = chain({
      maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
    });
    const supabase = { from: jest.fn(() => lookup) };
    const onCreatedOccurrence = jest.fn();

    const result = await ensureTemplateOccurrenceForMonth({
      supabase,
      template,
      userId: "user-1",
      year: 2026,
      month: 1,
      onCreatedOccurrence,
    });

    expect(result).toBe(existing);
    expect(onCreatedOccurrence).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("ruft den Created-Callback fuer neu eingefuegte Occurrences auf", async () => {
    const inserted = { id: "new-1", beschreibung: "Miete", datum: "2026-02-15" };
    const lookup = chain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const insert = chain({
      single: jest.fn().mockResolvedValue({ data: inserted, error: null }),
    });
    const supabase = { from: jest.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(insert) };
    const onCreatedOccurrence = jest.fn();

    const result = await ensureTemplateOccurrenceForMonth({
      supabase,
      template,
      userId: "user-1",
      year: 2026,
      month: 1,
      onCreatedOccurrence,
    });

    expect(result).toBe(inserted);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      beschreibung: "Miete",
      datum: "2026-02-15",
      ursprung_template_id: "template-1",
    }));
    expect(onCreatedOccurrence).toHaveBeenCalledWith(inserted);
  });
});
