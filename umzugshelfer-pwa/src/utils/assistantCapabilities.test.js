import {
  detectHomeAssistantCapability,
  extractInitialSlots,
  mergeWorkflowAnswer,
  resolveNextWorkflowStep,
} from "./assistantCapabilities";

jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(() => {
      const query = {};
      query.select = jest.fn(() => query);
      query.eq = jest.fn(() => query);
      query.order = jest.fn(() => Promise.resolve({ data: [] }));
      return query;
    }),
    rpc: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

test("maps invoice wording to manual invoice capability", () => {
  const capability = detectHomeAssistantCapability("Fuege eine neue Rechnung hinzu");
  expect(capability.id).toBe("rechnung");
});

test("extracts multiple shopping list items from one assistant request", () => {
  const slots = extractInitialSlots({
    capabilityId: "einkaufliste",
    text: "Gib Bananen, Erbsen und Batterien auf die Einkaufsliste",
  });

  expect(slots.items).toEqual([
    { original_text: "Bananen", name: "Bananen", normalized_name: "Bananen" },
    { original_text: "Erbsen", name: "Erbsen", normalized_name: "Erbsen" },
    { original_text: "Batterien", name: "Batterien", normalized_name: "Batterien" },
  ]);
});

test("requires and previews shopping list item batches", async () => {
  const workflow = {
    capabilityId: "einkaufliste",
    slots: {
      items: [
        { original_text: "Bananen", name: "Bananen", normalized_name: "Bananen" },
        { original_text: "Erbsen", name: "Erbsen", normalized_name: "Erbsen" },
      ],
    },
  };

  const next = await resolveNextWorkflowStep({ workflow, userId: null });

  expect(next.status).toBe("ready");
  expect(next.preparedAction.items).toHaveLength(2);
});

test("extracts initial invoice amount and date without inventing missing fields", () => {
  const slots = extractInitialSlots({
    capabilityId: "rechnung",
    text: "Rechnung von Baumarkt ueber 42,90 am 07.05.2026",
  });

  expect(slots.lieferant_name).toBe("Baumarkt");
  expect(slots.brutto).toBe(42.9);
  expect(slots.rechnungsdatum).toBe("2026-05-07");
  expect(slots.beschreibung).toBeFalsy();
});

test("extracts multiple manual invoice positions from article list", () => {
  const slots = extractInitialSlots({
    capabilityId: "rechnung",
    text: "Rechnung bei Rewe Artikel: Milch, Brot, Eier, Kaese und Kaffee ueber 25,30",
  });

  expect(slots.lieferant_name).toBe("Rewe");
  expect(slots.positionen).toEqual([
    { beschreibung: "Milch" },
    { beschreibung: "Brot" },
    { beschreibung: "Eier" },
    { beschreibung: "Kaese" },
    { beschreibung: "Kaffee" },
  ]);
});

test("does not invent invoice positions from an unnamed article count", () => {
  const slots = extractInitialSlots({
    capabilityId: "rechnung",
    text: "Rechnung bei Rewe 5 Artikel ueber 25,30",
  });

  expect(slots.positionen).toBeUndefined();
});

test("merges invoice positions from a later workflow answer", () => {
  const workflow = {
    capabilityId: "rechnung",
    pendingSlot: "positionen",
    slots: { lieferant_name: "Rewe" },
  };

  const next = mergeWorkflowAnswer({
    workflow,
    text: "Milch, Brot, Eier, Kaese und Kaffee",
  });

  expect(next.slots.positionen).toHaveLength(5);
  expect(next.slots.positionen[4]).toEqual({ beschreibung: "Kaffee" });
});

test("extracts invoice positions from the invoice purpose answer", () => {
  const workflow = {
    capabilityId: "rechnung",
    pendingSlot: "beschreibung",
    slots: { lieferant_name: "Rewe", brutto: 25 },
  };

  const next = mergeWorkflowAnswer({
    workflow,
    text: "1kg bananen, 1 packung erbsen, 1 packung marillenknoedel",
  });

  expect(next.slots.beschreibung).toBe("1kg bananen, 1 packung erbsen, 1 packung marillenknoedel");
  expect(next.slots.positionen).toEqual([
    { beschreibung: "1kg bananen" },
    { beschreibung: "1 packung erbsen" },
    { beschreibung: "1 packung marillenknoedel" },
  ]);
});

test("continues a pending workflow by filling the requested slot", () => {
  const workflow = {
    capabilityId: "rechnung",
    pendingSlot: "kategorie",
    slots: { lieferant_name: "Baumarkt" },
    choices: [{ value: "Reparaturen", label: "Reparaturen" }],
  };

  const next = mergeWorkflowAnswer({
    workflow,
    text: "Reparaturen",
    selectedValue: "Reparaturen",
  });

  expect(next.slots.kategorie).toBe("Reparaturen");
  expect(next.pendingSlot).toBeNull();
});

test("requires a device before maintenance can be previewed", async () => {
  const workflow = {
    capabilityId: "wartungen",
    slots: { datum: "2026-05-07", typ: "Wartung" },
  };

  const next = await resolveNextWorkflowStep({ workflow, userId: null });

  expect(next.status).toBe("question");
  expect(next.pendingSlot).toBe("geraet_id");
});
