import { notifyHouseholdEvent, sendPushToUserIds } from "./pushNotifications";
import { getActiveHouseholdId, supabase } from "../supabaseClient";
import { fetchEdgeFunctionJsonWithAuthRetry } from "./edgeFunctionAuth";
import { logVerlauf } from "./homeVerlauf";

jest.mock("../supabaseClient", () => ({
  getActiveHouseholdId: jest.fn(),
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock("./homeVerlauf", () => ({
  logVerlauf: jest.fn(),
  logVerlaufBatch: jest.fn(),
}));

jest.mock("./edgeFunctionAuth", () => ({
  fetchEdgeFunctionJsonWithAuthRetry: jest.fn(),
}));

describe("pushNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getActiveHouseholdId.mockReturnValue("household-1");
    supabase.from.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({
          data: [
            { user_id: "actor" },
            { user_id: "recipient" },
          ],
          error: null,
        }),
      }),
    });
    fetchEdgeFunctionJsonWithAuthRetry.mockResolvedValue({
      sent: 1,
      sentUsers: 1,
      failedUsers: 0,
      removed: 0,
    });
  });

  test("sends important events to other household members only", async () => {
    const result = await notifyHouseholdEvent({
      userId: "actor",
      table: "home_fahrzeuge",
      action: "erstellt",
      recordName: "Familienauto",
      recordId: "vehicle-1",
      delivery: "blocking",
    });

    expect(logVerlauf).toHaveBeenCalled();
    expect(fetchEdgeFunctionJsonWithAuthRetry).toHaveBeenCalledWith("send-push", {
      body: expect.objectContaining({
        user_id: "recipient",
        user_ids: ["recipient"],
        title: "Neuer Fahrzeug",
        url: "/home/kfz",
        tag: "home_fahrzeuge-erstellt-vehicle-1",
      }),
      timeoutMs: 12000,
    });
    expect(result).toMatchObject({
      pushAttempted: true,
      pushSent: true,
      recipientCount: 1,
    });
  });

  test("does not send updates with the default important policy", async () => {
    const result = await notifyHouseholdEvent({
      userId: "actor",
      table: "home_fahrzeuge",
      action: "geaendert",
      recordName: "Familienauto",
      delivery: "blocking",
    });

    expect(result.pushAttempted).toBe(false);
    expect(fetchEdgeFunctionJsonWithAuthRetry).not.toHaveBeenCalled();
  });

  test("reports partial failures without throwing", async () => {
    fetchEdgeFunctionJsonWithAuthRetry.mockResolvedValueOnce({
      sent: 1,
      sentUsers: 1,
      failedUsers: 1,
    });

    const result = await sendPushToUserIds({
      userIds: ["one", "two"],
      title: "Test",
      body: "Body",
    });

    expect(result).toMatchObject({ requested: 2, sent: 1, failed: 1 });
  });

  test("background delivery resolves without waiting for history or push", async () => {
    logVerlauf.mockImplementationOnce(() => new Promise(() => {}));

    const result = await notifyHouseholdEvent({
      userId: "actor",
      table: "home_vorraete",
      action: "geloescht",
      recordName: "Testvorrat",
    });

    expect(result).toMatchObject({
      scheduled: true,
      historyLogged: false,
      pushAttempted: false,
    });
    expect(logVerlauf).toHaveBeenCalled();
    expect(fetchEdgeFunctionJsonWithAuthRetry).not.toHaveBeenCalled();
  });
});
