import { notifyHouseholdEvent, sendPushToUserIds } from "./pushNotifications";
import { getActiveHouseholdId, supabase } from "../supabaseClient";
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
    supabase.functions.invoke.mockResolvedValue({ data: { sent: 1, removed: 0 }, error: null });
  });

  test("sends important events to other household members only", async () => {
    const result = await notifyHouseholdEvent({
      userId: "actor",
      table: "home_fahrzeuge",
      action: "erstellt",
      recordName: "Familienauto",
      recordId: "vehicle-1",
    });

    expect(logVerlauf).toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("send-push", {
      body: expect.objectContaining({
        user_id: "recipient",
        title: "Neuer Fahrzeug",
        url: "/home/kfz",
        tag: "home_fahrzeuge-erstellt-vehicle-1",
      }),
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
    });

    expect(result.pushAttempted).toBe(false);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  test("reports partial failures without throwing", async () => {
    supabase.functions.invoke
      .mockResolvedValueOnce({ data: { sent: 1 }, error: null })
      .mockResolvedValueOnce({ data: { sent: 0 }, error: null });

    const result = await sendPushToUserIds({
      userIds: ["one", "two"],
      title: "Test",
      body: "Body",
    });

    expect(result).toMatchObject({ requested: 2, sent: 1, failed: 1 });
  });
});
