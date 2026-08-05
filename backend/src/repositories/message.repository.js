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

const createMessage = async ({ conversationId, senderId, body, orderId = null }) =>
  prisma.message.create({
    data: { conversationId, senderId, body, orderId },
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

const findBuyerOrdersForStore = async (buyerId, storeId) =>
  prisma.order.findMany({
    where: { buyerId, storeId },
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
};
