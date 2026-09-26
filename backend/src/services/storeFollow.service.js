const followRepository = require('../repositories/storeFollow.repository');
const storeRepository = require('../repositories/store.repository');
const notificationRepository = require('../repositories/notification.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Store Follow Service
 */

const ensureStore = async (storeId) => {
  const store = await storeRepository.findById(storeId);
  // A shop still awaiting approval is private, so it cannot be followed yet.
  if (!store || store.deletedAt || store.isApproved === false) {
    throw new ApiError('Store not found', 404);
  }
  return store;
};

const assertNotOwner = (store, buyerId) => {
  if (store.ownerId === buyerId) {
    throw new ApiError('You cannot follow your own store', 400);
  }
};

const followStore = async (buyerId, storeId) => {
  const store = await ensureStore(storeId);
  assertNotOwner(store, buyerId);

  const existing = await followRepository.findOne(buyerId, storeId);
  if (existing) {
    const followerCount = await followRepository.countByStore(storeId);
    return { following: true, followerCount, notificationsEnabled: existing.notificationsEnabled };
  }

  await followRepository.create(buyerId, storeId);
  const followerCount = await followRepository.countByStore(storeId);
  return { following: true, followerCount, notificationsEnabled: true };
};

const unfollowStore = async (buyerId, storeId) => {
  await ensureStore(storeId);
  const existing = await followRepository.findOne(buyerId, storeId);
  if (existing) {
    await followRepository.remove(buyerId, storeId);
  }
  const followerCount = await followRepository.countByStore(storeId);
  return { following: false, followerCount };
};

const getFollowStatus = async (buyerId, storeId) => {
  const [followerCount, existing] = await Promise.all([
    followRepository.countByStore(storeId),
    buyerId ? followRepository.findOne(buyerId, storeId) : Promise.resolve(null),
  ]);
  return {
    following: !!existing,
    followerCount,
    notificationsEnabled: existing?.notificationsEnabled ?? true,
  };
};

const listFollowing = async (buyerId, opts = {}) => {
  const rows = await followRepository.listByBuyer(buyerId, opts);
  return rows.map((r) => ({
    id: r.id,
    followedAt: r.createdAt,
    notificationsEnabled: r.notificationsEnabled,
    store: {
      id: r.store.id,
      name: r.store.name,
      slug: r.store.slug,
      logo: r.store.logo,
      bannerImage: r.store.bannerImage,
      coverImage: r.store.coverImage,
      description: r.store.description,
      municipality: r.store.municipality,
      productCount: r.store._count?.products || 0,
      followerCount: r.store._count?.followers || 0,
    },
  }));
};

const toggleNotifications = async (buyerId, storeId, enabled) => {
  const existing = await followRepository.findOne(buyerId, storeId);
  if (!existing) {
    throw new ApiError('You are not following this store', 400);
  }
  const updated = await followRepository.setNotifications(buyerId, storeId, !!enabled);
  return { notificationsEnabled: updated.notificationsEnabled };
};

/**
 * Fan-out notifications to store followers.
 * @param {String} storeId
 * @param {{ type: String, title: String, message: String, relatedId?: String|null }} payload
 */
const notifyFollowers = async (storeId, payload) => {
  const { type, title, message, relatedId = null } = payload || {};
  if (!type || !title || !message) return { sent: 0 };

  const buyerIds = await followRepository.followerIdsForStore(storeId, { onlyEnabled: true });
  if (buyerIds.length === 0) return { sent: 0 };

  const data = buyerIds.map((userId) => ({
    userId,
    type,
    title,
    message,
    relatedId,
    isRead: false,
  }));

  await notificationRepository.createMany(data);
  return { sent: data.length };
};

const getSellerFollowStats = async (storeId) => {
  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startPrev30 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [total, last7, last30, prev30, recent] = await Promise.all([
    followRepository.countByStore(storeId),
    followRepository.countByStoresSince(storeId, start7),
    followRepository.countByStoresSince(storeId, start30),
    followRepository.countByStoresSince(storeId, startPrev30),
    followRepository.recentFollowers(storeId, 8),
  ]);

  const previousWindow = Math.max(0, prev30 - last30);
  const growthPct = previousWindow === 0
    ? (last30 > 0 ? 100 : 0)
    : Math.round(((last30 - previousWindow) / previousWindow) * 100);

  return {
    total,
    last7Days: last7,
    last30Days: last30,
    growthPct,
    recent: recent.map((r) => ({
      buyer: r.buyer,
      followedAt: r.createdAt,
    })),
  };
};

module.exports = {
  followStore,
  unfollowStore,
  getFollowStatus,
  listFollowing,
  toggleNotifications,
  notifyFollowers,
  getSellerFollowStats,
};
