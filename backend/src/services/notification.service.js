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

  // Must stay in sync with the NotificationType enum in prisma/schema.prisma.
  const validTypes = [
    'ORDER_RECEIVED',
    'ORDER_CONFIRMED',
    'ORDER_READY',
    'ORDER_COMPLETED',
    'ORDER_CANCELLED',
    'PRODUCT_APPROVED',
    'PRODUCT_SUSPENDED',
    'SELLER_APPROVED',
    'SELLER_SUSPENDED',
    'REPORT_SUBMITTED',
    'REPORT_RESOLVED',
    'SYSTEM_ANNOUNCEMENT',
    'STORE_NEW_PRODUCT',
    'STORE_PROMOTION',
    'STORE_ANNOUNCEMENT',
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
    type: 'ORDER_RECEIVED',
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
  const statusMap = {
    CONFIRMED: 'ORDER_CONFIRMED',
    READY: 'ORDER_READY',
    COMPLETED: 'ORDER_COMPLETED',
    CANCELLED: 'ORDER_CANCELLED',
  };
  const type = statusMap[newStatus] || 'ORDER_CONFIRMED';
  return createNotification({
    userId: buyerId,
    type,
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
    type: 'PRODUCT_SUSPENDED',
    title: 'Product Suspended',
    message: `Your product "${productName}" has been suspended`,
    relatedId: productId,
  });
};

/**
 * Notify seller application approved
 */
const notifySellerApproved = async (userId, shopName) => {
  return createNotification({
    userId,
    type: 'SELLER_APPROVED',
    title: 'Seller Application Approved',
    message: shopName
      ? `Congratulations! Your shop "${shopName}" is now live.`
      : 'Your seller application has been approved.',
  });
};

/**
 * Notify seller application rejected / shop suspended
 */
const notifySellerRejected = async (userId, reason) => {
  return createNotification({
    userId,
    type: 'SELLER_SUSPENDED',
    title: 'Seller Application Update',
    message: reason
      ? `Your seller application was not approved: ${reason}`
      : 'Your seller application was not approved at this time.',
  });
};

/**
 * Notify order received (seller side)
 */
const notifyOrderReceived = async (sellerId, orderId, buyerName) => {
  return createNotification({
    userId: sellerId,
    type: 'ORDER_RECEIVED',
    title: 'New Order Received',
    message: `You have received a new order from ${buyerName}`,
    relatedId: orderId,
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
  notifyOrderReceived,
  notifyOrderUpdated,
  notifyProductApproved,
  notifyProductRejected,
  notifySellerApproved,
  notifySellerRejected,
};
