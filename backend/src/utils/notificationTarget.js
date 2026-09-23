const prisma = require('../config/database');

/**
 * Notification targets
 *
 * A notification's `relatedId` means something different for every type — an
 * order, a product, a return request, a conversation, an applicant — so the
 * mapping lives here once rather than being re-guessed by the web, admin and
 * mobile clients.
 *
 * The resolver returns a *semantic* destination ({ kind, id, slug }), not a
 * URL: the backend has no business knowing that the web app spells the buyer
 * order list `/profile/orders` while the mobile app spells it `/orders`. Each
 * client maps a kind to its own route table.
 *
 * New notifications may carry an explicit target in `data.target` for cases
 * where the type alone is ambiguous (SYSTEM_ANNOUNCEMENT is used both for real
 * announcements and for one-off account notices). Everything else is derived
 * from (type, audience, relatedId), so every row already in the database
 * becomes clickable without a backfill.
 */

const ORDER_TYPES = new Set([
  'ORDER_RECEIVED',
  'ORDER_CONFIRMED',
  'ORDER_READY',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
]);

const RETURN_TYPES = new Set([
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_AWAITING_SHIPMENT',
  'RETURN_RECEIVED',
  'RETURN_REFUNDED',
  'RETURN_CANCELLED',
  'RETURN_CLOSED',
]);

/** Kinds whose id is a database id that has to become a public slug. */
const SLUG_KINDS = { product: 'product', store: 'store' };

/**
 * Every kind a client may receive. Exported so the clients' route maps can be
 * checked against it in tests instead of drifting silently.
 */
const KINDS = [
  'buyer-order', 'seller-order', 'admin-order',
  'seller-product', 'admin-product', 'product',
  'store', 'seller-store', 'seller-dashboard',
  'buyer-return', 'seller-return', 'admin-return',
  'admin-report', 'buyer-reports',
  'buyer-support', 'seller-support', 'admin-support',
  'admin-messages',
  'admin-feedback',
  'buyer-messages', 'seller-messages',
  'admin-seller-application', 'seller-application',
  'buyer-verification', 'municipality', 'admin-dashboard',
  'notification', 'admin-notification',
];

/**
 * Work out where a notification points, without touching the database.
 * @param {Object} notification - A notification row ({ id, type, audience, relatedId, data }).
 * @returns {{kind: String, id: String|null, slug: String|null}|null}
 */
const resolveRef = (notification) => {
  if (!notification) return null;

  // An explicit target always wins — it was chosen by the code that knows
  // exactly what the notification was about.
  const explicit = notification.data && notification.data.target;
  if (explicit && typeof explicit.kind === 'string' && KINDS.includes(explicit.kind)) {
    return {
      kind: explicit.kind,
      id: explicit.id || null,
      slug: explicit.slug || null,
    };
  }

  const { type, audience, relatedId } = notification;
  const id = relatedId || null;
  const isSeller = audience === 'SELLER';
  const isAdmin = audience === 'ADMIN';

  if (ORDER_TYPES.has(type)) {
    if (!id) return null;
    if (isAdmin) return { kind: 'admin-order', id, slug: null };
    return { kind: isSeller ? 'seller-order' : 'buyer-order', id, slug: null };
  }

  if (RETURN_TYPES.has(type)) {
    if (!id) return null;
    if (isAdmin) return { kind: 'admin-return', id, slug: null };
    return { kind: isSeller ? 'seller-return' : 'buyer-return', id, slug: null };
  }

  switch (type) {
    // Moderation outcomes on the seller's own listing.
    case 'PRODUCT_APPROVED':
    case 'PRODUCT_SUSPENDED':
      if (!id) return null;
      return { kind: isAdmin ? 'admin-product' : 'seller-product', id, slug: null };

    // Follower fan-out — send the shopper to the public product page.
    case 'STORE_NEW_PRODUCT':
    case 'STORE_PROMOTION':
      return id ? { kind: 'product', id, slug: null } : null;

    case 'STORE_ANNOUNCEMENT':
      return id ? { kind: 'store', id, slug: null } : null;

    // store.service sends the store id to the seller feed; auth.service's
    // approval notice carries no id, so the seller lands on their dashboard.
    case 'SELLER_APPROVED':
    case 'SELLER_SUSPENDED':
      if (isSeller && id) return { kind: 'seller-store', id, slug: null };
      return { kind: 'seller-dashboard', id: null, slug: null };

    case 'SELLER_APPLICATION_SUBMITTED':
      return isAdmin
        ? { kind: 'admin-seller-application', id, slug: null }
        : { kind: 'seller-application', id: null, slug: null };

    case 'REPORT_SUBMITTED':
    case 'REPORT_RESOLVED':
      // Admins land on the moderation queue; the reporter now has a reports
      // page of their own, so their copy is clickable too.
      if (isAdmin) return id ? { kind: 'admin-report', id, slug: null } : null;
      return { kind: 'buyer-reports', id, slug: null };

    case 'SUPPORT_MESSAGE':
    case 'SUPPORT_RESOLVED':
      if (!id) return null;
      if (isAdmin) return { kind: 'admin-support', id, slug: null };
      return { kind: isSeller ? 'seller-support' : 'buyer-support', id, slug: null };

    // Super admin <-> municipal admin thread. Only admins ever receive one.
    case 'ADMIN_MESSAGE':
      return { kind: 'admin-messages', id, slug: null };

    // Buyer <-> store conversation, one page per side.
    case 'STORE_MESSAGE':
      if (!id) return null;
      return { kind: isSeller ? 'seller-messages' : 'buyer-messages', id, slug: null };

    case 'ADMIN_ALERT':
      return { kind: 'admin-dashboard', id: null, slug: null };

    // Announcements and anything unrecognised open the notification itself, so
    // a long message is readable in full rather than clipped in the list.
    //
    // Admins are confined to /admin/* in the web app, so their copy has to
    // point at the admin-side page or the link would bounce them to the
    // dashboard instead of opening what they clicked.
    case 'SYSTEM_ANNOUNCEMENT':
    default:
      if (!notification.id) return null;
      return { kind: isAdmin ? 'admin-notification' : 'notification', id: notification.id, slug: null };
  }
};

/**
 * Turn the product/store ids in a batch of refs into public slugs.
 * A record that has been deleted or hidden loses its target rather than
 * sending the reader to a 404.
 */
const hydrateSlugs = async (refs) => {
  const productIds = new Set();
  const storeIds = new Set();

  for (const ref of refs) {
    if (!ref || ref.slug || !ref.id) continue;
    if (SLUG_KINDS[ref.kind] === 'product') productIds.add(ref.id);
    if (SLUG_KINDS[ref.kind] === 'store') storeIds.add(ref.id);
  }

  if (productIds.size === 0 && storeIds.size === 0) return;

  const [products, stores] = await Promise.all([
    productIds.size
      ? prisma.product.findMany({
        where: { id: { in: [...productIds] }, deletedAt: null, status: 'APPROVED' },
        select: { id: true, slug: true },
      })
      : [],
    storeIds.size
      ? prisma.store.findMany({
        where: { id: { in: [...storeIds] }, deletedAt: null, isActive: true },
        select: { id: true, slug: true },
      })
      : [],
  ]);

  const productSlugs = new Map(products.map((p) => [p.id, p.slug]));
  const storeSlugs = new Map(stores.map((s) => [s.id, s.slug]));

  for (const ref of refs) {
    if (!ref || ref.slug || !ref.id) continue;
    if (SLUG_KINDS[ref.kind] === 'product') ref.slug = productSlugs.get(ref.id) || null;
    if (SLUG_KINDS[ref.kind] === 'store') ref.slug = storeSlugs.get(ref.id) || null;
  }
};

/**
 * Attach a resolved `target` to each notification in a list.
 * Costs at most two extra indexed lookups for a whole page, and never throws:
 * a notification without a destination is still a perfectly good notification.
 * @param {Array<Object>} notifications
 * @returns {Promise<Array<Object>>} the same rows, each with a `target`
 */
const attachTargets = async (notifications) => {
  const list = Array.isArray(notifications) ? notifications : [];
  if (list.length === 0) return list;

  try {
    const refs = list.map((n) => resolveRef(n));
    await hydrateSlugs(refs);

    return list.map((notification, index) => {
      const ref = refs[index];
      // A slug-backed target whose record has gone is not a destination.
      const usable = ref && (!SLUG_KINDS[ref.kind] || ref.slug);
      return { ...notification, target: usable ? ref : null };
    });
  } catch (err) {
    console.error('[notificationTarget] failed to resolve targets:', err.message);
    return list.map((notification) => ({ ...notification, target: null }));
  }
};

/**
 * Attach a target to a single notification.
 */
const attachTarget = async (notification) => {
  if (!notification) return notification;
  const [withTarget] = await attachTargets([notification]);
  return withTarget;
};

module.exports = { KINDS, resolveRef, attachTarget, attachTargets };
