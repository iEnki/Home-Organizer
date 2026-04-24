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

const DATE_THRESHOLDS = [30, 14, 7, 1, 0];
const BUDGET_LIMIT_THRESHOLDS = [80, 100];

const unique = (values: string[] = []) => [...new Set(values.filter(Boolean))];
const isoDate = (date: Date) => date.toISOString().split("T")[0];
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

function dayDiff(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

const daysUntil = (dateStr: string, today: string) => dayDiff(today, dateStr);

function dateThresholdKey(dateStr: string | null | undefined, today: string): string | null {
  if (!dateStr) return null;
  const days = daysUntil(String(dateStr).split("T")[0], today);
  return DATE_THRESHOLDS.includes(days) ? `${days}d` : null;
}

function dateThresholdLabel(key: string): string {
  if (key === "0d") return "heute";
  return `in ${key.replace("d", "")} Tagen`;
}

function resolveAufgabeEmpfaenger(
  task: any,
  bewohnerUserMap: Map<string, string>,
  recipients: string[],
): string[] {
  if (task.bewohner_id) {
    const linked = bewohnerUserMap.get(task.bewohner_id);
    if (linked && recipients.includes(linked)) return [linked];
  }
  return recipients;
}

function resolveOwnedRecipients(
  row: any,
  recipientSet: Set<string>,
  recipients: string[],
): string[] {
  const candidates = [
    row?.erinnerung_empfaenger_user_id,
    row?.created_by_user_id,
    row?.user_id,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (recipientSet.has(candidate)) return [candidate];
  }
  return recipients;
}

async function queueReminder(
  supabase: any,
  target: PushMessage[],
  householdId: string,
  recipientIds: string[],
  payload: Omit<PushMessage, "user_id">,
  identity: {
    entityType: string;
    entityId: string;
    reminderType: string;
    reminderKey: string;
    periodKey: string;
    value?: Record<string, unknown>;
  },
) {
  for (const recipientUserId of unique(recipientIds)) {
    const { error } = await supabase.from("home_push_reminder_state").insert({
      household_id: householdId,
      recipient_user_id: recipientUserId,
      entity_type: identity.entityType,
      entity_id: identity.entityId,
      reminder_type: identity.reminderType,
      reminder_key: identity.reminderKey,
      period_key: identity.periodKey,
      last_value: identity.value || {},
    });

    if (!error) {
      target.push({ user_id: recipientUserId, ...payload });
      continue;
    }

    if (error.code !== "23505") {
      console.warn("Reminder-State konnte nicht geschrieben werden:", error.message);
    }
  }
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
  const today = isoDate(now);
  const in15MinIso = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const before1MinIso = new Date(now.getTime() - 1 * 60 * 1000).toISOString();
  const in24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const in30Days = isoDate(addDays(now, 30));
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${currentMonth}-01`;
  const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  try {
    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("user_id");

    if (subscriptionError) throw subscriptionError;

    const subscribedUserIds = unique((subscriptionRows ?? []).map((row: any) => row.user_id));
    if (!subscribedUserIds.length) {
      return new Response(JSON.stringify({ checked: 0, requested: 0, sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membershipRows, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id, user_id")
      .in("user_id", subscribedUserIds);

    if (membershipError) throw membershipError;

    const householdRecipients = new Map<string, string[]>();
    for (const row of membershipRows ?? []) {
      if (!row?.household_id || !row?.user_id) continue;
      if (!householdRecipients.has(row.household_id)) householdRecipients.set(row.household_id, []);
      householdRecipients.get(row.household_id)!.push(row.user_id);
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const shoppingProfileUpdates: string[] = [];
    const cospendProfileUpdates: string[] = [];

    const householdMessages = await Promise.all(
      [...householdRecipients.entries()].map(async ([householdId, rawRecipients]) => {
        const recipients = unique(rawRecipients);
        const recipientSet = new Set(recipients);
        if (!recipients.length) return [] as PushMessage[];

        const [
          { data: dueTasks },
          { data: inventoryRows },
          { data: deviceRows },
          { data: projectRows },
          { data: reminderProfiles },
          { data: openShoppingItems },
          { data: bewohnerRows },
          { data: openLedgerRows, error: openLedgerError },
          { data: loanedBooks },
          { data: faelligeTasks },
          { data: contractRows },
          { data: insuranceRows },
          { data: budgetLimits },
          { data: budgetRows },
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
            .from("home_geraete")
            .select("id, name, naechste_wartung, garantie_bis, gewaehrleistung_bis, created_by_user_id, user_id")
            .eq("household_id", householdId)
            .or(`naechste_wartung.gte.${today},garantie_bis.gte.${today},gewaehrleistung_bis.gte.${today}`),
          supabase
            .from("projekte")
            .select("id, name, deadline, status")
            .eq("household_id", householdId)
            .not("deadline", "is", null)
            .neq("status", "abgeschlossen")
            .gte("deadline", today)
            .lte("deadline", isoDate(addDays(now, 1))),
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
            .select("id, titel, verliehen_an_name, rueckgabe_erwartet_am, erinnerung_intervall_tage, erinnerung_empfaenger_user_id, created_by_user_id, household_id")
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
          supabase
            .from("vertraege")
            .select("id, partner, vertragstitel, end_date, kuendigbar_ab")
            .eq("household_id", householdId)
            .or(`end_date.gte.${today},kuendigbar_ab.gte.${today}`)
            .or(`end_date.lte.${in30Days},kuendigbar_ab.lte.${in30Days}`),
          supabase
            .from("versicherungs_polizzen")
            .select("id, versicherer, versicherungsart, end_date, naechste_faelligkeit")
            .eq("household_id", householdId)
            .or(`end_date.gte.${today},naechste_faelligkeit.gte.${today}`)
            .or(`end_date.lte.${in30Days},naechste_faelligkeit.lte.${in30Days}`),
          supabase
            .from("home_budget_limits")
            .select("id, kategorie, limit_euro")
            .eq("household_id", householdId)
            .gt("limit_euro", 0),
          supabase
            .from("budget_posten")
            .select("id, kategorie, betrag, typ, budget_scope, datum")
            .eq("household_id", householdId)
            .gte("datum", monthStart)
            .lte("datum", monthEnd),
        ]);

        const msgs: PushMessage[] = [];
        const bewohnerUserMap = new Map<string, string>();
        for (const row of bewohnerRows ?? []) {
          if (row?.id && row?.linked_user_id) bewohnerUserMap.set(row.id, row.linked_user_id);
        }

        const aufgabeDbUpdates: Array<() => Promise<unknown>> = [];

        for (const task of dueTasks ?? []) {
          if (
            task.letzte_push_erinnerung_am &&
            new Date(task.letzte_push_erinnerung_am) >= new Date(task.erinnerungs_datum)
          ) continue;

          const empfaenger = resolveAufgabeEmpfaenger(task, bewohnerUserMap, recipients);
          empfaenger.forEach((userId) => msgs.push({
            user_id: userId,
            title: "Aufgaben-Erinnerung",
            body: task.beschreibung,
            url: "/home/aufgaben",
            tag: `aufgabe-${task.id}`,
          }));
          aufgabeDbUpdates.push(() =>
            supabase.from("todo_aufgaben")
              .update({ letzte_push_erinnerung_am: now.toISOString() })
              .eq("id", task.id)
          );
        }

        for (const task of faelligeTasks ?? []) {
          const faelligDate = (task.faelligkeitsdatum as string).split("T")[0];
          const isOverdue = faelligDate < today;

          if (!isOverdue) {
            const hasActiveReminder = task.erinnerungs_datum &&
              task.erinnerungs_datum >= before1MinIso &&
              task.erinnerungs_datum <= in15MinIso;
            if (hasActiveReminder || task.letzte_push_bald_faellig_fuer === faelligDate) continue;

            const empfaenger = resolveAufgabeEmpfaenger(task, bewohnerUserMap, recipients);
            empfaenger.forEach((userId) => msgs.push({
              user_id: userId,
              title: "Aufgabe bald faellig",
              body: `"${task.beschreibung}" ist bald faellig.`,
              url: "/home/aufgaben",
              tag: `aufgabe-due-soon-${task.id}`,
            }));
            aufgabeDbUpdates.push(() =>
              supabase.from("todo_aufgaben")
                .update({
                  letzte_push_bald_faellig_am: now.toISOString(),
                  letzte_push_bald_faellig_fuer: faelligDate,
                })
                .eq("id", task.id)
            );
          } else {
            const last = task.letzte_push_ueberfaellig_am;
            if (last && now.getTime() - new Date(last).getTime() < 24 * 60 * 60 * 1000) continue;

            const empfaenger = resolveAufgabeEmpfaenger(task, bewohnerUserMap, recipients);
            empfaenger.forEach((userId) => msgs.push({
              user_id: userId,
              title: "Aufgabe ueberfaellig",
              body: `"${task.beschreibung}" ist ueberfaellig.`,
              url: "/home/aufgaben",
              tag: `aufgabe-overdue-${task.id}`,
            }));
            aufgabeDbUpdates.push(() =>
              supabase.from("todo_aufgaben")
                .update({ letzte_push_ueberfaellig_am: now.toISOString() })
                .eq("id", task.id)
            );
          }
        }

        for (const row of (inventoryRows ?? []).filter((item: any) => Number(item.menge) <= Number(item.mindest_menge))) {
          await queueReminder(supabase, msgs, householdId, recipients, {
            title: "Vorrat unter Mindestmenge",
            body: `${row.name}: noch ${row.menge} ${row.einheit ?? ""} (Minimum: ${row.mindest_menge})`.trim(),
            url: "/home/vorraete",
            tag: `vorrat-${row.id}`,
          }, {
            entityType: "vorraete",
            entityId: String(row.id),
            reminderType: "low_stock",
            reminderKey: "below_minimum",
            periodKey: today,
            value: { menge: row.menge, mindest_menge: row.mindest_menge },
          });
        }

        for (const row of deviceRows ?? []) {
          const deviceRecipients = resolveOwnedRecipients(row, recipientSet, recipients);
          const deviceName = row.name || "Geraet";
          const checks = [
            { field: "naechste_wartung", type: "maintenance", title: "Wartung faellig", label: "Wartung" },
            { field: "garantie_bis", type: "guarantee", title: "Garantie laeuft ab", label: "Garantie" },
            { field: "gewaehrleistung_bis", type: "warranty", title: "Gewaehrleistung laeuft ab", label: "Gewaehrleistung" },
          ];

          for (const check of checks) {
            const dateValue = row[check.field];
            const thresholdKey = dateThresholdKey(dateValue, today);
            if (!thresholdKey) continue;
            await queueReminder(supabase, msgs, householdId, deviceRecipients, {
              title: check.title,
              body: `${deviceName}: ${check.label} ${dateThresholdLabel(thresholdKey)} (${dateValue}).`,
              url: "/home/geraete",
              tag: `geraet-${check.type}-${row.id}-${thresholdKey}`,
            }, {
              entityType: "home_geraete",
              entityId: String(row.id),
              reminderType: check.type,
              reminderKey: thresholdKey,
              periodKey: String(dateValue),
              value: { date: dateValue },
            });
          }
        }

        for (const row of projectRows ?? []) {
          await queueReminder(supabase, msgs, householdId, recipients, {
            title: "Projekt-Deadline",
            body: `"${row.name}" ist am ${row.deadline} faellig.`,
            url: "/home/projekte",
            tag: `projekt-${row.id}-${row.deadline}`,
          }, {
            entityType: "projekte",
            entityId: String(row.id),
            reminderType: "deadline",
            reminderKey: row.deadline === today ? "0d" : "1d",
            periodKey: String(row.deadline),
            value: { deadline: row.deadline },
          });
        }

        for (const contract of contractRows ?? []) {
          const name = contract.partner || contract.vertragstitel || "Vertrag";
          const checks = [
            { field: "kuendigbar_ab", type: "cancellation", title: "Kuendigungsfrist beachten", label: "Kuendbar" },
            { field: "end_date", type: "contract_end", title: "Vertrag laeuft ab", label: "Ende" },
          ];

          for (const check of checks) {
            const dateValue = contract[check.field];
            const thresholdKey = dateThresholdKey(dateValue, today);
            if (!thresholdKey) continue;
            await queueReminder(supabase, msgs, householdId, recipients, {
              title: check.title,
              body: `${name}: ${check.label} ${dateThresholdLabel(thresholdKey)} (${dateValue}).`,
              url: "/home/vertraege",
              tag: `vertrag-${check.type}-${contract.id}-${thresholdKey}`,
            }, {
              entityType: "vertraege",
              entityId: String(contract.id),
              reminderType: check.type,
              reminderKey: thresholdKey,
              periodKey: String(dateValue),
              value: { date: dateValue },
            });
          }
        }

        for (const policy of insuranceRows ?? []) {
          const name = policy.versicherer || policy.versicherungsart || "Versicherung";
          const checks = [
            { field: "end_date", type: "insurance_end", title: "Versicherung laeuft ab", label: "Ende" },
            { field: "naechste_faelligkeit", type: "insurance_due", title: "Versicherung faellig", label: "Faelligkeit" },
          ];

          for (const check of checks) {
            const dateValue = policy[check.field];
            const thresholdKey = dateThresholdKey(dateValue, today);
            if (!thresholdKey) continue;
            await queueReminder(supabase, msgs, householdId, recipients, {
              title: check.title,
              body: `${name}: ${check.label} ${dateThresholdLabel(thresholdKey)} (${dateValue}).`,
              url: "/home/versicherungen",
              tag: `versicherung-${check.type}-${policy.id}-${thresholdKey}`,
            }, {
              entityType: "versicherungs_polizzen",
              entityId: String(policy.id),
              reminderType: check.type,
              reminderKey: thresholdKey,
              periodKey: String(dateValue),
              value: { date: dateValue },
            });
          }
        }

        const spendingByCategory = new Map<string, number>();
        for (const row of budgetRows ?? []) {
          if (!row?.kategorie || row.typ === "einnahme" || row.budget_scope === "privat") continue;
          const current = spendingByCategory.get(row.kategorie) || 0;
          spendingByCategory.set(row.kategorie, current + Math.abs(Number(row.betrag) || 0));
        }

        for (const limit of budgetLimits ?? []) {
          const limitEuro = Number(limit.limit_euro || 0);
          const spent = spendingByCategory.get(limit.kategorie) || 0;
          if (limitEuro <= 0 || spent <= 0) continue;
          const percent = (spent / limitEuro) * 100;
          const reached = BUDGET_LIMIT_THRESHOLDS.filter((threshold) => percent >= threshold).pop();
          if (!reached) continue;

          await queueReminder(supabase, msgs, householdId, recipients, {
            title: reached >= 100 ? "Budget-Limit ueberschritten" : "Budget-Limit bald erreicht",
            body: `${limit.kategorie}: ${spent.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} von ${limitEuro.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR verbraucht.`,
            url: "/home/budget",
            tag: `budget-limit-${limit.id}-${currentMonth}-${reached}`,
          }, {
            entityType: "home_budget_limits",
            entityId: String(limit.id),
            reminderType: "budget_limit",
            reminderKey: String(reached),
            periodKey: currentMonth,
            value: { spent, limit: limitEuro, percent },
          });
        }

        for (const profile of (reminderProfiles ?? []) as UserProfileReminder[]) {
          if (!profile.einkauf_reminder_aktiv || !profile.einkauf_reminder_zeit) continue;
          if (profile.einkauf_reminder_letzter_versand === today) continue;

          const [hours, minutes] = profile.einkauf_reminder_zeit.split(":").map((x) => Number(x));
          const reminderMinutes = hours * 60 + minutes;
          if (Math.abs(currentMinutes - reminderMinutes) > 15 || !openShoppingItems?.length) continue;

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

            [
              bewohnerUserMap.get(row.from_member_id),
              bewohnerUserMap.get(row.to_member_id),
            ].filter((value): value is string => Boolean(value)).forEach((userId) => {
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
              body: `${openInfo.count} offene Positionen seit mehr als 14 Tagen - ${Number(openInfo.totalCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`,
              url: "/home/budget?tab=ausgleich",
              tag: `cospend-reminder-${householdId}`,
            });

            cospendProfileUpdates.push(profile.id);
          }
        }

        for (const book of loanedBooks ?? []) {
          if (!book.rueckgabe_erwartet_am) continue;
          const overdue = book.rueckgabe_erwartet_am <= today;
          const thresholdKey = overdue ? "overdue" : dateThresholdKey(book.rueckgabe_erwartet_am, today);
          if (!thresholdKey) continue;

          const empfaenger = resolveOwnedRecipients(book, recipientSet, recipients);
          await queueReminder(supabase, msgs, householdId, empfaenger, {
            title: overdue ? "Buch ueberfaellig" : "Buch-Rueckgabe faellig",
            body: `"${book.titel}" ist ${overdue ? "ueberfaellig" : dateThresholdLabel(thresholdKey)} - ausgeliehen an ${book.verliehen_an_name ?? "unbekannt"}.`,
            url: "/home/inventar?tab=buecher",
            tag: `buch-reminder-${book.id}-${thresholdKey}`,
          }, {
            entityType: "home_buecher",
            entityId: String(book.id),
            reminderType: "loan_return",
            reminderKey: thresholdKey,
            periodKey: overdue ? today : String(book.rueckgabe_erwartet_am),
            value: { rueckgabe_erwartet_am: book.rueckgabe_erwartet_am },
          });
        }

        if (aufgabeDbUpdates.length > 0) {
          await Promise.all(aufgabeDbUpdates.map((fn) => fn()));
        }

        return msgs;
      }),
    );

    const messages = householdMessages.flat();

    if (shoppingProfileUpdates.length > 0) {
      await Promise.all(
        unique(shoppingProfileUpdates).map((profileId) =>
          supabase
            .from("user_profile")
            .update({ einkauf_reminder_letzter_versand: today })
            .eq("id", profileId)
        ),
      );
    }

    if (cospendProfileUpdates.length > 0) {
      await Promise.all(
        unique(cospendProfileUpdates).map((profileId) =>
          supabase
            .from("user_profile")
            .update({ cospend_reminder_letzter_versand: today })
            .eq("id", profileId)
        ),
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let sent = 0;
    let failed = 0;
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

          const data = await res.json().catch(() => ({}));
          const messageSent = Number(data?.sent || 0) > 0;
          if (res.ok && messageSent) {
            sent += 1;
          } else {
            failed += 1;
            if (!res.ok || data?.error) {
              console.warn("send-push returned no delivery:", data?.error || data?.message || res.status);
            }
          }
        } catch (error) {
          failed += 1;
          console.error("send-push invocation failed:", error);
        }
      }),
    );

    return new Response(JSON.stringify({ checked: messages.length, requested: messages.length, sent, failed }), {
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
