self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  const title = data.title ?? "Home Organizer";
  const options = {
    body: data.body ?? "",
    icon: data.icon ?? "/logo192.png",
    badge: "/logo192.png",
    tag: data.tag ?? "default",
    renotify: true,
    data: {
      url: data.url ?? "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const zielUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((offeneClients) => {
      const vorhandenesFenster = offeneClients.find((client) =>
        client.url.includes(self.location.origin),
      );

      if (vorhandenesFenster) {
        return vorhandenesFenster.focus().then((client) => client.navigate(zielUrl));
      }

      return clients.openWindow(zielUrl);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const options = event.oldSubscription?.options;
        if (!options) return;
        await self.registration.pushManager.subscribe(options);
      } catch (error) {
        console.warn("[SW] pushsubscriptionchange konnte nicht automatisch erneuert werden:", error);
      }
    })(),
  );
});
