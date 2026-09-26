const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const storeRepository = require('../repositories/store.repository');
const followService = require('./storeFollow.service');
const { cleanText } = require('../utils/sanitize');
const { storeHealthIssues, storeHealthLevel } = require('../utils/storeHealth');

/**
 * Seller Marketing Service
 *
 * What the seller app's "Me" and "Marketing" tabs show about the seller's
 * own shop: its health (the same rules the admins see), and announcements a
 * seller sends their followers — a shop update, or a product to look at.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Announcements a shop may send per rolling 24 hours, so followers are not spammed. */
const DAILY_LIMIT = 2;
const MESSAGE_MIN = 5;
const MESSAGE_MAX = 280;

const ownStore = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store || store.deletedAt) throw new ApiError('You do not have a store yet', 404);
  return store;
};

/**
 * @returns {Promise<Object>} { level, issues, liveProducts, ordersLast30Days,
 *   cancelledLast30Days, rating, reviewCount, followers }
 */
const getMyHealth = async (userId) => {
  const store = await ownStore(userId);
  const since = new Date(Date.now() - 30 * DAY_MS);

  const [live, orders, reviews, followers] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id, deletedAt: null, status: 'APPROVED' } }),
    prisma.order.groupBy({
      by: ['status'],
      where: { storeId: store.id, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.review.aggregate({
      where: { deletedAt: null, product: { storeId: store.id } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.storeFollow.count({ where: { storeId: store.id } }),
  ]);

  const ordersTotal = orders.reduce((sum, row) => sum + row._count._all, 0);
  const ordersCancelled = orders.find((row) => row.status === 'CANCELLED')?._count._all || 0;
  const reviewCount = reviews._count._all;
  const avgRating = reviewCount ? Number(reviews._avg.rating) : null;

  const issues = storeHealthIssues({
    live,
    ordersTotal,
    ordersCancelled,
    ratingCount: reviewCount,
    avgRating,
    olderThan30Days: store.createdAt < since,
  });

  return {
    level: storeHealthLevel(issues),
    issues,
    liveProducts: live,
    ordersLast30Days: ordersTotal,
    cancelledLast30Days: ordersCancelled,
    rating: avgRating === null ? null : Number(avgRating.toFixed(1)),
    reviewCount,
    followers,
  };
};

/** Sends in the last 24 hours and when the next one is allowed. */
const quota = async (storeId) => {
  const recent = await prisma.storeAnnouncement.findMany({
    where: { storeId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const remaining = Math.max(0, DAILY_LIMIT - recent.length);
  const nextAllowedAt = remaining > 0 ? null : new Date(recent[0].createdAt.getTime() + DAY_MS);
  return { dailyLimit: DAILY_LIMIT, remaining, nextAllowedAt };
};

const announcementSelect = {
  id: true,
  message: true,
  recipients: true,
  createdAt: true,
  product: { select: { id: true, name: true, slug: true, images: true, price: true } },
};

/** @returns {Promise<Object>} { announcements, dailyLimit, remaining, nextAllowedAt, canSend } */
const listAnnouncements = async (userId) => {
  const store = await ownStore(userId);
  const [announcements, limits] = await Promise.all([
    prisma.storeAnnouncement.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: announcementSelect,
    }),
    quota(store.id),
  ]);
  const canSend = store.isActive && !store.isSuspended && store.isApproved !== false;
  return { announcements, ...limits, canSend };
};

/**
 * Send a message to the shop's followers (those who kept notifications on).
 * With a productId it promotes that product and opens it; without, it is a
 * shop announcement that opens the storefront.
 * @param {String} userId
 * @param {{message: String, productId?: String}} data
 */
const sendAnnouncement = async (userId, data = {}) => {
  const store = await ownStore(userId);
  if (store.isApproved === false) {
    throw new ApiError('Your shop is still private. You can message followers once it is approved.', 403);
  }
  if (!store.isActive || store.isSuspended) {
    throw new ApiError('Your shop is not open, so it cannot send announcements right now.', 403);
  }

  const message = cleanText(String(data.message || ''), { maxLength: MESSAGE_MAX + 1 });
  if (message.length < MESSAGE_MIN) throw new ApiError('Write a short message (at least 5 characters).', 400);
  if (message.length > MESSAGE_MAX) throw new ApiError(`Keep it under ${MESSAGE_MAX} characters.`, 400);

  let product = null;
  if (data.productId) {
    product = await prisma.product.findFirst({
      where: { id: String(data.productId), storeId: store.id, deletedAt: null, status: 'APPROVED' },
      select: { id: true, name: true },
    });
    if (!product) throw new ApiError('Choose one of your live products.', 400);
  }

  const limits = await quota(store.id);
  if (limits.remaining === 0) {
    throw new ApiError(`You can send ${DAILY_LIMIT} announcements a day. Try again later.`, 429);
  }

  const { sent } = await followService.notifyFollowers(store.id, product
    ? {
      type: 'STORE_PROMOTION',
      title: `${store.name}: ${product.name}`,
      message,
      relatedId: product.id,
    }
    : {
      type: 'STORE_ANNOUNCEMENT',
      title: store.name,
      message,
      relatedId: store.id,
    });

  const announcement = await prisma.storeAnnouncement.create({
    data: { storeId: store.id, message, productId: product?.id || null, recipients: sent },
    select: announcementSelect,
  });

  return { announcement, sent, ...(await quota(store.id)) };
};

module.exports = { getMyHealth, listAnnouncements, sendAnnouncement, DAILY_LIMIT };
