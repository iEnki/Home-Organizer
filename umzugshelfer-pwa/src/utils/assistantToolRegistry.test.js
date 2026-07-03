const mockFromSpy = jest.fn();
const mockRpcSpy = jest.fn(async () => ({ data: [], error: null }));

const mockBuildChain = (result = { data: [], error: null }) => {
  const chain = {};
  [
    "select", "eq", "neq", "in", "or", "ilike", "gte", "lte", "is", "not", "order", "limit",
    "insert", "update", "delete", "upsert",
  ].forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  chain.single = jest.fn(async () => ({ data: null, error: null }));
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
};

jest.mock("../supabaseClient", () => ({
  getActiveHouseholdId: () => null,
  setActiveHouseholdId: () => {},
  supabase: {
    from: (...args) => {
      mockFromSpy(...args);
      return mockBuildChain({ data: [{ id: "row-1", name: "Bohrmaschine", kategorie: "Werkzeug" }], error: null });
    },
    rpc: (...args) => mockRpcSpy(...args),
  },
}));

import {
  buildAssistantReadTools,
  buildAssistantTools,
  buildAssistantWriteTools,
  pickRowFields,
  toOpenAiTools,
  truncateToolResult,
} from "./assistantToolRegistry";

describe("assistantToolRegistry", () => {
  beforeEach(() => {
    mockFromSpy.mockClear();
    mockRpcSpy.mockClear();
  });

  test("alle ToolSpecs haben Name, Beschreibung und Objekt-Schema", () => {
    const tools = buildAssistantTools({ appMode: "home" });
    expect(tools.length).toBeGreaterThanOrEqual(20);
    const names = new Set();
    tools.forEach((tool) => {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(2);
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters?.type).toBe("object");
      expect(typeof tool.execute).toBe("function");
    });
  });

  test("umzug-Modus liefert reduziertes Toolset", () => {
    const home = buildAssistantReadTools({ appMode: "home" });
    const umzug = buildAssistantReadTools({ appMode: "umzug" });
    expect(umzug.length).toBeLessThan(home.length);
    expect(umzug.some((tool) => tool.name === "suche_inventar")).toBe(false);
    expect(umzug.some((tool) => tool.name === "suche_aufgaben")).toBe(true);
  });

  test("toOpenAiTools erzeugt OpenAI-Format", () => {
    const [first] = toOpenAiTools(buildAssistantReadTools({ appMode: "home" }));
    expect(first).toEqual({
      type: "function",
      function: {
        name: expect.any(String),
        description: expect.any(String),
        parameters: expect.objectContaining({ type: "object" }),
      },
    });
  });

  test("truncateToolResult kuerzt lange Ergebnisse", () => {
    const long = { text: "x".repeat(9000) };
    const truncated = truncateToolResult(long, 500);
    expect(truncated.length).toBeLessThanOrEqual(520);
    expect(truncated.endsWith("… [gekuerzt]")).toBe(true);
    expect(truncateToolResult({ a: 1 })).toBe('{"a":1}');
  });

  test("pickRowFields behaelt nur vorhandene bevorzugte Felder", () => {
    expect(pickRowFields({ a: 1, b: null, c: "", d: "x" }, ["a", "b", "c", "d", "e"])).toEqual({ a: 1, d: "x" });
  });

  test("Lese-Tool fuehrt Query aus und liefert exakte Gesamtanzahl + Eintraege", async () => {
    const tools = buildAssistantReadTools({ appMode: "home" });
    const inventar = tools.find((tool) => tool.name === "suche_inventar");
    const result = await inventar.execute({ userId: "user-1", args: { query: "Bohr" } });
    expect(mockFromSpy).toHaveBeenCalledWith("home_objekte");
    expect(result.anzahl_gesamt).toBe(1);
    expect(result.angezeigt).toBe(1);
    expect(result.eintraege[0].name).toBe("Bohrmaschine");
  });

  test("suche_rezepte ohne query liefert Gesamtanzahl + Liste (Zaehlfragen)", async () => {
    const tool = buildAssistantReadTools({ appMode: "home" }).find((t) => t.name === "suche_rezepte");
    expect(tool.parameters.required).toBeUndefined(); // query darf fehlen
    const result = await tool.execute({ userId: "user-1", args: {} });
    expect(result.fehler).toBeUndefined();
    expect(result.anzahl_gesamt).toBe(1);
    expect(Array.isArray(result.rezepte)).toBe(true);
  });

  test("suche_rezepte mit erfolglosem Suchbegriff meldet trotzdem Gesamtanzahl + Hinweis", async () => {
    const tool = buildAssistantReadTools({ appMode: "home" }).find((t) => t.name === "suche_rezepte");
    const result = await tool.execute({ userId: "user-1", args: { query: "Kochrezepte" } });
    expect(result.anzahl_gesamt).toBe(1);
    expect(result.treffer_anzahl).toBe(0);
    expect(result.hinweis).toContain("insgesamt");
  });

  test("Vorschlags-Tools schreiben NIE in die Datenbank", async () => {
    const writeTools = buildAssistantWriteTools({ appMode: "home" });
    expect(writeTools.length).toBeGreaterThanOrEqual(5);
    const onProposal = jest.fn(async () => ({ summary: "Vorschau erstellt" }));

    for (const tool of writeTools) {
      const args =
        tool.name === "modul_oeffnen"
          ? { route_key: "home_budget" }
          : tool.name === "aktion_vorschlagen"
            ? { domain: "inventar", items: [{ name: "Test" }] }
            : tool.name === "kfz_tank_vorschlagen"
              ? { betrag: 50 }
              : tool.name === "rezept_aenderung_vorschlagen" || tool.name === "kfz_service_vorschlagen"
                ? { titel: "Lasagne", mode: "favorit", favorit: true, typ: "Service" }
                : { items: [{ name: "Test", beschreibung: "Test", betrag: 1, erinnerungs_datum: "2026-07-04" }] };
      const result = await tool.execute({ onProposal, args, userId: "user-1" });
      expect(result.__proposal).toBe(true);
      expect(result.zusammenfassung).toBeTruthy();
    }

    expect(onProposal).toHaveBeenCalledTimes(writeTools.length);
    expect(mockFromSpy).not.toHaveBeenCalled();
    expect(mockRpcSpy).not.toHaveBeenCalled();
  });

  test("aufgabe_vorschlagen: bereich umzug -> Domain todos", async () => {
    const tool = buildAssistantWriteTools({ appMode: "home" }).find((t) => t.name === "aufgabe_vorschlagen");
    const onProposal = jest.fn(async () => ({ summary: "ok" }));
    await tool.execute({ onProposal, args: { items: [{ beschreibung: "Kartons" }], bereich: "umzug" } });
    expect(onProposal).toHaveBeenCalledWith(expect.objectContaining({ domain: "todos" }));
  });

  test("aktion_vorschlagen validiert Domain und setzt op auf Items", async () => {
    const tool = buildAssistantWriteTools({ appMode: "home" }).find((t) => t.name === "aktion_vorschlagen");
    const onProposal = jest.fn(async () => ({ summary: "ok" }));

    const invalid = await tool.execute({ onProposal, args: { domain: "hacking", items: [{}] } });
    expect(invalid.fehler).toContain("Unbekannter Bereich");

    await tool.execute({ onProposal, args: { domain: "budget", op: "delete", items: [{ id: "b-1" }] } });
    expect(onProposal).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "budget", op: "delete", items: [{ id: "b-1", op: "delete" }] }),
    );
  });

  test("Vorschlags-Tool ohne onProposal liefert Fehler statt Write", async () => {
    const tool = buildAssistantWriteTools({ appMode: "home" }).find((t) => t.name === "budget_eintrag_vorschlagen");
    const result = await tool.execute({ args: { items: [{ beschreibung: "Test", betrag: 5 }] } });
    expect(result.fehler).toBeTruthy();
    expect(mockFromSpy).not.toHaveBeenCalled();
  });
});
