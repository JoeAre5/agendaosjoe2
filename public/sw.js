// Charlie's Barbershop — Web Push service worker
// Handles incoming push messages and notification clicks.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "Charlie's Barbershop", body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || "Charlie's Barbershop";
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/app-icon.png',
    badge: payload.badge || '/favicon.png',
    image: payload.image || undefined,
    data: {
      url: payload.url || '/app/cliente',
      ...(payload.data || {}),
    },
    tag: payload.tag || 'charlies-notification',
    renotify: !!payload.renotify,
    requireInteraction: !!payload.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app/cliente';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if present
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
