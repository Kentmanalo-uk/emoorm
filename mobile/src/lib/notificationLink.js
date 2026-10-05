/**
 * Where a notification takes you, in the app's routes.
 *
 * The API returns a semantic `target` ({ kind, id, slug }) rather than a URL,
 * so each client maps it to its own screens. This is the app's half of that
 * mapping, a mirror of web/src/lib/notificationLink.js on the app's paths
 * (mobile/PORTING.md: /profile/orders is /orders here, /profile/messages?c=
 * is /conversation/:id, /notifications/:id is /notification/:id).
 *
 * The app has no admin area, so admin kinds resolve to null and the row is
 * only marked read.
 */

/**
 * Seller-side kinds and the Seller Center tab each one belongs to (used by
 * the seller's notification list to move its tab).
 */
export const SELLER_TABS = {
  'seller-order': 'orders',
  'seller-product': 'products',
  'seller-store': 'store',
  'seller-dashboard': 'overview',
  'seller-verification': 'overview',
  'seller-setup': 'overview',
};

const withId = (pathname, id, key = 'id') => (id ? { pathname, params: { [key]: id } } : pathname);

const ROUTES = {
  // Orders
  'buyer-order': ({ id }) => withId('/orders', id),
  'seller-order': ({ id }) => withId('/seller/orders', id),

  // Products
  'seller-product': ({ id }) => withId('/seller/products', id),
  product: ({ slug }) => (slug ? `/product/${slug}` : null),
  'seller-questions': ({ id }) => withId('/seller/questions', id),

  // Stores
  store: ({ slug }) => (slug ? `/store/${slug}` : null),
  'seller-store': () => '/seller/store',
  'seller-dashboard': () => '/seller',

  // Returns
  'buyer-return': ({ id }) => (id ? `/returns/${id}` : '/returns'),
  'seller-return': ({ id }) => withId('/seller/returns', id),

  // Moderation
  'seller-application': () => '/seller-apply',
  'buyer-reports': ({ id }) => withId('/reports', id),

  // Support conversations
  'buyer-support': ({ id }) => withId('/support', id, 'c'),
  'seller-support': ({ id }) => withId('/seller/support', id, 'c'),

  // Buyer <-> store conversations: the chat itself.
  'buyer-messages': ({ id }) => (id ? `/conversation/${id}` : '/messages'),
  'seller-messages': ({ id }) => (id ? `/conversation/${id}` : '/seller/messages'),

  // Account and platform
  'buyer-verification': () => '/verification',
  'seller-verification': () => '/seller/verification',
  'seller-setup': () => '/seller',
  municipality: ({ id }) => (id ? `/municipality/${id}` : null),

  // Announcements and anything else open in full on their own page.
  notification: ({ id }) => (id ? `/notification/${id}` : null),
};

/**
 * @param {Object} notification - A notification from the API.
 * @returns {String|Object|null} An expo-router href, or null when there is
 *   nowhere to go.
 */
export function notificationRoute(notification) {
  const target = notification?.target;
  if (!target || typeof target.kind !== 'string') return null;

  const build = ROUTES[target.kind];
  if (!build) return null;

  try {
    return build(target) || null;
  } catch {
    return null;
  }
}

/** The website's own name for this mapping. */
export const notificationHref = notificationRoute;

/**
 * True when the notification is its own destination (an announcement): it
 * opens on /notification/:id.
 */
export function isReadable(notification) {
  const kind = notification?.target?.kind;
  return kind === 'notification' || kind === 'admin-notification';
}

/*
 * A website path (as the API or Ate Moormy's answers give them) on the app's
 * routes: /profile/orders → /orders, /help → /help-center and so on. Paths
 * the app shares with the website pass through unchanged.
 */
const WEB_PATHS = [
  [/^\/profile\/?$/, () => '/profile'],
  [/^\/profile\/messages\/?$/, () => '/messages'],
  [/^\/profile\/notifications\/?$/, () => '/notifications'],
  [/^\/profile\/(orders|returns|addresses|wishlist|followed-stores|reviews|settings|verification|support|reports)(\/.*)?$/, (m) => `/${m[1]}${m[2] || ''}`],
  [/^\/notifications\/(.+)$/, (m) => `/notification/${m[1]}`],
  [/^\/orders\/([^/]+)\/receipt\/?$/, (m) => `/receipt/${m[1]}`],
  [/^\/help\/?$/, () => '/help-center'],
  [/^\/seller\/apply\/?$/, () => '/seller-apply'],
];

export function appPath(webPath) {
  if (!webPath || typeof webPath !== 'string') return null;
  if (/^https?:\/\//.test(webPath)) return null;
  const [path, query = ''] = webPath.split('?');
  let out = path;
  for (const [re, to] of WEB_PATHS) {
    const m = path.match(re);
    if (m) { out = to(m); break; }
  }
  const c = new URLSearchParams(query).get('c');
  if (out === '/messages' && c) return `/conversation/${c}`;
  return query ? `${out}?${query}` : out;
}

export default notificationRoute;
