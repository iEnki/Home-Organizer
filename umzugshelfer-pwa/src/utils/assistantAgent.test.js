jest.mock("../supabaseClient", () => ({
  supabase: {},
  getActiveHouseholdId: () => null,
}));

import { AgentToolsUnsupportedError, runAssistantAgent } from "./assistantAgent";
import { KiProxyError } from "./kiClient";

const textResponse = (content) => ({
  choices: [{ message: { content, tool_calls: [] } }],
});

const toolCallResponse = (calls) => ({
  choices: [
    {
      message: {
        content: null,
        tool_calls: calls.map((call, index) => ({
          id: `call-${index}`,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
        })),
      },
    },
  ],
});

const buildFakeClient = (responses) => {
  const calls = [];
  let index = 0;
  return {
    calls,
    chat: {
      completions: {
        create: async (payload) => {
          calls.push(payload);
          const next = responses[Math.min(index, responses.length - 1)];
          index += 1;
          if (next instanceof Error) throw next;
          return next;
        },
      },
    },
  };
};

const echoTool = {
  name: "echo_tool",
  description: "Echo",
  parameters: { type: "object", properties: {} },
  execute: async ({ args }) => ({ echoed: args?.value || null }),
};

describe("runAssistantAgent", () => {
  test("Direktantwort ohne Tool-Aufrufe", async () => {
    const client = buildFakeClient([textResponse("Hallo, alles klar.")]);
    const result = await runAssistantAgent({
      userId: "u1",
      input: "Hallo",
      toolSpecs: [echoTool],
      client,
    });
    expect(result.finalText).toBe("Hallo, alles klar.");
    expect(result.toolTrace).toHaveLength(0);
    expect(client.calls[0].context).toBe("assistant");
    expect(client.calls[0].tools).toHaveLength(1);
  });

  test("Ein Tool-Aufruf, Ergebnis fliesst zurueck, dann Antwort", async () => {
    const client = buildFakeClient([
      toolCallResponse([{ name: "echo_tool", args: { value: 42 } }]),
      textResponse("Der Wert ist 42."),
    ]);
    const result = await runAssistantAgent({
      userId: "u1",
      input: "Was ist der Wert?",
      toolSpecs: [echoTool],
      client,
    });
    expect(result.finalText).toBe("Der Wert ist 42.");
    expect(result.toolTrace).toEqual([
      expect.objectContaining({ name: "echo_tool", args: { value: 42 } }),
    ]);
    // Zweiter Call enthaelt die tool-Nachricht mit dem Ergebnis
    const secondMessages = client.calls[1].messages;
    const toolMessage = secondMessages.find((message) => message.role === "tool");
    expect(toolMessage.tool_call_id).toBe("call-0");
    expect(toolMessage.content).toContain("42");
  });

  test("Unbekanntes Tool -> Fehler-Result ans Modell, kein Absturz", async () => {
    const client = buildFakeClient([
      toolCallResponse([{ name: "gibt_es_nicht", args: {} }]),
      textResponse("Verstanden."),
    ]);
    const result = await runAssistantAgent({ userId: "u1", input: "x", toolSpecs: [echoTool], client });
    expect(result.finalText).toBe("Verstanden.");
    const toolMessage = client.calls[1].messages.find((message) => message.role === "tool");
    expect(toolMessage.content).toContain("Unbekanntes Tool");
  });

  test("Tool-Exception wird als Fehler-Result weitergereicht", async () => {
    const failingTool = {
      ...echoTool,
      name: "kaputt",
      execute: async () => {
        throw new Error("Datenbank nicht erreichbar");
      },
    };
    const client = buildFakeClient([
      toolCallResponse([{ name: "kaputt" }]),
      textResponse("Es gab ein Problem."),
    ]);
    const result = await runAssistantAgent({ userId: "u1", input: "x", toolSpecs: [failingTool], client });
    expect(result.finalText).toBe("Es gab ein Problem.");
    const toolMessage = client.calls[1].messages.find((message) => message.role === "tool");
    expect(toolMessage.content).toContain("Datenbank nicht erreichbar");
  });

  test("Iterations-Cap liefert Budget-Hinweis", async () => {
    const client = buildFakeClient([toolCallResponse([{ name: "echo_tool", args: {} }])]);
    const result = await runAssistantAgent({
      userId: "u1",
      input: "Schleife",
      toolSpecs: [echoTool],
      maxIterations: 2,
      client,
    });
    expect(client.calls).toHaveLength(2);
    expect(result.finalText).toContain("Tool-Budget");
  });

  test("TOOLS_UNSUPPORTED wirft AgentToolsUnsupportedError", async () => {
    const client = buildFakeClient([
      new KiProxyError({ code: "TOOLS_UNSUPPORTED", message: "Modell kann keine Tools." }),
    ]);
    await expect(
      runAssistantAgent({ userId: "u1", input: "x", toolSpecs: [echoTool], client }),
    ).rejects.toBeInstanceOf(AgentToolsUnsupportedError);
  });

  test("Vorschlag beendet den Zug (__proposal)", async () => {
    const proposeToolSpec = {
      name: "budget_eintrag_vorschlagen",
      description: "Vorschlag",
      parameters: { type: "object", properties: {} },
      execute: async ({ onProposal }) => {
        const res = await onProposal({ domain: "budget", op: "create", items: [{ betrag: 5 }] });
        return { __proposal: true, zusammenfassung: res.summary };
      },
    };
    const client = buildFakeClient([
      toolCallResponse([{ name: "budget_eintrag_vorschlagen", args: {} }]),
      textResponse("sollte nie erreicht werden"),
    ]);
    const onProposal = jest.fn(async () => ({ summary: "1 Budget-Eintrag vorbereitet." }));
    const result = await runAssistantAgent({
      userId: "u1",
      input: "5 Euro Kaffee",
      toolSpecs: [proposeToolSpec],
      onProposal,
      client,
    });
    expect(result.proposalCreated).toBe(true);
    expect(result.finalText).toBe("1 Budget-Eintrag vorbereitet.");
    expect(client.calls).toHaveLength(1); // kein weiterer Modell-Call nach dem Vorschlag
  });

  test("History wird auf Text-Nachrichten normalisiert und gekappt", async () => {
    const client = buildFakeClient([textResponse("ok")]);
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Nachricht ${i}`,
    }));
    history.push({ role: "assistant", content: "" }); // leere werden gefiltert
    await runAssistantAgent({ userId: "u1", input: "neu", toolSpecs: [], history, client });
    const messages = client.calls[0].messages;
    const historyMessages = messages.slice(1, -1);
    expect(historyMessages).toHaveLength(12);
    expect(historyMessages[0].content).toBe("Nachricht 8");
  });
});
