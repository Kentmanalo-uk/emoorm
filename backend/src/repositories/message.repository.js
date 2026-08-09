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

const listConversationsForBuyer = async (buyerId) =>
  prisma.conversation.findMany({
    where: { buyerId },
    include: conversationInclude,
    orderBy: [
      { lastMessageAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });

const listConversationsForStore = async (storeId) =>
  prisma.conversation.findMany({
    where: { storeId },
    include: conversationInclude,
    orderBy: [
      { lastMessageAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });

const listMessages = async (conversationId, { take = 100 } = {}) =>
  prisma.message.findMany({
    where: { conversationId },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
    take,
  });

const createMessage = async ({ conversationId, senderId, body, imageUrl = null, orderId = null }) =>
  prisma.message.create({
    data: { conversationId, senderId, body, imageUrl, orderId },
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
  findBuyerOrdersForStore,
  rateService,
};
