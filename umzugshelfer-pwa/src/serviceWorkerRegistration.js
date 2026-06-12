import { supabase } from "./supabaseClient";

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function uint8ArraysEqual(left, right) {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.every((value, index) => value === b[index]);
}

function subscriptionUsesCurrentVapidKey(subscription) {
  const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  return uint8ArraysEqual(subscription?.options?.applicationServerKey, currentKey);
}

async function upsertSubscription(userId, subscription) {
  if (!userId || !subscription) return;

  const json = subscription.toJSON();
  const endpoint = json?.endpoint;
  const p256dh = json?.keys?.p256dh;
  const auth = json?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push-Subscription ist unvollständig.");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) throw error;
}

async function ensureServiceWorkerReady() {
  if (!isPushSupported()) {
    throw new Error("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.");
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Service Worker konnte nicht registriert werden.");
  }

  const readyRegistration = await navigator.serviceWorker.ready;
  if (!readyRegistration?.active) {
    throw new Error("Service Worker ist noch nicht aktiv. Bitte Seite neu laden und erneut versuchen.");
  }

  return readyRegistration;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration("/");
    const registration = existingRegistration ||
      await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.error("[SW] Registrierung fehlgeschlagen:", error);
    return null;
  }
}

export async function subscribeToPush(userId) {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("VAPID Public Key fehlt in den Umgebungsvariablen.");
  }

  const currentPermission = Notification.permission;
  if (currentPermission === "denied") {
    throw new Error("Browser-Berechtigung verweigert.");
  }

  let permission = currentPermission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("Browser-Berechtigung verweigert.");
  }

  const registration = await ensureServiceWorkerReady();
  let existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription && subscriptionUsesCurrentVapidKey(existingSubscription)) {
    await upsertSubscription(userId, existingSubscription);
    return existingSubscription;
  }
  if (existingSubscription) {
    const staleEndpoint = existingSubscription.endpoint;
    await existingSubscription.unsubscribe();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", staleEndpoint);
    existingSubscription = null;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await upsertSubscription(userId, subscription);
  return subscription;
}

export async function unsubscribeFromPush(userId) {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe();

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
}

export async function getAktiveSubscription(userId) {
  if (!isPushSupported()) return null;

  const registration = await ensureServiceWorkerReady();
  const subscription = await registration.pushManager.getSubscription();

  if (
    subscription &&
    VAPID_PUBLIC_KEY &&
    !subscriptionUsesCurrentVapidKey(subscription)
  ) {
    await subscription.unsubscribe();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", subscription.endpoint);
    return null;
  }

  if (subscription && userId && Notification.permission === "granted") {
    await upsertSubscription(userId, subscription);
  }

  return subscription;
}

export function listenForPushSubscriptionChanges(userId, onChanged) {
  if (!("serviceWorker" in navigator) || !userId) return () => {};

  const handleMessage = async (event) => {
    if (event.data?.type !== "PUSH_SUBSCRIPTION_CHANGED") return;
    try {
      const registration = await ensureServiceWorkerReady();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await upsertSubscription(userId, subscription);
      onChanged?.(subscription);
    } catch (error) {
      console.warn("[Push] Erneuerte Subscription konnte nicht gespeichert werden.", error);
    }
  };

  navigator.serviceWorker.addEventListener("message", handleMessage);
  return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
}
