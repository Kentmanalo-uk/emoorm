const prisma = require('../config/database');
const { stageWhere } = require('../utils/orderStages');

/**
 * Seller Attention Service
 *
 * The seller's side of `/moderation/attention`: what is waiting on them right
 * now, counted once on the server so the Seller Center sidebar can badge its
 * navigation from a single request instead of four.
 *
 * The shape matches the admin queue exactly — { key, label, link, count,
 * oldestAt, severity } — so both shells render badges with the same component.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_WINDOW_DAYS = 30;

// The newer queues, in order: [key, label, link]. Each link is its own (the
// orders ones open a filtered Orders tab), so a badge keyed by link never
// adds two queues together.
const STORE_EXTRA = [
  ['paymentsToCheck', 'Payments to check', '/seller/orders?status=payment'],
  ['ordersToPack', 'Orders to pack', '/seller/orders?status=to_ship'],
  ['unansweredQuestions', 'Buyer questions to answer', '/seller/questions'],
  ['unrepliedReviews', 'New reviews to reply to', '/seller/reviews'],
];

const oldestOf = (rows, field) => {
  const times = rows.map((row) => row[field]).filter(Boolean).map((value) => new Date(value).getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
};

/**
 * @param {Object} actor - req.user (a SELLER)
 * @returns {Promise<Array>} one entry per queue, including the empty ones so
 *   the caller can clear a badge without special-casing a missing key
 */
const getSellerAttention = async (actor) => {
  const store = await prisma.store.findFirst({
    where: { ownerId: actor.id, deletedAt: null },
    select: { id: true },
  });

  const empty = (key, label, link) => ({ key, label, link, count: 0, oldestAt: null, severity: 'none' });

  // A seller without a store yet still has an admin inbox, so only the
  // store-bound queues are skipped.
  if (!store) {
    const supportOnly = await prisma.supportConversation.findMany({
      where: {
        userId: actor.id,
        lastMessageAt: { not: null },
        OR: [
          { userLastReadAt: null },
          { lastMessageAt: { gt: prisma.supportConversation.fields.userLastReadAt } },
        ],
      },
      select: { lastMessageAt: true },
    });
    return [
      empty('pendingOrders', 'New orders to confirm', '/seller/orders'),
      empty('openReturns', 'Return requests to review', '/seller/returns'),
      empty('unreadMessages', 'Unread buyer messages', '/seller/messages'),
      {
        key: 'adminMessages',
        label: 'Unread messages from your municipal admin',
        link: '/seller/support',
        count: supportOnly.length,
        oldestAt: oldestOf(supportOnly, 'lastMessageAt'),
        severity: supportOnly.length ? 'low' : 'none',
      },
      empty('lowStock', 'Products running low on stock', '/seller/products'),
      empty('priceOffers', 'Price offers to answer', '/seller/offers'),
      ...STORE_EXTRA.map(([key, label, link]) => empty(key, label, link)),
    ];
  }

  const [orders, returns, conversations, support, lowStock, offers, payments, toPack, questions, reviews] = await Promise.all([
    prisma.order.findMany({
      where: { storeId: store.id, status: 'PENDING' },
      select: { createdAt: true },
    }),
    prisma.returnRequest.findMany({
      where: { storeId: store.id, status: 'REQUESTED' },
      select: { createdAt: true },
    }),
    // "Unread" is a column comparison, so it uses a Prisma field reference
    // rather than pulling every conversation back to compare in JavaScript.
    prisma.conversation.findMany({
      where: {
        storeId: store.id,
        lastMessageAt: { not: null },
        OR: [
          { sellerLastReadAt: null },
          { lastMessageAt: { gt: prisma.conversation.fields.sellerLastReadAt } },
        ],
      },
      select: { lastMessageAt: true },
    }),
    prisma.supportConversation.findMany({
      where: {
        userId: actor.id,
        lastMessageAt: { not: null },
        OR: [
          { userLastReadAt: null },
          { lastMessageAt: { gt: prisma.supportConversation.fields.userLastReadAt } },
        ],
      },
      select: { lastMessageAt: true },
    }),
    prisma.product.findMany({
      where: {
        storeId: store.id,
        deletedAt: null,
        status: 'APPROVED',
        // Available Today and cooked-to-order food keep no stock to top up.
        listingKind: 'REGULAR',
        productType: { not: 'COOK_TO_ORDER' },
        stock: { lte: prisma.product.fields.lowStockThreshold },
      },
      select: { updatedAt: true },
    }),
    // Livestock offers waiting for the seller's answer (7 days each).
    prisma.priceOffer.findMany({
      where: { storeId: store.id, status: 'PENDING', respondBy: { gt: new Date() } },
      select: { createdAt: true },
    }),
    // A buyer says they paid (GCash, QR, bank): the shop checks the proof.
    // Since the proof came in, i.e. the order's last change.
    prisma.order.findMany({
      where: { storeId: store.id, paymentStatus: 'PENDING_VERIFICATION', status: { not: 'CANCELLED' } },
      select: { updatedAt: true },
    }),
    // Confirmed and paid (or cash on delivery): to pack and hand over. The
    // same orders as the Orders page's "To pack" stage.
    prisma.order.findMany({
      where: { storeId: store.id, AND: [stageWhere('to_ship')] },
      select: { updatedAt: true },
    }),
    // Buyers' questions on product pages with no answer yet.
    prisma.productQuestion.findMany({
      where: { storeId: store.id, answer: null, isHidden: false },
      select: { createdAt: true },
    }),
    // Reviews of the last 30 days the shop hasn't replied to: older ones
    // are history, not a to-do, and would keep the badge up for good.
    prisma.review.findMany({
      where: {
        deletedAt: null,
        sellerReply: null,
        product: { storeId: store.id },
        createdAt: { gte: new Date(Date.now() - REVIEW_WINDOW_DAYS * DAY_MS) },
      },
      select: { createdAt: true },
    }),
  ]);

  const items = [
    { key: 'pendingOrders', label: 'New orders to confirm', rows: orders, field: 'createdAt', link: '/seller/orders' },
    { key: 'openReturns', label: 'Return requests to review', rows: returns, field: 'createdAt', link: '/seller/returns' },
    { key: 'unreadMessages', label: 'Unread buyer messages', rows: conversations, field: 'lastMessageAt', link: '/seller/messages' },
    { key: 'adminMessages', label: 'Unread messages from your municipal admin', rows: support, field: 'lastMessageAt', link: '/seller/support' },
    // Stock is a standing condition rather than something that queued up, so
    // it never escalates with age the way an unanswered order does.
    { key: 'lowStock', label: 'Products running low on stock', rows: lowStock, field: null, link: '/seller/products' },
    { key: 'priceOffers', label: 'Price offers to answer', rows: offers, field: 'createdAt', link: '/seller/offers' },
    { key: 'paymentsToCheck', label: STORE_EXTRA[0][1], rows: payments, field: 'updatedAt', link: STORE_EXTRA[0][2] },
    { key: 'ordersToPack', label: STORE_EXTRA[1][1], rows: toPack, field: 'updatedAt', link: STORE_EXTRA[1][2] },
    { key: 'unansweredQuestions', label: STORE_EXTRA[2][1], rows: questions, field: 'createdAt', link: STORE_EXTRA[2][2] },
    { key: 'unrepliedReviews', label: STORE_EXTRA[3][1], rows: reviews, field: 'createdAt', link: STORE_EXTRA[3][2] },
  ];

  return items.map(({ rows, field, ...item }) => {
    const oldestAt = field ? oldestOf(rows, field) : null;
    const ageDays = oldestAt ? (Date.now() - new Date(oldestAt).getTime()) / DAY_MS : 0;
    return {
      ...item,
      count: rows.length,
      oldestAt,
      severity: rows.length === 0
        ? 'none'
        : ageDays >= 3 ? 'high' : ageDays >= 1 ? 'medium' : 'low',
    };
  });
};

module.exports = { getSellerAttention };
