/* ───────────────────────────────────────────────────────────────
   Service Worker Registration + Push-Subscription Management
   ─────────────────────────────────────────────────────────────── */
import { supabase } from "./supabaseClient";

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

/** Base64URL → Uint8Array (wird für applicationServerKey benötigt) */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** Service Worker registrieren */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(
      "/service-worker.js",
      { scope: "/" }
    );
    return registration;
  } catch (err) {
    console.error("[SW] Registrierung fehlgeschlagen:", err);
    return null;
  }
}

/** Push-Subscription anlegen und in Supabase speichern */
export async function subscribeToPush(userId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.");
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("VAPID Public Key fehlt in den Umgebungsvariablen.");
  }

  // Berechtigung anfragen (falls noch nicht erteilt)
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Berechtigung verweigert.");
  }

  const registration = await navigator.serviceWorker.ready;

  // Bestehende Subscription entfernen (für sauberes Neu-Abonnieren)
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  // Neu abonnieren
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  // In Supabase speichern
  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: "user_id,endpoint" }
    );
  if (error) throw error;

  return subscription;
}

/** Push-Subscription aufheben und aus Supabase löschen */
export async function unsubscribeFromPush(userId) {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
  }
}

/** Prüft ob der aktuelle Browser bereits eine aktive Subscription hat */
export async function getAktiveSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}
