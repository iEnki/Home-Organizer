// Supabase Edge Function: send-push
// Sendet eine Web-Push-Benachrichtigung an alle Subscriptions eines Nutzers.
//
// POST-Body: { user_id: string, title: string, body: string, url?: string, tag?: string }
//
// Benötigte Supabase-Secrets:
//   VAPID_SUBJECT   = mailto:deine@email.de
//   VAPID_PUBLIC_KEY  = <public key aus npx web-push generate-vapid-keys>
//   VAPID_PRIVATE_KEY = <private key>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore – web-push ist Deno-kompatibel via esm.sh
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeLocale = (value: unknown) => {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "en" || raw === "en-gb" ? "en-GB" : "de";
};

const translatePushFallback = (value: string, locale: string) => {
  if (locale !== "en-GB") return value;
  const exact: Record<string, string> = {
    "Umzugsplaner – Erinnerung": "Moving Planner - reminder",
    "Aufgaben-Erinnerung": "Task reminder",
    "Aufgabe bald faellig": "Task due soon",
    "Aufgabe überfällig": "Task overdue",
    "Aufgabe ueberfaellig": "Task overdue",
    "Vorrat unter Mindestmenge": "Stock below minimum",
    "Vorrat laeuft bald ab": "Stock expiring soon",
    "Wartung faellig": "Maintenance due",
    "Garantie laeuft ab": "Guarantee expiring",
    "Gewaehrleistung laeuft ab": "Statutory warranty expiring",
    "Projekt-Deadline": "Project deadline",
    "Kuendigungsfrist beachten": "Check cancellation deadline",
    "Vertrag laeuft ab": "Contract ending",
    "Versicherung laeuft ab": "Insurance ending",
    "Versicherung faellig": "Insurance due",
    "Budget-Limit ueberschritten": "Budget limit exceeded",
    "Budget-Limit bald erreicht": "Budget limit almost reached",
    "Einkaufsliste": "Shopping list",
    "Offene Ausgleiche": "Open settlements",
    "Buch ueberfaellig": "Book overdue",
    "Buch-Rueckgabe faellig": "Book return due",
  };
  const trimmed = value.trim();
  if (exact[trimmed]) return exact[trimmed];
  return value
    .replace(/\bist bald faellig\b/g, "is due soon")
    .replace(/\bist ueberfaellig\b/g, "is overdue")
    .replace(/\bvon\b/g, "of")
    .replace(/\bverbraucht\b/g, "used")
    .replace(/\bArtikel offen\b/g, "open items");
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
      console.error("send-push Konfigurationsfehler: fehlende VAPID-Umgebungsvariablen");
      return new Response(
        JSON.stringify({ error: "VAPID-Konfiguration fehlt." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // VAPID konfigurieren
    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    );

    // Supabase Admin-Client (Service Role Key aus Env)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { user_id, title, body, url = "/", tag = "default", locale: requestedLocale } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title and body are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: profile } = await supabase
      .from("user_profile")
      .select("locale")
      .eq("id", user_id)
      .maybeSingle();
    const locale = normalizeLocale(requestedLocale || profile?.locale);

    // Subscriptions des Nutzers laden
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (dbError) throw dbError;
    if (!subscriptions?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: locale === "en-GB" ? "No active subscriptions." : "Keine aktiven Subscriptions." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = JSON.stringify({
      title: translatePushFallback(String(title), locale),
      body: translatePushFallback(String(body), locale),
      url,
      tag,
      locale,
    });
    const ungueltigeIds: string[] = [];
    let gesendet = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          gesendet++;
        } catch (err: any) {
          // 404 / 410 = Subscription abgelaufen → aus DB löschen
          if (err.statusCode === 404 || err.statusCode === 410) {
            ungueltigeIds.push(sub.id);
          } else {
            console.error("Push-Fehler für Subscription", sub.id, err.message);
          }
        }
      }),
    );

    // Abgelaufene Subscriptions bereinigen
    if (ungueltigeIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", ungueltigeIds);
    }

    return new Response(
      JSON.stringify({ sent: gesendet, removed: ungueltigeIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-push Fehler:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
