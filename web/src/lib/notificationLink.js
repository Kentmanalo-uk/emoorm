/**
 * Where a notification takes you, in web-app routes.
 *
 * The API returns a semantic `target` ({ kind, id, slug }) rather than a URL,
 * because the same notification has to open `/profile/orders` here and a
 * different screen in the mobile app. This file is the web half of that
 * mapping — the only place that knows a buyer order lives under `/profile`.
 *
 * A kind with nowhere sensible to go returns null, and the caller renders the
 * notification as plain text instead of a link.
 */

const enc = encodeURIComponent;

const ROUTES = {
  // Orders
  'buyer-order': ({ id }) => (id ? `/profile/orders?id=${enc(id)}` : '/profile/orders'),
  'seller-order': ({ id }) => (id ? `/seller/orders?id=${enc(id)}` : '/seller/orders'),
  'admin-order': ({ id }) => (id ? `/admin/orders?id=${enc(id)}` : '/admin/orders'),

  // Products
  'seller-product': ({ id }) => (id ? `/seller/products?id=${enc(id)}` : '/seller/products'),
  'admin-product': ({ id }) => (id ? `/admin/products?id=${enc(id)}` : '/admin/products'),
  product: ({ slug }) => (slug ? `/product/${enc(slug)}` : null),

  // Stores
  store: ({ slug }) => (slug ? `/store/${enc(slug)}` : null),
  'seller-store': () => '/seller/store',
  'seller-dashboard': () => '/seller',

  // Returns
  'buyer-return': ({ id }) => (id ? `/profile/returns/${enc(id)}` : '/profile/returns'),
  'seller-return': ({ id }) => (id ? `/seller/returns?id=${enc(id)}` : '/seller/returns'),
  'admin-return': ({ id }) => (id ? `/admin/returns?id=${enc(id)}` : '/admin/returns'),

  // Moderation
  'admin-report': ({ id }) => (id ? `/admin/reports?id=${enc(id)}` : '/admin/reports'),
  'admin-seller-application': ({ id }) => (id ? `/admin/sellers?id=${enc(id)}` : '/admin/sellers'),
  'seller-application': () => '/seller/apply',

  // Reports the person filed themselves.
  'buyer-reports': ({ id }) => (id ? `/profile/reports?id=${enc(id)}` : '/profile/reports'),

  // Support conversations
  'buyer-support': ({ id }) => (id ? `/profile/support?c=${enc(id)}` : '/profile/support'),
  'seller-support': ({ id }) => (id ? `/seller/support?c=${enc(id)}` : '/seller/support'),
  'admin-support': ({ id }) => (id ? `/admin/support?c=${enc(id)}` : '/admin/support'),

  // Super admin <-> municipal admin threads.
  'admin-messages': ({ id }) => (id ? `/admin/messages?c=${enc(id)}` : '/admin/messages'),

  // Platform feedback, super admin only.
  'admin-feedback': ({ id }) => (id ? `/admin/feedback?id=${enc(id)}` : '/admin/feedback'),

  // Buyer <-> store conversations. Both sides open in the same Messenger,
  // which takes the conversation id as `?c=`.
  'buyer-messages': ({ id }) => (id ? `/profile/messages?c=${enc(id)}` : '/profile/messages'),
  'seller-messages': ({ id }) => (id ? `/seller/messages?c=${enc(id)}` : '/seller/messages'),

  // Account and platform
  'buyer-verification': () => '/profile/verification',
  'seller-verification': () => '/seller/verification',
  'seller-setup': () => '/seller/setup',
  municipality: ({ id }) => (id ? `/municipality/${enc(id)}` : null),
  'admin-dashboard': () => '/admin',

  // Announcements and anything else open in full on their own page.
  notification: ({ id }) => (id ? `/notifications/${enc(id)}` : null),
  // Admins are confined to /admin/*, so theirs is the admin-side page.
  'admin-notification': ({ id }) => (id ? `/admin/notifications/${enc(id)}` : null),
};

/**
 * @param {Object} notification - A notification from the API.
 * @returns {String|null} A router path, or null when there is nowhere to go.
 */
export function notificationHref(notification) {
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

export default notificationHref;
