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

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // VAPID konfigurieren
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    // Supabase Admin-Client (Service Role Key aus Env)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { user_id, title, body, url = "/", tag = "default" } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title und body sind erforderlich." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Subscriptions des Nutzers laden
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (dbError) throw dbError;
    if (!subscriptions?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: "Keine aktiven Subscriptions." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = JSON.stringify({ title, body, url, tag });
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
