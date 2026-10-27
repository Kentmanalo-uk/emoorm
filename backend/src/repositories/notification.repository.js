const prisma = require('../config/database');
const { CATEGORY_KEYS, categoryOfType, typeWhereFor } = require('../utils/notificationCategories');

/**
 * Notification Repository
 * Handles all database operations related to notifications
 */

/**
 * Create a notification
 * @param {Object} data - Notification data
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (data) => {
  return prisma.notification.create({
    data,
  });
};

/**
 * Create multiple notifications
 * @param {Array} dataArray - Array of notification data
 * @returns {Promise<Object>} Created notifications count
 */
const createMany = async (dataArray) => {
  return prisma.notification.createMany({
    data: dataArray,
  });
};

/**
 * Find notification by ID
 * @param {String} id - Notification ID
 * @returns {Promise<Object|null>} Notification or null
 */
const findById = async (id) => {
  return prisma.notification.findUnique({
    where: { id },
  });
};

/**
 * Find all notifications for a user
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Notifications and pagination
 */
const findByUserId = async (options = {}) => {
  const {
    userId,
    page = 1,
    pageSize = 20,
    isRead,
    audience,
    search,
    category,
  } = options;

  const where = {
    userId,
    deletedAt: null,
  };

  // One of the inbox's groups (utils/notificationCategories).
  if (category) {
    where.type = typeWhereFor(category);
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { message: { contains: search } },
    ];
  }

  if (isRead !== undefined) {
    where.isRead = isRead;
  }
  if (audience) {
    where.audience = audience;
  }

  const unreadWhere = {
    userId,
    isRead: false,
    deletedAt: null,
    ...(audience ? { audience } : {}),
  };

  const [notifications, total, unreadCount, unreadTypes] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: unreadWhere }),
    // Unread by type, summed into the groups below.
    prisma.notification.groupBy({ by: ['type'], where: unreadWhere, _count: { _all: true } }),
  ]);

  const unreadByCategory = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0]));
  for (const row of unreadTypes) unreadByCategory[categoryOfType(row.type)] += row._count._all;

  return {
    notifications,
    total,
    unreadCount,
    unreadByCategory,
    page,
    pageSize,
  };
};

/**
 * Mark notification as read
 * @param {String} id - Notification ID
 * @returns {Promise<Object>} Updated notification
 */
const markAsRead = async (id) => {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
};

/**
 * Mark all notifications as read for a user
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Update count
 */
const markAllAsRead = async (userId, audience) => {
  return prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
      deletedAt: null,
      ...(audience ? { audience } : {}),
    },
    data: { isRead: true },
  });
};

/**
 * Soft delete notification
 * @param {String} id - Notification ID
 * @returns {Promise<Object>} Deleted notification
 */
const softDeleteNotification = async (id) => {
  return prisma.notification.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

/**
 * Delete all notifications for a user
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Delete count
 */
const deleteAllForUser = async (userId, audience) => {
  return prisma.notification.updateMany({
    where: {
      userId,
      deletedAt: null,
      ...(audience === 'BUYER' || audience === 'SELLER' ? { audience } : {}),
    },
    data: { deletedAt: new Date() },
  });
};

/**
 * Get unread count for a user
 * @param {String} userId - User ID
 * @returns {Promise<Number>} Unread count
 */
const getUnreadCount = async (userId, audience) => {
  return prisma.notification.count({
    where: {
      userId,
      isRead: false,
      deletedAt: null,
      ...(audience ? { audience } : {}),
    },
  });
};

/** Unread notifications per feed (BUYER, SELLER, ADMIN), in one query. */
const getUnreadCountsByAudience = async (userId) => {
  const groups = await prisma.notification.groupBy({
    by: ['audience'],
    where: { userId, isRead: false, deletedAt: null },
    _count: { _all: true },
  });
  const byAudience = { BUYER: 0, SELLER: 0, ADMIN: 0 };
  for (const g of groups) byAudience[g.audience] = g._count._all;
  return byAudience;
};

module.exports = {
  createNotification,
  createMany,
  getUnreadCountsByAudience,
  findById,
  findByUserId,
  markAsRead,
  markAllAsRead,
  softDeleteNotification,
  deleteAllForUser,
  getUnreadCount,
};
