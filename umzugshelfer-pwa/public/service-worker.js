self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? "" };
  }

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
  const rawUrl = event.notification.data?.url ?? "/";
  const targetUrl = new URL(rawUrl, self.location.origin);
  const zielUrl = targetUrl.origin === self.location.origin ? targetUrl.href : self.location.origin;

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
        const openClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
        openClients.forEach((client) => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
      } catch (error) {
        console.warn("[SW] pushsubscriptionchange konnte nicht automatisch erneuert werden:", error);
      }
    })(),
  );
});
