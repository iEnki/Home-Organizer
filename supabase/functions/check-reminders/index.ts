// Supabase Edge Function: check-reminders
// Prüft fällige Erinnerungen für alle Nutzer mit aktiver Push-Subscription
// und ruft intern send-push auf.
//
// Wird via pg_cron alle 30 Minuten aufgerufen (siehe Supabase_Tabellen_Setup.md).
//
// Auslöser:
//   1. Aufgaben-Erinnerungen  (todo_aufgaben.erinnerungs_datum)
//   2. Vorräte unter Minimum  (vorraete.menge <= mindest_menge)
//   3. Geräte-Wartung fällig  (geraete.naechste_wartung ≤ heute + 7 Tage)
//   4. Projekt-Deadlines      (projekte.deadline ≤ heute + 1 Tag)
//   5. Einkaufsliste-Reminder (user_profile.einkauf_reminder_aktiv + einkauf_reminder_zeit)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const jetzt       = new Date();
  const in15Min     = new Date(jetzt.getTime() + 15 * 60 * 1000).toISOString();
  const vor1Min     = new Date(jetzt.getTime() -  1 * 60 * 1000).toISOString();
  const in7Tagen    = new Date(jetzt.getTime() + 7  * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const in1Tag      = new Date(jetzt.getTime() + 1  * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const heute       = jetzt.toISOString().split("T")[0];

  // Alle Nutzer mit aktiver Subscription ermitteln
  const { data: abonnenten } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .then(({ data }) => ({ data: [...new Set((data ?? []).map((s: any) => s.user_id))] }));

  if (!abonnenten?.length) {
    return new Response(JSON.stringify({ checked: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nachrichten: { user_id: string; title: string; body: string; url: string; tag: string }[] = [];

  // ── 1. Aufgaben-Erinnerungen ──────────────────────────────────────────────
  const { data: aufgaben } = await supabase
    .from("todo_aufgaben")
    .select("id, user_id, beschreibung, erinnerungs_datum")
    .in("user_id", abonnenten)
    .eq("erledigt", false)
    .not("erinnerungs_datum", "is", null)
    .gte("erinnerungs_datum", vor1Min)
    .lte("erinnerungs_datum", in15Min);

  for (const a of aufgaben ?? []) {
    nachrichten.push({
      user_id: a.user_id,
      title:   "Aufgaben-Erinnerung",
      body:    a.beschreibung,
      url:     "/home/aufgaben",
      tag:     `aufgabe-${a.id}`,
    });
  }

  // ── 2. Vorräte unter Mindestmenge ─────────────────────────────────────────
  const { data: vorraete } = await supabase
    .from("vorraete")
    .select("id, user_id, name, menge, mindest_menge, einheit")
    .in("user_id", abonnenten)
    .not("mindest_menge", "is", null)
    .gt("mindest_menge", 0); // Nur Einträge mit gesetzter Mindestmenge; JS-Vergleich unten

  // Supabase unterstützt keinen column-to-column Filter → Filterung in JS
  for (const v of (vorraete ?? []).filter((v: any) => v.menge <= v.mindest_menge)) {
    nachrichten.push({
      user_id: v.user_id,
      title:   "Vorrat unter Mindestmenge",
      body:    `${v.name}: noch ${v.menge} ${v.einheit ?? ""} (Minimum: ${v.mindest_menge})`.trim(),
      url:     "/home/vorraete",
      tag:     `vorrat-${v.id}`,
    });
  }

  // ── 3. Geräte-Wartung fällig ──────────────────────────────────────────────
  const { data: geraete } = await supabase
    .from("geraete")
    .select("id, user_id, name, naechste_wartung")
    .in("user_id", abonnenten)
    .not("naechste_wartung", "is", null)
    .gte("naechste_wartung", heute)
    .lte("naechste_wartung", in7Tagen);

  for (const g of geraete ?? []) {
    nachrichten.push({
      user_id: g.user_id,
      title:   "Wartung fällig",
      body:    `${g.name} – Wartung am ${g.naechste_wartung}`,
      url:     "/home/geraete",
      tag:     `geraet-${g.id}`,
    });
  }

  // ── 4. Projekt-Deadlines ──────────────────────────────────────────────────
  const { data: projekte } = await supabase
    .from("projekte")
    .select("id, user_id, name, deadline, status")
    .in("user_id", abonnenten)
    .not("deadline", "is", null)
    .neq("status", "abgeschlossen")
    .gte("deadline", heute)
    .lte("deadline", in1Tag);

  for (const p of projekte ?? []) {
    nachrichten.push({
      user_id: p.user_id,
      title:   "Projekt-Deadline morgen",
      body:    `„${p.name}" ist am ${p.deadline} fällig.`,
      url:     "/home/projekte",
      tag:     `projekt-${p.id}`,
    });
  }

  // ── 5. Einkaufsliste-Reminder ─────────────────────────────────────────────
  // Lokalzeit des Containers verwenden (TZ=Europe/Vienna in docker-compose gesetzt)
  const aktuelleMinutenTag = jetzt.getHours() * 60 + jetzt.getMinutes();
  const heuteDatum = heute; // bereits gesetzt: jetzt.toISOString().split("T")[0]

  const { data: einkaufProfile } = await supabase
    .from("user_profile")
    .select("id, einkauf_reminder_zeit, einkauf_reminder_letzter_versand")
    .eq("einkauf_reminder_aktiv", true)
    .not("einkauf_reminder_zeit", "is", null)
    .in("id", abonnenten);

  for (const profil of einkaufProfile ?? []) {
    // Heute bereits gesendet?
    if (profil.einkauf_reminder_letzter_versand === heuteDatum) continue;

    // Zeitfenster ±15 Minuten prüfen
    const [h, m] = (profil.einkauf_reminder_zeit as string).split(":").map(Number);
    const reminderMinuten = h * 60 + m;
    if (Math.abs(aktuelleMinutenTag - reminderMinuten) > 15) continue;

    // Offene Einkäufe ermitteln
    const { data: offeneItems } = await supabase
      .from("home_einkaufliste")
      .select("name")
      .eq("user_id", profil.id)
      .eq("erledigt", false)
      .limit(5);

    if (!offeneItems?.length) continue;

    const vorschau = offeneItems.slice(0, 3).map((i: any) => i.name).join(", ");
    const rest     = offeneItems.length > 3 ? ` +${offeneItems.length - 3} weitere` : "";

    nachrichten.push({
      user_id: profil.id,
      title:   "Einkaufsliste",
      body:    `${offeneItems.length} Artikel offen: ${vorschau}${rest}`,
      url:     "/home/einkaufen",
      tag:     "einkauf-reminder",
    });

    // Letzter Versand aktualisieren (Duplikat-Schutz)
    await supabase
      .from("user_profile")
      .update({ einkauf_reminder_letzter_versand: heuteDatum })
      .eq("id", profil.id);
  }

  // ── Pushes senden ─────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let gesendet = 0;
  await Promise.all(
    nachrichten.map(async (msg) => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(msg),
        });
        gesendet++;
      } catch (err) {
        console.error("send-push Aufruf fehlgeschlagen:", err);
      }
    }),
  );

  return new Response(
    JSON.stringify({ checked: nachrichten.length, sent: gesendet }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
