/* E-MOORM service worker.
 *
 * It makes the site installable as an app (browsers offer "Install" only to
 * sites with one) and shows a simple page when a page is opened offline.
 * Nothing else is cached: every page, file and request goes to the network
 * as usual, so a new release is seen right away. */
const CACHE = 'emoorm-offline-v4';
const OFFLINE = '/offline.html';
// The offline page's logo.
const OFFLINE_LOGO = '/icon-192x192.png';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([OFFLINE, OFFLINE_LOGO].map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    // Start fetching a page while the worker wakes up, so it adds no delay.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

// Pages only: from the network, or the offline page when there is none.
self.addEventListener('fetch', (event) => {
  // The offline page's logo, when the network is gone.
  if (new URL(event.request.url).pathname === OFFLINE_LOGO) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE_LOGO)) || Response.error()));
    return;
  }
  if (event.request.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(event.request);
    } catch {
      const offline = await caches.match(OFFLINE);
      return offline || Response.error();
    }
  })());
});
