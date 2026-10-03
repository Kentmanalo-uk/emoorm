/* E-MOORM service worker.
 *
 * It makes the site installable as an app, and lets people keep browsing
 * what they have already seen when the signal drops:
 *
 *  - pages: from the network; the app's page itself is kept, so the app
 *    still opens offline (it then shows what it saved: lists, product pages);
 *  - the app's built files (/assets/…, named by their content): kept once
 *    fetched, since a new release has new names;
 *  - photos: kept, up to a few hundred, refreshed in the background;
 *  - the public catalogue (products, categories, shops, questions): from
 *    the network, or the last answer when offline.
 *
 * Nothing personal is kept here (orders, messages, the account): those always
 * go to the network. When no copy exists, the offline page is shown. */
const VERSION = 'v5';
const SHELL = `emoorm-shell-${VERSION}`;
const STATIC = `emoorm-static-${VERSION}`;
const IMAGES = `emoorm-images-${VERSION}`;
const DATA = `emoorm-data-${VERSION}`;
const KEEP = [SHELL, STATIC, IMAGES, DATA];
const OFFLINE = '/offline.html';
// The offline page's logo.
const OFFLINE_LOGO = '/icon-192x192.png';
const APP_PAGE = '/index.html';
const MAX_IMAGES = 300;
const MAX_DATA = 200;

// Public, the same for everyone: safe to keep and show offline.
const PUBLIC_DATA = [
  /^\/api\/products(\/|\?|$)/,
  /^\/api\/categories(\/|\?|$)/,
  /^\/api\/municipalities(\/|\?|$)/,
  /^\/api\/banners(\/|\?|$)/,
  /^\/api\/stores(\/|\?|$)/,
  /^\/api\/questions\/product\//,
  /^\/api\/vouchers\/store\//,
];
const PRIVATE_DATA = /^\/api\/(products\/my|stores\/my)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll([OFFLINE, OFFLINE_LOGO].map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key)));
    // Start fetching a page while the worker wakes up, so it adds no delay.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

// Keep a cache to its newest `max` entries.
const trim = async (name, max) => {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
};

const put = async (name, request, response, max) => {
  if (!response || !response.ok || response.type === 'opaque') return;
  const cache = await caches.open(name);
  await cache.put(request, response);
  if (max) await trim(name, max);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // Pages: the network; offline, the kept app page (the app shows what it saved).
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        const response = preloaded || await fetch(request);
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
          event.waitUntil(put(SHELL, APP_PAGE, response.clone()));
        }
        return response;
      } catch {
        return (await caches.match(APP_PAGE)) || (await caches.match(OFFLINE)) || Response.error();
      }
    })());
    return;
  }

  // The offline page's logo.
  if (path === OFFLINE_LOGO) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_LOGO)) || Response.error()));
    return;
  }

  // Built files: named by content, so a kept copy is always right.
  if (path.startsWith('/assets/')) {
    event.respondWith((async () => {
      const kept = await caches.match(request);
      if (kept) return kept;
      const response = await fetch(request);
      event.waitUntil(put(STATIC, request, response.clone()));
      return response;
    })());
    return;
  }

  // Photos: the kept copy at once, refreshed in the background.
  if (path.startsWith('/uploads/') || /\.(png|jpe?g|webp|svg)$/.test(path)) {
    event.respondWith((async () => {
      const kept = await caches.match(request);
      const fresh = fetch(request)
        .then((response) => { event.waitUntil(put(IMAGES, request, response.clone(), MAX_IMAGES)); return response; })
        .catch(() => kept || Response.error());
      return kept || fresh;
    })());
    return;
  }

  // The public catalogue: the network, or the last answer when offline.
  if (PUBLIC_DATA.some((re) => re.test(path + url.search)) && !PRIVATE_DATA.test(path)) {
    const key = new Request(url.href);
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        event.waitUntil(put(DATA, key, response.clone(), MAX_DATA));
        return response;
      } catch (err) {
        const kept = await caches.match(key);
        if (kept) return kept;
        throw err;
      }
    })());
  }
});

// Push notifications (the person turned them on in Account Settings).
self.addEventListener('push', (event) => {
  let data;
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Emoorm', {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: data.tag,
    data: { url: data.url || '/notifications' },
  }));
});

// Tapping it opens the notification in a tab already open, or a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find((t) => t.url.startsWith(self.location.origin));
    if (tab) {
      await tab.focus();
      return tab.navigate(url);
    }
    return self.clients.openWindow(url);
  })());
});
