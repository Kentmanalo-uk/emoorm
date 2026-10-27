const messageRepository = require('../repositories/message.repository');
const storeRepository = require('../repositories/store.repository');
const orderRepository = require('../repositories/order.repository');
const notificationService = require('./notification.service');
const priceOfferService = require('./priceOffer.service');
const { ApiError } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const config = require('../config/env');

const UPLOAD_FILE = /^\/uploads\/[A-Za-z0-9._-]+$/;
const privateMedia = require('../lib/privateMedia');

// A photo uploaded here: a private one (POST /upload/private-image, the
// default for chat photos now), or a public /uploads one (older app versions).
const isOwnUpload = (url) =>
  privateMedia.isPrivateRef(url)
  || UPLOAD_FILE.test(url)
  || (Boolean(config.cdn?.url) && url.startsWith(`${config.cdn.url}/uploads/`) && UPLOAD_FILE.test(url.slice(config.cdn.url.length)));

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
    fulfillmentMethod: o.fulfillmentMethod,
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

// How long after sending a message its sender can still unsend it.
const UNSEND_WINDOW_MS = 5 * 60 * 60 * 1000;

// The line the "New message" notification shows for a message.
const notificationPreview = (body, imageUrl) => {
  const text = body || (imageUrl ? 'Sent a photo' : 'Shared an item');
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/** One message as the chat shows it. */
const shapeMessage = (m) => ({
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
      fulfillmentMethod: m.order.fulfillmentMethod,
      total: Number(m.order.total),
      createdAt: m.order.createdAt,
    }
    : null,
  productId: m.productId,
  product: shapeMessageProduct(m.product),
  offerId: m.offerId ?? null,
  offerEvent: m.offerEvent ?? null,
  createdAt: m.createdAt,
  readAt: m.readAt,
});

// The viewer's last read moment in a conversation, on whichever side they are.
const lastReadFor = (conversation, viewerId) => (
  resolveRole(conversation, viewerId) === 'buyer' ? conversation.buyerLastReadAt : conversation.sellerLastReadAt
);

/**
 * One row of the chat list. The unread count and the newest message (for the
 * preview) are worked out for the whole list beforehand, in one query each.
 */
const shapeConversationSummary = (conversation, viewerId, { unreadCount = 0, lastMessage = null } = {}) => {
  const role = resolveRole(conversation, viewerId);

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
        body: lastMessage.body
          || (lastMessage.imageUrl ? 'Photo' : lastMessage.productId ? 'Product' : lastMessage.orderId ? 'Order' : ''),
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

  // Two queries for the whole list, not two per conversation.
  const [unreadCounts, lastMessages] = await Promise.all([
    messageRepository.countUnreadByConversation(
      userId,
      unique.map((c) => ({ conversationId: c.id, since: lastReadFor(c, userId) })),
    ),
    messageRepository.latestMessages(unique.map((c) => c.id)),
  ]);
  const summaries = unique.map((c) => shapeConversationSummary(c, userId, {
    unreadCount: unreadCounts.get(c.id) || 0,
    lastMessage: lastMessages.get(c.id) || null,
  }));

  summaries.sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tb - ta;
  });

  return summaries;
};

/**
 * The one conversation between a buyer and a store, made the first time.
 * Opened from both sides at the same moment, one insert wins the unique
 * (buyer, store) pair and the other reads it back.
 */
const findOrCreateConversation = async (buyerId, storeId) => {
  const found = await messageRepository.findConversationByPair(buyerId, storeId);
  if (found) return found;
  try {
    return await messageRepository.createConversation(buyerId, storeId);
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    return messageRepository.findConversationByPair(buyerId, storeId);
  }
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

  const conversation = await findOrCreateConversation(userId, storeId);
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

  const conversation = await findOrCreateConversation(buyerId, store.id);
  return getConversation(conversation.id, sellerUserId);
};

/**
 * Get conversation details, messages, and pinned orders for the viewer.
 */
const getConversation = async (conversationId, userId, { before = null } = {}) => {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError('Conversation not found', 404);
  }

  const role = resolveRole(conversation, userId);
  const { messages, hasEarlier } = await messageRepository.listMessages(conversationId, { before });
  const [orders, deals] = await Promise.all([
    messageRepository.findBuyerOrdersForStore(conversation.buyerId, conversation.storeId),
    // Livestock deals between them: each shows as a card in the chat.
    priceOfferService.forConversation(conversation.buyerId, conversation.storeId, role === 'buyer' ? 'BUYER' : 'SELLER'),
  ]);

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
    deals,
    // The newest messages; earlier ones come a page at a time (?before=).
    hasEarlier,
    messages: messages.map(shapeMessage),
  };
};

/**
 * Send a message. Optionally attaches an orderId (must belong to this buyer/store pair)
 * and/or a productId (must belong to the conversation's store).
 */
const sendMessage = async (conversationId, userId, { body, imageUrl, orderId, productId }) => {
  const trimmed = (body || '').trim();
  const trimmedImageUrl = privateMedia.normalize((imageUrl || '').trim());
  if (!trimmed && !trimmedImageUrl && !orderId && !productId) {
    throw new ApiError('Message, image, order, or product is required', 400);
  }
  if (trimmed.length > 2000) {
    throw new ApiError('Message is too long (max 2000 characters)', 400);
  }
  if (trimmedImageUrl.length > 191) {
    throw new ApiError('Image URL is too long', 400);
  }
  // Only images uploaded to this site (POST /upload/image returns
  // /uploads/<file>, or the CDN copy of it): no links to other sites.
  if (trimmedImageUrl && !isOwnUpload(trimmedImageUrl)) {
    throw new ApiError('Images must be uploaded through E-MOORM', 400);
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

  // Buyer <-> store messages used to emit nothing at all, so the only way to
  // learn you had been written to was to open the thread. Non-blocking: a
  // failed notification must never lose the message that was already stored.
  try {
    const side = resolveRole(conversation, userId);
    const recipientId = side === 'buyer' ? conversation.store.ownerId : conversation.buyerId;
    if (recipientId && recipientId !== userId) {
      const senderName = side === 'buyer'
        ? (conversation.buyer?.fullName || 'A customer')
        : (conversation.store?.name || 'A store');
      await notificationService.createNotification({
        userId: recipientId,
        type: 'STORE_MESSAGE',
        title: `New message from ${senderName}`,
        message: notificationPreview(trimmed, trimmedImageUrl),
        relatedId: conversationId,
        // The recipient reads it in the feed for the role they hold in this
        // conversation: the seller in their dashboard, the buyer in the bell.
        audience: side === 'buyer' ? 'SELLER' : 'BUYER',
        // The pop-up shows who wrote: the buyer's photo or the shop's logo.
        sender: {
          name: senderName,
          photo: side === 'buyer' ? conversation.buyer?.profilePhoto : conversation.store?.logo,
        },
      });
    }
  } catch (err) {
    console.error('[sendMessage] notification failed:', err.message);
  }

  return shapeMessage(message);
};

/**
 * Unsend: the sender takes a message back within UNSEND_WINDOW_MS of sending
 * it. It is gone from the chat for both sides with nothing in its place, and
 * so is the "New message" notification that quoted it. The message itself
 * (and its photo) is kept, hidden, for UNSENT_KEEP_DAYS, so a report about
 * the chat can still be checked (moderation shows it, marked unsent), then
 * erased by purgeUnsent. A step of a livestock deal stays (the deal's record
 * depends on it).
 */
const unsendMessage = async (conversationId, messageId, userId) => {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new ApiError('Conversation not found', 404);
  }
  resolveRole(conversation, userId);

  const message = await messageRepository.findMessageById(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw new ApiError('Message not found', 404);
  }
  if (message.senderId !== userId) {
    throw new ApiError('You can only unsend your own messages', 403);
  }
  if (message.offerId) {
    throw new ApiError('Offer updates cannot be unsent', 400);
  }
  if (message.unsentAt) {
    throw new ApiError('Message not found', 404);
  }
  if (Date.now() - new Date(message.createdAt) > UNSEND_WINDOW_MS) {
    throw new ApiError('A message can only be unsent within 5 hours of sending it', 400);
  }

  await messageRepository.hideMessage(messageId, conversationId);

  // The "New message" notification quoted it: it goes too. Matched by chat,
  // moment and text (it records no message id).
  try {
    const preview = notificationPreview(message.body, message.imageUrl);
    const sentAt = new Date(message.createdAt).getTime();
    await prisma.notification.updateMany({
      where: {
        type: 'STORE_MESSAGE',
        relatedId: conversationId,
        message: preview,
        deletedAt: null,
        createdAt: { gte: new Date(sentAt - 5000), lte: new Date(sentAt + 120000) },
      },
      data: { deletedAt: new Date() },
    });
  } catch (err) {
    console.error('[unsendMessage] notification removal failed:', err.message);
  }

  return { id: messageId, conversationId, unsent: true };
};

// How long an unsent message is kept (hidden) for moderators.
const UNSENT_KEEP_DAYS = 30;

/**
 * Erase messages unsent more than UNSENT_KEEP_DAYS ago, with their private
 * photo files. Daily job (server.js "unsent-purge").
 * @returns {Promise<Number>} how many were erased
 */
const purgeUnsent = async () => {
  const privateMedia = require('../lib/privateMedia');
  const before = new Date(Date.now() - UNSENT_KEEP_DAYS * 86400e3);
  const old = await prisma.message.findMany({
    where: { unsentAt: { lt: before } },
    select: { id: true, imageUrl: true },
    take: 1000,
  });
  if (!old.length) return 0;
  await prisma.message.deleteMany({ where: { id: { in: old.map((m) => m.id) } } });
  await privateMedia.remove(old.map((m) => m.imageUrl).filter((u) => privateMedia.isPrivateRef(u)));
  return old.length;
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

/**
 * How many of a buyer's chats have a message from the shop they have not
 * read yet (the badge on the Messages tab). One query, no conversation list.
 */
const countUnreadChats = async (userId) => {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT c.id) AS n
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    WHERE c.buyer_id = ${userId}
      AND m.sender_id <> ${userId}
      AND m.unsent_at IS NULL
      AND (c.buyer_last_read_at IS NULL OR m.created_at > c.buyer_last_read_at)`;
  return Number(rows[0]?.n || 0);
};

module.exports = {
  countUnreadChats,
  listMyConversations,
  openConversationWithStore,
  openConversationWithBuyer,
  getConversation,
  sendMessage,
  unsendMessage,
  purgeUnsent,
  UNSEND_WINDOW_MS,
  UNSENT_KEEP_DAYS,
  markConversationRead,
  rateConversationService,
};
