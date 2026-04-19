import { useState, useEffect, useCallback } from "react";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getAktiveSubscription,
} from "../serviceWorkerRegistration";

export default function usePushSubscription(userId) {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState(
    isSupported ? Notification.permission : "denied",
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState(null);

  const refresh = useCallback(async () => {
    if (!isSupported || !userId) {
      setPermission(isSupported ? Notification.permission : "denied");
      setIsSubscribed(false);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const subscription = await getAktiveSubscription(userId);
      setIsSubscribed(!!subscription);
      setPermission(Notification.permission);
      setFehler(null);
      return subscription;
    } catch (error) {
      setPermission(Notification.permission);
      setIsSubscribed(false);
      setFehler(error?.message ?? "Push-Status konnte nicht aktualisiert werden.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [isSupported, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSupported || !userId) return undefined;

    const handleRefresh = () => {
      refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isSupported, refresh, userId]);

  const aktivieren = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);

    try {
      await subscribeToPush(userId);
      await refresh();
    } catch (error) {
      setPermission("Notification" in window ? Notification.permission : "denied");
      setFehler(error?.message ?? "Unbekannter Fehler");
      setLoading(false);
    }
  }, [refresh, userId]);

  const deaktivieren = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);

    try {
      await unsubscribeFromPush(userId);
      setIsSubscribed(false);
      setPermission("Notification" in window ? Notification.permission : "denied");
    } catch (error) {
      setFehler(error?.message ?? "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    fehler,
    aktivieren,
    deaktivieren,
    refresh,
  };
}
