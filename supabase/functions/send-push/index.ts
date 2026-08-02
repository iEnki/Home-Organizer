// Supabase Edge Function: send-push
// Authentifizierter, gebuendelter Web-Push-Versand mit festen Zeitlimits.

// @ts-ignore web-push is Deno-compatible through esm.sh.
import webpush from "https://esm.sh/web-push@3.6.7";
import {
  fetchFirstAvailableSupabaseJson,
  requiredEnv,
  requireSupabaseOk,
  supabaseRestHeaders,
  supabaseServiceCandidates,
  SupabaseHttpError,
} from "../_shared/supabaseHttp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-request-id",
};

const FUNCTION_VERSION = "send-push-2026-07-29.1";
const MAX_TARGET_USERS = 50;
const INTERNAL_REQUEST_TIMEOUT_MS = 4_000;
const WEB_PUSH_TIMEOUT_MS = 6_000;
const OVERALL_TIMEOUT_MS = 20_000;

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const uniqueNonEmpty = (values: unknown[]) =>
  [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];

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

const inFilter = (values: string[]) =>
  `in.(${values.map((value) => encodeURIComponent(value)).join(",")})`;

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const deadlineAt = startedAt + OVERALL_TIMEOUT_MS;
  let stage = "request";

  const responseHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "x-request-id": requestId,
  };
  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: responseHeaders });
  const fail = ({
    status,
    code,
    message,
    retryable = false,
  }: {
    status: number;
    code: string;
    message: string;
    retryable?: boolean;
  }) => jsonResponse({
    error: message,
    message,
    code,
    status,
    retryable,
    requestId,
    stage,
    latencyMs: Date.now() - startedAt,
    version: FUNCTION_VERSION,
    sent: 0,
    sentUsers: 0,
    failed: 0,
    failedUsers: 0,
    removed: 0,
  }, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail({
      status: 405,
      code: "METHOD_NOT_ALLOWED",
      message: "Nur POST ist erlaubt.",
    });
  }

  const remainingTimeout = () => {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new DOMException("send-push timed out", "AbortError");
    return Math.max(250, Math.min(INTERNAL_REQUEST_TIMEOUT_MS, remaining));
  };

  try {
    const vapidSubject = requiredEnv("VAPID_SUBJECT");
    const vapidPublicKey = requiredEnv("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = requiredEnv("VAPID_PRIVATE_KEY");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const token = bearerToken(req);
    if (!token) {
      return fail({
        status: 401,
        code: "AUTH_REQUIRED",
        message: "Nicht authentifiziert.",
      });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return fail({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Ungueltige JSON-Anfrage.",
      });
    }

    const requestedUserIds = Array.isArray(payload.user_ids)
      ? payload.user_ids
      : [payload.user_id];
    const targetUserIds = uniqueNonEmpty(requestedUserIds);
    const {
      title,
      body,
      url = "/",
      tag = "default",
      locale: requestedLocale,
    } = payload;
    if (!targetUserIds.length || !title || !body) {
      return fail({
        status: 400,
        code: "INVALID_REQUEST",
        message: "user_id oder user_ids sowie title und body sind erforderlich.",
      });
    }
    if (targetUserIds.length > MAX_TARGET_USERS) {
      return fail({
        status: 400,
        code: "TOO_MANY_TARGETS",
        message: `Maximal ${MAX_TARGET_USERS} Empfaenger sind pro Anfrage erlaubt.`,
      });
    }

    const restRequest = async (path: string, init: RequestInit = {}) =>
      fetchFirstAvailableSupabaseJson(
        supabaseServiceCandidates(
          Deno.env.get("SUPABASE_REST_URL"),
          path,
          `/rest/v1${path}`,
        ),
        {
          ...init,
          headers: {
            ...supabaseRestHeaders(serviceKey),
            ...(init.headers || {}),
          },
        },
        remainingTimeout(),
      );

    let actorUserId = "";
    const serviceRequest = token === serviceKey;
    if (!serviceRequest) {
      stage = "auth";
      const authResult = await fetchFirstAvailableSupabaseJson(
        supabaseServiceCandidates(
          Deno.env.get("SUPABASE_AUTH_URL"),
          "/user",
          "/auth/v1/user",
        ),
        {
          method: "GET",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
        },
        remainingTimeout(),
      );
      if (!authResult.response.ok || !authResult.payload?.id) {
        return fail({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "Nicht authentifiziert.",
        });
      }
      actorUserId = String(authResult.payload.id);

      const otherTargetIds = targetUserIds.filter((userId) => userId !== actorUserId);
      if (otherTargetIds.length) {
        stage = "authorization";
        const actorMembershipResult = await restRequest(
          `/household_members?select=household_id&user_id=eq.${encodeURIComponent(actorUserId)}`,
        );
        const actorMemberships = requireSupabaseOk(actorMembershipResult);
        const householdIds = uniqueNonEmpty(
          (Array.isArray(actorMemberships) ? actorMemberships : [])
            .map((row: Record<string, unknown>) => row.household_id),
        );
        if (!householdIds.length) {
          return fail({
            status: 403,
            code: "FORBIDDEN",
            message: "Keine Berechtigung fuer die angeforderten Empfaenger.",
          });
        }

        const targetMembershipResult = await restRequest(
          `/household_members?select=user_id&user_id=${inFilter(otherTargetIds)}` +
          `&household_id=${inFilter(householdIds)}`,
        );
        const targetMemberships = requireSupabaseOk(targetMembershipResult);
        const authorizedTargetIds = new Set(
          (Array.isArray(targetMemberships) ? targetMemberships : [])
            .map((row: Record<string, unknown>) => String(row.user_id || "")),
        );
        if (otherTargetIds.some((userId) => !authorizedTargetIds.has(userId))) {
          return fail({
            status: 403,
            code: "FORBIDDEN",
            message: "Keine Berechtigung fuer die angeforderten Empfaenger.",
          });
        }
      }
    }

    stage = "recipients";
    const [profilesResult, subscriptionsResult] = await Promise.all([
      restRequest(`/user_profile?select=id,locale&id=${inFilter(targetUserIds)}`),
      restRequest(
        `/push_subscriptions?select=id,user_id,endpoint,p256dh,auth` +
        `&user_id=${inFilter(targetUserIds)}`,
      ),
    ]);
    const profiles = requireSupabaseOk(profilesResult);
    const subscriptions = requireSupabaseOk(subscriptionsResult) as PushSubscriptionRow[];
    const localeByUserId = new Map(
      (Array.isArray(profiles) ? profiles : []).map((profile: Record<string, unknown>) => [
        String(profile.id || ""),
        normalizeLocale(requestedLocale || profile.locale),
      ]),
    );

    if (!Array.isArray(subscriptions) || !subscriptions.length) {
      return jsonResponse({
        sent: 0,
        sentUsers: 0,
        failed: 0,
        failedUsers: 0,
        skippedUsers: targetUserIds.length,
        removed: 0,
        errors: [],
        message: "Keine aktiven Subscriptions.",
        requestId,
        stage: "complete",
        latencyMs: Date.now() - startedAt,
        version: FUNCTION_VERSION,
      });
    }

    stage = "push";
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const invalidIds: string[] = [];
    const errors: Array<{ subscription_id: string; status: number | null; message: string }> = [];
    const sentUserIds = new Set<string>();
    const failedUserIds = new Set<string>();
    let sent = 0;

    await Promise.all(subscriptions.map(async (subscription) => {
      const locale = localeByUserId.get(subscription.user_id)
        || normalizeLocale(requestedLocale);
      const notificationPayload = JSON.stringify({
        title: translatePushFallback(String(title), locale),
        body: translatePushFallback(String(body), locale),
        url,
        tag,
        locale,
      });
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, notificationPayload, {
          timeout: Math.min(WEB_PUSH_TIMEOUT_MS, Math.max(250, deadlineAt - Date.now())),
        });
        sent += 1;
        sentUserIds.add(subscription.user_id);
      } catch (error: any) {
        const status = Number(error?.statusCode) || null;
        if (status === 400 || status === 404 || status === 410) {
          invalidIds.push(subscription.id);
        } else {
          failedUserIds.add(subscription.user_id);
          errors.push({
            subscription_id: subscription.id,
            status,
            message: error?.message || "Unknown web-push error",
          });
        }
      }
    }));

    if (invalidIds.length) {
      stage = "cleanup";
      const cleanupResult = await restRequest(
        `/push_subscriptions?id=${inFilter(invalidIds)}`,
        {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        },
      );
      if (!cleanupResult.response.ok) {
        errors.push({
          subscription_id: "cleanup",
          status: cleanupResult.response.status,
          message: cleanupResult.payload?.message || "Subscription cleanup failed",
        });
      }
    }

    const latencyMs = Date.now() - startedAt;
    const sentUsers = sentUserIds.size;
    for (const userId of sentUserIds) failedUserIds.delete(userId);
    const failedUsers = failedUserIds.size;
    const result = {
      sent,
      sentUsers,
      failed: Math.max(subscriptions.length - sent - invalidIds.length, 0),
      failedUsers,
      skippedUsers: Math.max(targetUserIds.length - sentUsers - failedUsers, 0),
      removed: invalidIds.length,
      errors,
      requestId,
      stage: "complete",
      latencyMs,
      version: FUNCTION_VERSION,
    };
    console.info(JSON.stringify({
      event: "send-push.complete",
      requestId,
      latencyMs,
      targets: targetUserIds.length,
      subscriptions: subscriptions.length,
      sent,
      sentUsers,
      failed: result.failed,
      removed: invalidIds.length,
    }));
    return jsonResponse(result);
  } catch (error: any) {
    const isTimeout = error?.name === "AbortError";
    const isSupabaseError = error instanceof SupabaseHttpError;
    const status = isTimeout ? 504 : isSupabaseError ? 502 : 500;
    const code = isTimeout
      ? "PUSH_TIMEOUT"
      : isSupabaseError
      ? "SUPABASE_REQUEST_FAILED"
      : "PUSH_FAILED";
    const message = isTimeout
      ? "Der Push-Dienst hat nicht rechtzeitig geantwortet."
      : "Die Push-Benachrichtigung konnte nicht verarbeitet werden.";
    console.error(JSON.stringify({
      event: "send-push.failed",
      requestId,
      stage,
      latencyMs: Date.now() - startedAt,
      code,
      status: Number(error?.status || 0) || null,
      message: error?.message || String(error),
    }));
    return fail({
      status,
      code,
      message,
      retryable: isTimeout || isSupabaseError,
    });
  }
});
