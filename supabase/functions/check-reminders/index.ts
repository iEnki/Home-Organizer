// Supabase Edge Function: check-reminders
// Household-scope reminder checker for all users with active push subscriptions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushMessage = {
  user_id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
};

type UserProfileReminder = {
  id: string;
  einkauf_reminder_zeit: string | null;
  einkauf_reminder_letzter_versand: string | null;
};

const addMessageForRecipients = (
  target: PushMessage[],
  recipientIds: string[],
  payload: Omit<PushMessage, "user_id">,
) => {
  recipientIds.forEach((userId) => {
    target.push({ user_id: userId, ...payload });
  });
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const in15MinIso = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const before1MinIso = new Date(now.getTime() - 1 * 60 * 1000).toISOString();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  try {
    // 1) Users with active push subscriptions
    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("user_id");

    if (subscriptionError) {
      throw subscriptionError;
    }

    const subscribedUserIds = [...new Set((subscriptionRows ?? []).map((row: any) => row.user_id))] as string[];
    if (!subscribedUserIds.length) {
      return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Map subscribed users to households
    const { data: membershipRows, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id, user_id")
      .in("user_id", subscribedUserIds);

    if (membershipError) {
      throw membershipError;
    }

    const householdRecipients = new Map<string, string[]>();
    for (const row of membershipRows ?? []) {
      if (!row?.household_id || !row?.user_id) continue;
      if (!householdRecipients.has(row.household_id)) {
        householdRecipients.set(row.household_id, []);
      }
      householdRecipients.get(row.household_id)!.push(row.user_id);
    }

    const messages: PushMessage[] = [];

    for (const [householdId, rawRecipients] of householdRecipients.entries()) {
      const recipients = [...new Set(rawRecipients)];
      if (!recipients.length) continue;

      // 3) Due tasks in next 15 minutes
      const { data: dueTasks } = await supabase
        .from("todo_aufgaben")
        .select("id, beschreibung")
        .eq("household_id", householdId)
        .eq("erledigt", false)
        .not("erinnerungs_datum", "is", null)
        .gte("erinnerungs_datum", before1MinIso)
        .lte("erinnerungs_datum", in15MinIso);

      for (const task of dueTasks ?? []) {
        addMessageForRecipients(messages, recipients, {
          title: "Aufgaben-Erinnerung",
          body: task.beschreibung,
          url: "/home/aufgaben",
          tag: `aufgabe-${task.id}`,
        });
      }

      // 4) Inventory below minimum
      const { data: inventoryRows } = await supabase
        .from("vorraete")
        .select("id, name, menge, mindest_menge, einheit")
        .eq("household_id", householdId)
        .not("mindest_menge", "is", null)
        .gt("mindest_menge", 0);

      for (const row of (inventoryRows ?? []).filter((item: any) => Number(item.menge) <= Number(item.mindest_menge))) {
        addMessageForRecipients(messages, recipients, {
          title: "Vorrat unter Mindestmenge",
          body: `${row.name}: noch ${row.menge} ${row.einheit ?? ""} (Minimum: ${row.mindest_menge})`.trim(),
          url: "/home/vorraete",
          tag: `vorrat-${row.id}`,
        });
      }

      // 5) Device maintenance in next 7 days
      const { data: maintenanceRows } = await supabase
        .from("geraete")
        .select("id, name, naechste_wartung")
        .eq("household_id", householdId)
        .not("naechste_wartung", "is", null)
        .gte("naechste_wartung", today)
        .lte("naechste_wartung", in7Days);

      for (const row of maintenanceRows ?? []) {
        addMessageForRecipients(messages, recipients, {
          title: "Wartung faellig",
          body: `${row.name} - Wartung am ${row.naechste_wartung}`,
          url: "/home/geraete",
          tag: `geraet-${row.id}`,
        });
      }

      // 6) Project deadlines in next day
      const { data: deadlineRows } = await supabase
        .from("projekte")
        .select("id, name, deadline, status")
        .eq("household_id", householdId)
        .not("deadline", "is", null)
        .neq("status", "abgeschlossen")
        .gte("deadline", today)
        .lte("deadline", in1Day);

      for (const row of deadlineRows ?? []) {
        addMessageForRecipients(messages, recipients, {
          title: "Projekt-Deadline morgen",
          body: `"${row.name}" ist am ${row.deadline} faellig.`,
          url: "/home/projekte",
          tag: `projekt-${row.id}`,
        });
      }

      // 7) Personal shopping-list reminder time, household-wide open list
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const { data: reminderProfiles } = await supabase
        .from("user_profile")
        .select("id, einkauf_reminder_zeit, einkauf_reminder_letzter_versand")
        .eq("einkauf_reminder_aktiv", true)
        .not("einkauf_reminder_zeit", "is", null)
        .in("id", recipients);

      const { data: openShoppingItems } = await supabase
        .from("home_einkaufliste")
        .select("name")
        .eq("household_id", householdId)
        .eq("erledigt", false)
        .limit(5);

      for (const profile of (reminderProfiles ?? []) as UserProfileReminder[]) {
        if (!profile.einkauf_reminder_zeit) continue;
        if (profile.einkauf_reminder_letzter_versand === today) continue;

        const [hours, minutes] = profile.einkauf_reminder_zeit.split(":").map((x) => Number(x));
        const reminderMinutes = hours * 60 + minutes;
        if (Math.abs(currentMinutes - reminderMinutes) > 15) continue;
        if (!openShoppingItems?.length) continue;

        const preview = openShoppingItems.slice(0, 3).map((item: any) => item.name).join(", ");
        const rest = openShoppingItems.length > 3 ? ` +${openShoppingItems.length - 3} weitere` : "";

        messages.push({
          user_id: profile.id,
          title: "Einkaufsliste",
          body: `${openShoppingItems.length} Artikel offen: ${preview}${rest}`,
          url: "/home/einkaufliste",
          tag: `einkauf-reminder-${householdId}`,
        });

        await supabase
          .from("user_profile")
          .update({ einkauf_reminder_letzter_versand: today })
          .eq("id", profile.id);
      }
    }

    // 8) Fan-out via send-push edge function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let sent = 0;
    await Promise.all(
      messages.map(async (message) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(message),
          });
          if (res.ok) {
            sent++;
          }
        } catch (error) {
          console.error("send-push invocation failed:", error);
        }
      }),
    );

    return new Response(JSON.stringify({ checked: messages.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("check-reminders failed:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
