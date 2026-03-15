/* ───────────────────────────────────────────────────────────────
   Service Worker – Web Push Notifications
   Läuft im Hintergrund, auch wenn die App geschlossen ist.
   ─────────────────────────────────────────────────────────────── */

// Push-Event: Benachrichtigung anzeigen
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  const title   = data.title ?? "Umzugsplaner";
  const options = {
    body:    data.body   ?? "",
    icon:    data.icon   ?? "/logo192.png",
    badge:   "/logo192.png",
    tag:     data.tag    ?? "default",
    renotify: true,
    data: {
      url: data.url ?? "/",
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification-Klick: App öffnen / fokussieren und zur URL navigieren
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const zielUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((offeneClients) => {
        // Bereits offenes Fenster finden und fokussieren
        const vorhandenFenster = offeneClients.find((c) =>
          c.url.includes(self.location.origin)
        );
        if (vorhandenFenster) {
          return vorhandenFenster.focus().then((c) => c.navigate(zielUrl));
        }
        // Kein offenes Fenster → neues öffnen
        return clients.openWindow(zielUrl);
      })
  );
});

// Subscription abgelaufen → automatisch erneuern
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then((newSub) => {
        // Neue Subscription wird beim nächsten App-Öffnen automatisch gespeichert
        return fetch("/api/push-resubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: newSub }),
        }).catch(() => {
          // Kein Fehler werfen – wird beim nächsten Login erneuert
        });
      })
  );
});
