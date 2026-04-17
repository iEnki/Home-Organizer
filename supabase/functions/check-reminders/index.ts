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
  einkauf_reminder_aktiv?: boolean | null;
  einkauf_reminder_zeit: string | null;
  einkauf_reminder_letzter_versand: string | null;
  cospend_reminder_letzter_versand: string | null;
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

function daysBetween(dateStr: string, today: string): number {
  const [y1, m1, d1] = dateStr.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function resolveEmpfaenger(
  buch: any,
  recipientSet: Set<string>,
  recipients: string[],
): string[] {
  if (buch.erinnerung_empfaenger_user_id && recipientSet.has(buch.erinnerung_empfaenger_user_id))
    return [buch.erinnerung_empfaenger_user_id];
  if (buch.created_by_user_id && recipientSet.has(buch.created_by_user_id))
    return [buch.created_by_user_id];
  return recipients;
}

function resolveAufgabeEmpfaenger(
  task: any,
  bewohnerUserMap: Map<string, string>,
  recipients: string[],
): string[] {
  // 1. Zugewiesener Bewohner → linked User
  if (task.bewohner_id) {
    const linked = bewohnerUserMap.get(task.bewohner_id);
    if (linked && recipients.includes(linked)) return [linked];
  }
  // 2. Keine spezifische Zuweisung → alle Haushaltsmitglieder
  return recipients;
}

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
  const in24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
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

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 3–7) Alle Haushalte parallel abfragen – pro Haushalt alle 6 Queries gleichzeitig
    const shoppingProfileUpdates: string[] = [];
    const cospendProfileUpdates: string[] = [];

    const householdMessages = await Promise.all(
      [...householdRecipients.entries()].map(async ([householdId, rawRecipients]) => {
        const recipients = [...new Set(rawRecipients)];
        if (!recipients.length) return [] as PushMessage[];

        const [
          { data: dueTasks },
          { data: inventoryRows },
          { data: maintenanceRows },
          { data: deadlineRows },
          { data: reminderProfiles },
          { data: openShoppingItems },
          { data: bewohnerRows },
          { data: openLedgerRows, error: openLedgerError },
          { data: faelligeBuecher },
          { data: faelligeTasks },
        ] = await Promise.all([
          supabase
            .from("todo_aufgaben")
            .select("id, beschreibung, erinnerungs_datum, letzte_push_erinnerung_am, bewohner_id, user_id")
            .eq("household_id", householdId)
            .eq("erledigt", false)
            .not("erinnerungs_datum", "is", null)
            .gte("erinnerungs_datum", before1MinIso)
            .lte("erinnerungs_datum", in15MinIso),
          supabase
            .from("vorraete")
            .select("id, name, menge, mindest_menge, einheit")
            .eq("household_id", householdId)
            .not("mindest_menge", "is", null)
            .gt("mindest_menge", 0),
          supabase
            .from("geraete")
            .select("id, name, naechste_wartung")
            .eq("household_id", householdId)
            .not("naechste_wartung", "is", null)
            .gte("naechste_wartung", today)
            .lte("naechste_wartung", in7Days),
          supabase
            .from("projekte")
            .select("id, name, deadline, status")
            .eq("household_id", householdId)
            .not("deadline", "is", null)
            .neq("status", "abgeschlossen")
            .gte("deadline", today)
            .lte("deadline", in1Day),
          supabase
            .from("user_profile")
            .select("id, einkauf_reminder_aktiv, einkauf_reminder_zeit, einkauf_reminder_letzter_versand, cospend_reminder_letzter_versand")
            .in("id", recipients),
          supabase
            .from("home_einkaufliste")
            .select("name")
            .eq("household_id", householdId)
            .eq("erledigt", false)
            .limit(5),
          supabase
            .from("home_bewohner")
            .select("id, linked_user_id")
            .eq("household_id", householdId)
            .not("linked_user_id", "is", null),
          supabase.rpc("get_budget_open_split_ledger", {
            p_household_id: householdId,
            p_as_of_date: today,
          }),
          supabase
            .from("home_buecher")
            .select("id, titel, verliehen_an_name, rueckgabe_erwartet_am, letzte_erinnerung_am, " +
                    "erinnerung_intervall_tage, erinnerung_empfaenger_user_id, created_by_user_id, household_id")
            .eq("household_id", householdId)
            .eq("status", "verliehen")
            .eq("erinnerung_aktiv", true),
          supabase
            .from("todo_aufgaben")
            .select("id, beschreibung, faelligkeitsdatum, erinnerungs_datum, bewohner_id, user_id, letzte_push_bald_faellig_am, letzte_push_bald_faellig_fuer, letzte_push_ueberfaellig_am")
            .eq("household_id", householdId)
            .eq("erledigt", false)
            .not("faelligkeitsdatum", "is", null)
            .lte("faelligkeitsdatum", in24hIso),
        ]);

        const msgs: PushMessage[] = [];
        const bewohnerUserMap = new Map<string, string>();
        for (const row of bewohnerRows ?? []) {
          if (row?.id && row?.linked_user_id) {
            bewohnerUserMap.set(row.id, row.linked_user_id);
          }
        }

        const aufgabeDbUpdates: Array<() => Promise<unknown>> = [];

        // Block A — Explizite Reminder (mit Dedupe + gezielter Empfänger-Auflösung)
        for (const task of dueTasks ?? []) {
          if (task.letzte_push_erinnerung_am &&
              new Date(task.letzte_push_erinnerung_am) >= new Date(task.erinnerungs_datum)) continue;

          const empfaenger = resolveAufgabeEmpfaenger(task, bewohnerUserMap, recipients);
          addMessageForRecipients(msgs, empfaenger, {
            title: "Aufgaben-Erinnerung",
            body: task.beschreibung,
            url: "/home/aufgaben",
            tag: `aufgabe-${task.id}`,
          });
          aufgabeDbUpdates.push(() =>
            supabase.from("todo_aufgaben")
              .update({ letzte_push_erinnerung_am: now.toISOString() })
              .eq("id", task.id)
          );
        }

        // Block B+C — Bald fällig / Überfällig
        for (const task of faelligeTasks ?? []) {
          const faelligDate = (task.faelligkeitsdatum as string).split("T")[0];
          const isOverdue = faelligDate < today;

          if (!isOverdue) {
            // Block B — bald fällig
            // Kein Push wenn expliziter Reminder für dieselbe Aufgabe im aktuellen Fenster aktiv
            const hasActiveReminder = task.erinnerungs_datum &&
              task.erinnerungs_datum >= before1MinIso &&
              task.erinnerungs_datum <= in15MinIso;
            if (hasActiveReminder) continue;

            // Dedupe: letzte_push_bald_faellig_fuer muss sich geändert haben
            if (task.letzte_push_bald_faellig_fuer === faelligDate) continue;

            const empfaenger = resolveAufgabeEmpfaenger(task, bewohnerUserMap, recipients);
            addMessageForRecipients(msgs, empfaenger, {
              title: "Aufgabe bald fällig",
              body: `„${task.beschreibung}" ist bald fällig.`,
              url: "/home/aufgaben",
              tag: `aufgabe-due-soon-${task.id}`,
            });
            aufgabeDbUpdates.push(() =>
              supabase.from("todo_aufgaben")
                .update({
                  letzte_push_bald_faellig_am: now.toISOString(),
                  letzte_push_bald_faellig_fuer: faelligDate,
                })
                .eq("id", task.id)
            );
          } else {
            // Block C — überfällig (max. 1x pro 24h)
            const last = task.letzte_push_ueberfaellig_am;
            if (last && now.getTime() - new Date(last).getTime() < 24 * 60 * 60 * 1000) continue;

            const empfaenger = resolveAufgabeEmpfaenger(task, bewohnerUserMap, recipients);
            addMessageForRecipients(msgs, empfaenger, {
              title: "Aufgabe überfällig",
              body: `„${task.beschreibung}" ist überfällig.`,
              url: "/home/aufgaben",
              tag: `aufgabe-overdue-${task.id}`,
            });
            aufgabeDbUpdates.push(() =>
              supabase.from("todo_aufgaben")
                .update({ letzte_push_ueberfaellig_am: now.toISOString() })
                .eq("id", task.id)
            );
          }
        }

        for (const row of (inventoryRows ?? []).filter((item: any) => Number(item.menge) <= Number(item.mindest_menge))) {
          addMessageForRecipients(msgs, recipients, {
            title: "Vorrat unter Mindestmenge",
            body: `${row.name}: noch ${row.menge} ${row.einheit ?? ""} (Minimum: ${row.mindest_menge})`.trim(),
            url: "/home/vorraete",
            tag: `vorrat-${row.id}`,
          });
        }

        for (const row of maintenanceRows ?? []) {
          addMessageForRecipients(msgs, recipients, {
            title: "Wartung faellig",
            body: `${row.name} - Wartung am ${row.naechste_wartung}`,
            url: "/home/geraete",
            tag: `geraet-${row.id}`,
          });
        }

        for (const row of deadlineRows ?? []) {
          addMessageForRecipients(msgs, recipients, {
            title: "Projekt-Deadline morgen",
            body: `"${row.name}" ist am ${row.deadline} faellig.`,
            url: "/home/projekte",
            tag: `projekt-${row.id}`,
          });
        }

        for (const profile of (reminderProfiles ?? []) as UserProfileReminder[]) {
          if (!profile.einkauf_reminder_aktiv || !profile.einkauf_reminder_zeit) continue;
          if (profile.einkauf_reminder_letzter_versand === today) continue;

          const [hours, minutes] = profile.einkauf_reminder_zeit.split(":").map((x) => Number(x));
          const reminderMinutes = hours * 60 + minutes;
          if (Math.abs(currentMinutes - reminderMinutes) > 15) continue;
          if (!openShoppingItems?.length) continue;

          const preview = openShoppingItems.slice(0, 3).map((item: any) => item.name).join(", ");
          const rest = openShoppingItems.length > 3 ? ` +${openShoppingItems.length - 3} weitere` : "";

          msgs.push({
            user_id: profile.id,
            title: "Einkaufsliste",
            body: `${openShoppingItems.length} Artikel offen: ${preview}${rest}`,
            url: "/home/einkaufliste",
            tag: `einkauf-reminder-${householdId}`,
          });

          shoppingProfileUpdates.push(profile.id);
        }

        if (!openLedgerError) {
          const oldOpenRows = (openLedgerRows ?? []).filter((row: any) => Number(row?.age_days || 0) > 14);
          const cospendByUser = new Map<string, { totalCents: number; count: number }>();

          oldOpenRows.forEach((row: any) => {
            const cents = Number(row?.open_amount_cents || 0);
            if (cents <= 0) return;

            const affectedUsers = [
              bewohnerUserMap.get(row.from_member_id),
              bewohnerUserMap.get(row.to_member_id),
            ].filter((value): value is string => Boolean(value));

            affectedUsers.forEach((userId) => {
              const current = cospendByUser.get(userId) || { totalCents: 0, count: 0 };
              current.totalCents += cents;
              current.count += 1;
              cospendByUser.set(userId, current);
            });
          });

          for (const profile of (reminderProfiles ?? []) as UserProfileReminder[]) {
            if (profile.cospend_reminder_letzter_versand === today) continue;
            const openInfo = cospendByUser.get(profile.id);
            if (!openInfo || openInfo.totalCents <= 0) continue;

            msgs.push({
              user_id: profile.id,
              title: "Offene Ausgleiche",
              body: `${openInfo.count} offene Positionen seit mehr als 14 Tagen · ${Number(openInfo.totalCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
              url: "/home/budget?tab=ausgleich",
              tag: `cospend-reminder-${householdId}`,
            });

            cospendProfileUpdates.push(profile.id);
          }
        }

        // Buch-Verleih-Reminder
        if (faelligeBuecher?.length) {
          const recipientSet = new Set(recipients);
          for (const buch of faelligeBuecher) {
            const rueckgabeUeberfaellig = buch.rueckgabe_erwartet_am && buch.rueckgabe_erwartet_am <= today;
            const intervallFaellig = !buch.letzte_erinnerung_am ||
              daysBetween(buch.letzte_erinnerung_am, today) >= (buch.erinnerung_intervall_tage ?? 7);
            if (!rueckgabeUeberfaellig && !intervallFaellig) continue;

            const empfaenger = resolveEmpfaenger(buch, recipientSet, recipients);
            for (const uid of empfaenger) {
              msgs.push({
                user_id: uid,
                title: "Buch-Erinnerung",
                body: `„${buch.titel}" ist${rueckgabeUeberfaellig ? " überfällig" : " bald fällig"} — ausgeliehen an ${buch.verliehen_an_name ?? "unbekannt"}.`,
                url: "/home/inventar?tab=buecher",
                tag: `buch-reminder-${buch.id}`,
              });
            }
            await supabase.from("home_buecher")
              .update({ letzte_erinnerung_am: today })
              .eq("id", buch.id);
          }
        }

        if (aufgabeDbUpdates.length > 0) {
          await Promise.all(aufgabeDbUpdates.map((fn) => fn()));
        }

        return msgs;
      })
    );

    const messages = householdMessages.flat();

    // Einkaufs-Reminder-Zeitstempel für alle betroffenen Profile parallel aktualisieren
    if (shoppingProfileUpdates.length > 0) {
      await Promise.all(
        [...new Set(shoppingProfileUpdates)].map((profileId) =>
          supabase
            .from("user_profile")
            .update({ einkauf_reminder_letzter_versand: today })
            .eq("id", profileId)
        )
      );
    }

    if (cospendProfileUpdates.length > 0) {
      await Promise.all(
        [...new Set(cospendProfileUpdates)].map((profileId) =>
          supabase
            .from("user_profile")
            .update({ cospend_reminder_letzter_versand: today })
            .eq("id", profileId)
        )
      );
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
