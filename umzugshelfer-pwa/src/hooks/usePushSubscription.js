import { useState, useEffect, useCallback } from "react";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getAktiveSubscription,
} from "../serviceWorkerRegistration";

/**
 * usePushSubscription – verwaltet den Push-Benachrichtigungs-Status des Nutzers.
 *
 * @param {string|undefined} userId – Supabase User-ID
 * @returns {{ permission, isSubscribed, isSupported, loading, aktivieren, deaktivieren }}
 */
export default function usePushSubscription(userId) {
  const isSupported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  const [permission,    setPermission]    = useState(
    isSupported ? Notification.permission : "denied"
  );
  const [isSubscribed,  setIsSubscribed]  = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [fehler,        setFehler]        = useState(null);

  // Beim Mount: aktuelle Subscription prüfen
  useEffect(() => {
    if (!isSupported || !userId) {
      setLoading(false);
      return;
    }

    getAktiveSubscription().then((sub) => {
      setIsSubscribed(!!sub);
      setPermission(Notification.permission);
      setLoading(false);
    });
  }, [isSupported, userId]);

  /** Push-Benachrichtigungen aktivieren */
  const aktivieren = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);
    try {
      await subscribeToPush(userId);
      setIsSubscribed(true);
      setPermission("granted");
    } catch (err) {
      setFehler(err.message ?? "Unbekannter Fehler");
      // Berechtigung-Status aktualisieren
      if ("Notification" in window) setPermission(Notification.permission);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /** Push-Benachrichtigungen deaktivieren */
  const deaktivieren = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFehler(null);
    try {
      await unsubscribeFromPush(userId);
      setIsSubscribed(false);
    } catch (err) {
      setFehler(err.message ?? "Unbekannter Fehler");
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
  };
}
