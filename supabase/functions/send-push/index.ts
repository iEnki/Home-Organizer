import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore web-push is Deno-compatible through esm.sh.
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeLocale = (value: unknown) => {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "en" || raw === "en-gb" ? "en-GB" : "de";
};

const bearerToken = (req: Request) => {
  const value = req.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
};

const translatePushFallback = (value: string, locale: string) => {
  if (locale !== "en-GB") return value;
  const exact: Record<string, string> = {
    "Umzugsplaner - Erinnerung": "Moving Planner - reminder",
    "Aufgaben-Erinnerung": "Task reminder",
    "Aufgabe bald faellig": "Task due soon",
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
  return exact[value.trim()] || value;
};

async function isAuthorized(
  admin: ReturnType<typeof createClient>,
  token: string,
  targetUserId: string,
): Promise<boolean> {
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await authClient.auth.getUser();
  const actorUserId = data?.user?.id;
  if (error || !actorUserId) return false;
  if (actorUserId === targetUserId) return true;

  const { data: actorMemberships, error: actorError } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", actorUserId);
  if (actorError || !actorMemberships?.length) return false;

  const householdIds = actorMemberships.map((row: any) => row.household_id);
  const { data: sharedMembership, error: targetError } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", targetUserId)
    .in("household_id", householdIds)
    .limit(1)
    .maybeSingle();
  return !targetError && Boolean(sharedMembership);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse({ error: "VAPID-Konfiguration fehlt.", sent: 0, failed: 0, removed: 0 }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const payload = await req.json();
    const {
      user_id,
      title,
      body,
      url = "/",
      tag = "default",
      locale: requestedLocale,
    } = payload || {};

    if (!user_id || !title || !body) {
      return jsonResponse({
        error: "user_id, title and body are required.",
        sent: 0,
        failed: 0,
        removed: 0,
      }, 400);
    }
    if (!await isAuthorized(admin, bearerToken(req), String(user_id))) {
      return jsonResponse({ error: "Forbidden.", sent: 0, failed: 0, removed: 0 }, 403);
    }

    const { data: profile } = await admin
      .from("user_profile")
      .select("locale")
      .eq("id", user_id)
      .maybeSingle();
    const locale = normalizeLocale(requestedLocale || profile?.locale);

    const { data: subscriptions, error: dbError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);
    if (dbError) throw dbError;
    if (!subscriptions?.length) {
      return jsonResponse({
        sent: 0,
        failed: 0,
        removed: 0,
        errors: [],
        message: locale === "en-GB" ? "No active subscriptions." : "Keine aktiven Subscriptions.",
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const notificationPayload = JSON.stringify({
      title: translatePushFallback(String(title), locale),
      body: translatePushFallback(String(body), locale),
      url,
      tag,
      locale,
    });

    const invalidIds: string[] = [];
    const errors: Array<{ subscription_id: string; status: number | null; message: string }> = [];
    let sent = 0;

    await Promise.all(subscriptions.map(async (subscription: any) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, notificationPayload);
        sent += 1;
      } catch (error: any) {
        const status = Number(error?.statusCode) || null;
        // Push services use 400 for malformed/expired subscription keys or
        // endpoints. Retrying such a subscription cannot succeed.
        if (status === 400 || status === 404 || status === 410) invalidIds.push(subscription.id);
        else {
          errors.push({
            subscription_id: subscription.id,
            status,
            message: error?.message || "Unknown web-push error",
          });
        }
      }
    }));

    if (invalidIds.length) {
      const { error: cleanupError } = await admin.from("push_subscriptions").delete().in("id", invalidIds);
      if (cleanupError) {
        errors.push({ subscription_id: "cleanup", status: null, message: cleanupError.message });
      }
    }

    return jsonResponse({
      sent,
      failed: Math.max(subscriptions.length - sent - invalidIds.length, 0),
      removed: invalidIds.length,
      errors,
    });
  } catch (error: any) {
    console.error("send-push failed:", error);
    return jsonResponse({
      error: error?.message || "Unknown error",
      sent: 0,
      failed: 0,
      removed: 0,
    }, 500);
  }
});
