const notificationRepository = require('../repositories/notification.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Notification Service
 * Contains business logic for notification operations
 */

/**
 * Create notification
 * @param {Object} data - Notification data
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (data) => {
  const { userId, type, title, message, relatedId } = data;

  // Validate notification type
  const validTypes = [
    'ORDER_CREATED',
    'ORDER_UPDATED',
    'ORDER_COMPLETED',
    'PRODUCT_APPROVED',
    'PRODUCT_REJECTED',
    'STORE_SUSPENDED',
    'REVIEW_RECEIVED',
    'REPORT_UPDATED',
    'GENERAL',
  ];

  if (!validTypes.includes(type)) {
    throw new ApiError('Invalid notification type', 400);
  }

  return notificationRepository.createNotification({
    userId,
    type,
    title,
    message,
    relatedId: relatedId || null,
    isRead: false,
  });
};

/**
 * Get user notifications
 * @param {String} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Notifications and pagination
 */
const getUserNotifications = async (userId, options) => {
  return notificationRepository.findByUserId({ ...options, userId });
};

/**
 * Get notification by ID
 * @param {String} id - Notification ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Notification
 */
const getNotificationById = async (id, userId) => {
  const notification = await notificationRepository.findById(id);

  if (!notification || notification.deletedAt) {
    throw new ApiError('Notification not found', 404);
  }

  // Check ownership
  if (notification.userId !== userId) {
    throw new ApiError('You do not have permission to view this notification', 403);
  }

  return notification;
};

/**
 * Mark notification as read
 * @param {String} id - Notification ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated notification
 */
const markAsRead = async (id, userId) => {
  const notification = await notificationRepository.findById(id);

  if (!notification || notification.deletedAt) {
    throw new ApiError('Notification not found', 404);
  }

  // Check ownership
  if (notification.userId !== userId) {
    throw new ApiError('You do not have permission to update this notification', 403);
  }

  return notificationRepository.markAsRead(id);
};

/**
 * Mark all notifications as read
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Update count
 */
const markAllAsRead = async (userId) => {
  return notificationRepository.markAllAsRead(userId);
};

/**
 * Delete notification
 * @param {String} id - Notification ID
 * @param {String} userId - User ID
 * @returns {Promise<void>}
 */
const deleteNotification = async (id, userId) => {
  const notification = await notificationRepository.findById(id);

  if (!notification || notification.deletedAt) {
    throw new ApiError('Notification not found', 404);
  }

  // Check ownership
  if (notification.userId !== userId) {
    throw new ApiError('You do not have permission to delete this notification', 403);
  }

  await notificationRepository.softDeleteNotification(id);
};

/**
 * Delete all notifications for user
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Delete count
 */
const deleteAllNotifications = async (userId) => {
  return notificationRepository.deleteAllForUser(userId);
};

/**
 * Get unread count
 * @param {String} userId - User ID
 * @returns {Promise<Number>} Unread count
 */
const getUnreadCount = async (userId) => {
  return notificationRepository.getUnreadCount(userId);
};

// Helper functions for creating specific notifications

/**
 * Notify order created
 * @param {String} sellerId - Seller user ID
 * @param {String} orderId - Order ID
 * @param {String} buyerName - Buyer name
 */
const notifyOrderCreated = async (sellerId, orderId, buyerName) => {
  return createNotification({
    userId: sellerId,
    type: 'ORDER_CREATED',
    title: 'New Order Received',
    message: `You have received a new order from ${buyerName}`,
    relatedId: orderId,
  });
};

/**
 * Notify order status updated
 * @param {String} buyerId - Buyer user ID
 * @param {String} orderId - Order ID
 * @param {String} newStatus - New order status
 */
const notifyOrderUpdated = async (buyerId, orderId, newStatus) => {
  return createNotification({
    userId: buyerId,
    type: 'ORDER_UPDATED',
    title: 'Order Status Updated',
    message: `Your order status has been updated to ${newStatus}`,
    relatedId: orderId,
  });
};

/**
 * Notify product approved
 * @param {String} sellerId - Seller user ID
 * @param {String} productId - Product ID
 * @param {String} productName - Product name
 */
const notifyProductApproved = async (sellerId, productId, productName) => {
  return createNotification({
    userId: sellerId,
    type: 'PRODUCT_APPROVED',
    title: 'Product Approved',
    message: `Your product "${productName}" has been approved and is now live`,
    relatedId: productId,
  });
};

/**
 * Notify product rejected
 * @param {String} sellerId - Seller user ID
 * @param {String} productId - Product ID
 * @param {String} productName - Product name
 */
const notifyProductRejected = async (sellerId, productId, productName) => {
  return createNotification({
    userId: sellerId,
    type: 'PRODUCT_REJECTED',
    title: 'Product Suspended',
    message: `Your product "${productName}" has been suspended`,
    relatedId: productId,
  });
};

module.exports = {
  createNotification,
  getUserNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  getUnreadCount,
  // Helper functions
  notifyOrderCreated,
  notifyOrderUpdated,
  notifyProductApproved,
  notifyProductRejected,
};
