const messageRepository = require('../repositories/message.repository');
const storeRepository = require('../repositories/store.repository');
const orderRepository = require('../repositories/order.repository');
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

const firstImage = (product) => {
  const imgs = product?.images;
  if (Array.isArray(imgs) && imgs.length > 0) return imgs[0];
  return null;
};

// Human-friendly order name built from its items, e.g. "Calamansi + 2 more".
const orderDisplayName = (items) => {
  const list = items || [];
  if (!list.length) return 'Order';
  const [first, ...rest] = list;
  return rest.length ? `${first.productName} + ${rest.length} more` : first.productName;
};

const shapeMessageProduct = (product) =>
  product
    ? {
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      image: firstImage(product),
    }
    : null;

const shapePinnedOrders = (orders) =>
  (orders || []).map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    name: orderDisplayName(o.items),
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
      image: firstImage(it.product),
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
    select: { id: true, body: true, imageUrl: true, senderId: true, createdAt: true, orderId: true },
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
        body: lastMessage.body || (lastMessage.imageUrl ? 'Photo' : ''),
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
 * A seller opens (or resumes) the conversation with one of their buyers.
 *
 * Only a buyer who has ordered from the store can be contacted this way, so
 * a seller cannot use the marketplace to cold-message arbitrary accounts.
 */
const openConversationWithBuyer = async (sellerUserId, buyerId) => {
  const store = await storeRepository.findByOwnerId(sellerUserId);
  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }
  if (buyerId === sellerUserId) {
    throw new ApiError('You cannot start a conversation with yourself', 400);
  }
  // Any order at all, including completed ones: a seller may well need to
  // follow up on a purchase that finished weeks ago.
  const orders = await orderRepository.findAll({ buyerId, storeId: store.id, page: 1, pageSize: 1 });
  if (!orders.total) {
    throw new ApiError('You can only message buyers who have ordered from your store', 403);
  }

  let conversation = await messageRepository.findConversationByPair(buyerId, store.id);
  if (!conversation) {
    conversation = await messageRepository.createConversation(buyerId, store.id);
  }

  return getConversation(conversation.id, sellerUserId);
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
    serviceRating: conversation.serviceRating,
    serviceRatingAt: conversation.serviceRatingAt,
    pinnedOrders: shapePinnedOrders(orders),
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      imageUrl: m.imageUrl,
      senderId: m.senderId,
      sender: m.sender,
      orderId: m.orderId,
      order: m.order
        ? {
          id: m.order.id,
          orderNumber: m.order.orderNumber,
          name: orderDisplayName(m.order.items),
          status: m.order.status,
          total: Number(m.order.total),
          createdAt: m.order.createdAt,
        }
        : null,
      productId: m.productId,
      product: shapeMessageProduct(m.product),
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
};

/**
 * Send a message. Optionally attaches an orderId (must belong to this buyer/store pair)
 * and/or a productId (must belong to the conversation's store).
 */
const sendMessage = async (conversationId, userId, { body, imageUrl, orderId, productId }) => {
  const trimmed = (body || '').trim();
  const trimmedImageUrl = (imageUrl || '').trim();
  if (!trimmed && !trimmedImageUrl && !orderId && !productId) {
    throw new ApiError('Message, image, order, or product is required', 400);
  }
  if (trimmed.length > 2000) {
    throw new ApiError('Message is too long (max 2000 characters)', 400);
  }
  if (trimmedImageUrl.length > 191) {
    throw new ApiError('Image URL is too long', 400);
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

  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, storeId: true },
    });
    if (!product || product.storeId !== conversation.storeId) {
      throw new ApiError('Product does not belong to this conversation', 400);
    }
  }

  const now = new Date();
  const message = await messageRepository.createMessage({
    conversationId,
    senderId: userId,
    body: trimmed,
    imageUrl: trimmedImageUrl || null,
    orderId: orderId || null,
    productId: productId || null,
  });
  await messageRepository.touchConversation(conversationId, now);

  return {
    id: message.id,
    body: message.body,
    imageUrl: message.imageUrl,
    senderId: message.senderId,
    sender: message.sender,
    orderId: message.orderId,
    order: message.order
      ? {
        id: message.order.id,
        orderNumber: message.order.orderNumber,
        name: orderDisplayName(message.order.items),
        status: message.order.status,
        total: Number(message.order.total),
        createdAt: message.order.createdAt,
      }
      : null,
    productId: message.productId,
    product: shapeMessageProduct(message.product),
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

/**
 * Buyer rates the seller's customer service for this conversation (1-5 stars).
 * Sellers cannot rate their own conversations.
 */
const rateConversationService = async (conversationId, userId, rating) => {
  const numericRating = parseInt(rating, 10);
  if (!numericRating || numericRating < 1 || numericRating > 5) {
    throw new ApiError('Rating must be between 1 and 5', 400);
  }

  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError('Conversation not found', 404);
  }
  const role = resolveRole(conversation, userId);
  if (role !== 'buyer') {
    throw new ApiError('Only the buyer can rate this conversation', 403);
  }

  const updated = await messageRepository.rateService(conversationId, numericRating, new Date());
  return { serviceRating: updated.serviceRating, serviceRatingAt: updated.serviceRatingAt };
};

module.exports = {
  listMyConversations,
  openConversationWithStore,
  openConversationWithBuyer,
  getConversation,
  sendMessage,
  markConversationRead,
  rateConversationService,
};
