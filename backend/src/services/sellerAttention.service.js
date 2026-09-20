const prisma = require('../config/database');

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
    ];
  }

  const [orders, returns, conversations, support, lowStock] = await Promise.all([
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
        stock: { lte: prisma.product.fields.lowStockThreshold },
      },
      select: { updatedAt: true },
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
