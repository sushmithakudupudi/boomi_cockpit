// Service worker for BoomiOps failure alerts. It shows push messages even when the app tab is closed.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'BoomiOps alert', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'BoomiOps alert', {
      body: data.body || '',
      tag: data.tag || 'boomi-failure', // same tag replaces the previous alert instead of stacking
      icon: '/favicon.svg',
      data: { url: data.url || '/?openCompanion=1' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/?openCompanion=1';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          // An open tab opens the bell/Companion itself; no reload needed
          client.postMessage({ type: 'open-companion' });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
