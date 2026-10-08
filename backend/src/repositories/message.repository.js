const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

const conversationInclude = {
  buyer: {
    select: { id: true, fullName: true, profilePhoto: true },
  },
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      ownerId: true,
    },
  },
};

const messageInclude = {
  sender: {
    select: { id: true, fullName: true, profilePhoto: true, role: true },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      createdAt: true,
      items: { select: { productName: true } },
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      images: true,
    },
  },
};

const findConversationById = async (id) =>
  prisma.conversation.findUnique({
    where: { id },
    include: conversationInclude,
  });

const findConversationByPair = async (buyerId, storeId) =>
  prisma.conversation.findUnique({
    where: { buyerId_storeId: { buyerId, storeId } },
    include: conversationInclude,
  });

const createConversation = async (buyerId, storeId) =>
  prisma.conversation.create({
    data: { buyerId, storeId },
    include: conversationInclude,
  });

// The chat list shows the most recently active conversations; a shop with
// thousands of past chats should not load (and count) every one of them.
const CONVERSATION_LIST_LIMIT = 100;

const listConversationsForBuyer = async (buyerId) =>
  prisma.conversation.findMany({
    where: { buyerId },
    include: conversationInclude,
    orderBy: [
      { lastMessageAt: 'desc' },
      { createdAt: 'desc' },
    ],
    take: CONVERSATION_LIST_LIMIT,
  });

const listConversationsForStore = async (storeId) =>
  prisma.conversation.findMany({
    where: { storeId },
    include: conversationInclude,
    orderBy: [
      { lastMessageAt: 'desc' },
      { createdAt: 'desc' },
    ],
    take: CONVERSATION_LIST_LIMIT,
  });

/**
 * Unread messages in each of these conversations, in one query: a Map of
 * conversation id to count. Each item gives the conversation, the viewer's
 * last read moment there (null: nothing read yet), and the viewer, whose own
 * messages never count.
 */
const countUnreadByConversation = async (viewerId, items) => {
  const counts = new Map();
  if (items.length === 0) return counts;
  const rows = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      senderId: { not: viewerId },
      OR: items.map(({ conversationId, since }) => ({
        conversationId,
        ...(since ? { createdAt: { gt: since } } : {}),
      })),
    },
    _count: { _all: true },
  });
  for (const row of rows) counts.set(row.conversationId, row._count._all);
  return counts;
};

/**
 * The newest message of each of these conversations, in one query: a Map of
 * conversation id to message. Prisma's `distinct` would load every message of
 * every listed chat and pick in Node, so this asks MySQL for the newest moment
 * per chat and joins back on the (conversation, created) index.
 */
const latestMessages = async (ids) => {
  const byConversation = new Map();
  if (ids.length === 0) return byConversation;
  const rows = await prisma.$queryRaw`
    SELECT m.id, m.body, m.image_url AS imageUrl, m.sender_id AS senderId, m.created_at AS createdAt,
      m.order_id AS orderId, m.product_id AS productId, m.conversation_id AS conversationId
    FROM messages m
    JOIN (
      SELECT conversation_id, MAX(created_at) AS newest
      FROM messages
      WHERE conversation_id IN (${Prisma.join(ids)})
      GROUP BY conversation_id
    ) t ON t.conversation_id = m.conversation_id AND t.newest = m.created_at
    ORDER BY m.id DESC`;
  for (const { conversationId, ...message } of rows) {
    // Two messages in the same millisecond: either is the newest; keep one.
    if (!byConversation.has(conversationId)) byConversation.set(conversationId, message);
  }
  return byConversation;
};

/**
 * The newest `take` messages of a conversation (or those before `before`),
 * oldest first, and whether there are earlier ones.
 */
const listMessages = async (conversationId, { take = 100, before = null } = {}) => {
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
  });
  const hasEarlier = rows.length > take;
  return { messages: rows.slice(0, take).reverse(), hasEarlier };
};

const createMessage = async ({ conversationId, senderId, body, imageUrl = null, orderId = null, productId = null }) =>
  prisma.message.create({
    data: { conversationId, senderId, body, imageUrl, orderId, productId },
    include: messageInclude,
  });

const touchConversation = async (conversationId, at) =>
  prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: at },
  });

const markRead = async (conversationId, role, at) => {
  const data =
    role === 'buyer'
      ? { buyerLastReadAt: at }
      : { sellerLastReadAt: at };
  return prisma.conversation.update({
    where: { id: conversationId },
    data,
  });
};

const countUnreadInConversation = async (conversationId, senderIdNot, since) =>
  prisma.message.count({
    where: {
      conversationId,
      senderId: { not: senderIdNot },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });

const rateService = async (conversationId, rating, at) =>
  prisma.conversation.update({
    where: { id: conversationId },
    data: { serviceRating: rating, serviceRatingAt: at },
  });

const FINISHED_ORDER_STATUSES = ['DELIVERED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

const findBuyerOrdersForStore = async (buyerId, storeId) =>
  prisma.order.findMany({
    where: { buyerId, storeId, status: { notIn: FINISHED_ORDER_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      subtotal: true,
      deliveryFee: true,
      createdAt: true,
      completedAt: true,
      cancelledAt: true,
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          price: true,
          product: {
            select: { images: true },
          },
        },
      },
    },
  });

module.exports = {
  findConversationById,
  findConversationByPair,
  createConversation,
  listConversationsForBuyer,
  listConversationsForStore,
  listMessages,
  createMessage,
  touchConversation,
  markRead,
  countUnreadInConversation,
  countUnreadByConversation,
  latestMessages,
  findBuyerOrdersForStore,
  rateService,
};
