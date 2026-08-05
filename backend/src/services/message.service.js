const messageRepository = require('../repositories/message.repository');
const storeRepository = require('../repositories/store.repository');
const { ApiError } = require('../middleware/errorHandler');
const prisma = require('../config/database');

/**
 * Determine which side of a conversation the user is on.
 * Returns 'buyer' | 'seller' or throws 403.
 */
const resolveRole = (conversation, userId) => {
  if (conversation.buyerId === userId) return 'buyer';
  if (conversation.store.ownerId === userId) return 'seller';
  throw new ApiError('You do not have access to this conversation', 403);
};

const shapePinnedOrders = (orders) =>
  (orders || []).map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    total: Number(o.total),
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.deliveryFee),
    createdAt: o.createdAt,
    completedAt: o.completedAt,
    cancelledAt: o.cancelledAt,
    itemCount: (o.items || []).reduce((n, it) => n + it.quantity, 0),
    items: (o.items || []).slice(0, 3).map((it) => ({
      id: it.id,
      productName: it.productName,
      quantity: it.quantity,
      price: Number(it.price),
    })),
  }));

const shapeConversationSummary = async (conversation, viewerId) => {
  const role = resolveRole(conversation, viewerId);
  const lastReadAt =
    role === 'buyer' ? conversation.buyerLastReadAt : conversation.sellerLastReadAt;

  const unreadCount = await messageRepository.countUnreadInConversation(
    conversation.id,
    viewerId,
    lastReadAt,
  );

  // Pull the most recent message for a preview
  const [lastMessage] = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, body: true, senderId: true, createdAt: true, orderId: true },
  });

  return {
    id: conversation.id,
    role,
    buyer: conversation.buyer,
    store: {
      id: conversation.store.id,
      name: conversation.store.name,
      slug: conversation.store.slug,
      logo: conversation.store.logo,
    },
    lastMessageAt: conversation.lastMessageAt,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          body: lastMessage.body,
          senderId: lastMessage.senderId,
          createdAt: lastMessage.createdAt,
          hasOrder: Boolean(lastMessage.orderId),
        }
      : null,
    unreadCount,
  };
};

/**
 * Get all conversations for the current user, both roles combined
 * (a user could be both a buyer and a seller).
 */
const listMyConversations = async (userId) => {
  const buyerConvos = await messageRepository.listConversationsForBuyer(userId);

  let sellerConvos = [];
  const ownStore = await storeRepository.findByOwnerId(userId);
  if (ownStore) {
    sellerConvos = await messageRepository.listConversationsForStore(ownStore.id);
  }

  const combined = [...buyerConvos, ...sellerConvos];
  const seen = new Set();
  const unique = combined.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const summaries = await Promise.all(
    unique.map((c) => shapeConversationSummary(c, userId)),
  );

  summaries.sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tb - ta;
  });

  return summaries;
};

/**
 * Find or create a conversation between the current user (buyer) and a store.
 * Sellers cannot start conversations with their own store; they always reply.
 */
const openConversationWithStore = async (userId, storeId) => {
  const store = await storeRepository.findById(storeId);
  if (!store) {
    throw new ApiError('Store not found', 404);
  }
  if (store.ownerId === userId) {
    throw new ApiError('You cannot start a conversation with your own store', 400);
  }

  let conversation = await messageRepository.findConversationByPair(userId, storeId);
  if (!conversation) {
    conversation = await messageRepository.createConversation(userId, storeId);
  }

  return getConversation(conversation.id, userId);
};

/**
 * Get conversation details, messages, and pinned orders for the viewer.
 */
const getConversation = async (conversationId, userId) => {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError('Conversation not found', 404);
  }

  const role = resolveRole(conversation, userId);
  const messages = await messageRepository.listMessages(conversationId);
  const orders = await messageRepository.findBuyerOrdersForStore(
    conversation.buyerId,
    conversation.storeId,
  );

  return {
    id: conversation.id,
    role,
    buyer: conversation.buyer,
    store: {
      id: conversation.store.id,
      name: conversation.store.name,
      slug: conversation.store.slug,
      logo: conversation.store.logo,
      ownerId: conversation.store.ownerId,
    },
    lastMessageAt: conversation.lastMessageAt,
    buyerLastReadAt: conversation.buyerLastReadAt,
    sellerLastReadAt: conversation.sellerLastReadAt,
    pinnedOrders: shapePinnedOrders(orders),
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      sender: m.sender,
      orderId: m.orderId,
      order: m.order
        ? {
            id: m.order.id,
            orderNumber: m.order.orderNumber,
            status: m.order.status,
            total: Number(m.order.total),
            createdAt: m.order.createdAt,
          }
        : null,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
};

/**
 * Send a message. Optionally attaches an orderId (must belong to this buyer/store pair).
 */
const sendMessage = async (conversationId, userId, { body, orderId }) => {
  const trimmed = (body || '').trim();
  if (!trimmed) {
    throw new ApiError('Message cannot be empty', 400);
  }
  if (trimmed.length > 2000) {
    throw new ApiError('Message is too long (max 2000 characters)', 400);
  }

  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError('Conversation not found', 404);
  }
  resolveRole(conversation, userId);

  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, buyerId: true, storeId: true },
    });
    if (
      !order ||
      order.buyerId !== conversation.buyerId ||
      order.storeId !== conversation.storeId
    ) {
      throw new ApiError('Order does not belong to this conversation', 400);
    }
  }

  const now = new Date();
  const message = await messageRepository.createMessage({
    conversationId,
    senderId: userId,
    body: trimmed,
    orderId: orderId || null,
  });
  await messageRepository.touchConversation(conversationId, now);

  return {
    id: message.id,
    body: message.body,
    senderId: message.senderId,
    sender: message.sender,
    orderId: message.orderId,
    order: message.order
      ? {
          id: message.order.id,
          orderNumber: message.order.orderNumber,
          status: message.order.status,
          total: Number(message.order.total),
          createdAt: message.order.createdAt,
        }
      : null,
    createdAt: message.createdAt,
    readAt: message.readAt,
  };
};

/**
 * Mark this conversation as read for the current viewer.
 */
const markConversationRead = async (conversationId, userId) => {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError('Conversation not found', 404);
  }
  const role = resolveRole(conversation, userId);
  await messageRepository.markRead(conversationId, role, new Date());
  return { success: true };
};

module.exports = {
  listMyConversations,
  openConversationWithStore,
  getConversation,
  sendMessage,
  markConversationRead,
};
