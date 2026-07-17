/* Bolingo — service worker Web Push (minimal).
 * Périmètre : évènements `push` + `notificationclick` uniquement. Aucune mise en
 * cache offline. Le payload ne contient JAMAIS de texte de message : seulement
 * un titre, un corps court, une URL cible et un tag (collapse par conversation).
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Bolingo";
  const options = {
    body: data.body || "",
    // Regroupe les notifs d'une même conversation/match côté OS (comme le
    // collapse in-app) : une nouvelle remplace la précédente non consultée.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/notifications" },
    icon: "/icon-192.png",
    badge: "/badge-72.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Un onglet app déjà ouvert : on le focus et on l'amène sur la cible.
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) {
              return client.navigate(targetUrl).then((c) => (c || client).focus());
            }
            return client.focus();
          }
        }
        // Sinon, nouvel onglet.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
