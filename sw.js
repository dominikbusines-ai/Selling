const OFFLINE_CACHE = 'verkaufsliste-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('verkaufsliste-offline-') && key !== OFFLINE_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Only the neutral offline page is cached. Product data, authentication,
// photos and API calls continue to use their existing network behavior.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      return await fetch(event.request, { cache: 'no-cache' });
    } catch {
      const cache = await caches.open(OFFLINE_CACHE);
      return await cache.match(OFFLINE_URL) || new Response('Keine Internetverbindung. Bitte erneut öffnen.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
