const prisma = require('../config/database');

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
  } = options;

  const where = {
    userId,
    deletedAt: null,
  };

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

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        userId,
        isRead: false,
        deletedAt: null,
        ...(audience ? { audience } : {}),
      },
    }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
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

module.exports = {
  createNotification,
  createMany,
  findById,
  findByUserId,
  markAsRead,
  markAllAsRead,
  softDeleteNotification,
  deleteAllForUser,
  getUnreadCount,
};
