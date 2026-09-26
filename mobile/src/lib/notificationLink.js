/**
 * Where a notification takes you, in mobile routes.
 *
 * The API returns a semantic `target` ({ kind, id, slug }) rather than a URL,
 * so each client maps it to its own screens. This is the mobile half of that
 * mapping — mirror of web/src/lib/notificationLink.js.
 *
 * The mobile app is a subset of the web app: there is no returns screen, no
 * support inbox, no admin area. Those kinds resolve to null and the row simply
 * marks itself read, which is what "a destination if available" means here.
 */

/**
 * The seller area is one screen with internal tabs rather than separate routes,
 * so a seller-side notification moves the tab instead of pushing a route.
 */
export const SELLER_TABS = {
  'seller-order': 'orders',
  'seller-product': 'products',
  'seller-store': 'store',
  'seller-dashboard': 'overview',
  'seller-verification': 'overview',
  'seller-setup': 'overview',
};

const ROUTES = {
  'buyer-order': ({ id }) => (id ? { pathname: '/orders', params: { id } } : '/orders'),

  product: ({ slug }) => (slug ? `/product/${slug}` : null),
  store: ({ slug }) => (slug ? `/store/${slug}` : null),

  'seller-order': () => '/seller',
  'seller-product': () => '/seller',
  'seller-store': () => '/seller',
  'seller-dashboard': () => '/seller',
  // The app has no verification or setup screen of its own yet.
  'seller-verification': () => '/seller',
  'seller-setup': () => '/seller',
  'seller-application': () => '/seller-apply',
};

/**
 * @param {Object} notification - A notification from the API.
 * @returns {String|Object|null} An expo-router href, or null when the app has
 *   no screen for this kind.
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

/**
 * True when tapping the row should open the notification's own text rather
 * than navigate — announcements and anything the app cannot route to.
 */
export function isReadable(notification) {
  const kind = notification?.target?.kind;
  return kind === 'notification' || kind === 'admin-notification';
}

export default notificationRoute;
