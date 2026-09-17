const prisma = require('../config/database');
const notificationRepository = require('../repositories/notification.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Notification Service
 * Contains business logic for notification operations
 */

const AUDIENCES = ['BUYER', 'SELLER', 'ADMIN'];

/**
 * Create notification
 * @param {Object} data - Notification data
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (data) => {
  const { userId, type, title, message, relatedId, audience } = data;

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
    'RETURN_REQUESTED',
    'RETURN_APPROVED',
    'RETURN_REJECTED',
    'RETURN_AWAITING_SHIPMENT',
    'RETURN_RECEIVED',
    'RETURN_REFUNDED',
    'RETURN_CANCELLED',
    'RETURN_CLOSED',
    'SUPPORT_MESSAGE',
    'SELLER_APPLICATION_SUBMITTED',
    'ADMIN_ALERT',
  ];

  if (!validTypes.includes(type)) {
    throw new ApiError('Invalid notification type', 400);
  }

  const sellerTypes = [
    'ORDER_RECEIVED',
    'PRODUCT_APPROVED',
    'PRODUCT_SUSPENDED',
    'SELLER_SUSPENDED',
    'REPORT_SUBMITTED',
    'RETURN_REQUESTED',
    'RETURN_RECEIVED',
    'RETURN_CLOSED',
  ];
  const resolvedAudience = audience || (sellerTypes.includes(type) ? 'SELLER' : 'BUYER');
  if (!AUDIENCES.includes(resolvedAudience)) {
    throw new ApiError('Invalid notification audience', 400);
  }

  return notificationRepository.createNotification({
    userId,
    type,
    title,
    message,
    audience: resolvedAudience,
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
  if (options.audience && !AUDIENCES.includes(options.audience)) {
    throw new ApiError('Invalid notification audience', 400);
  }
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
const markAllAsRead = async (userId, audience) => {
  return notificationRepository.markAllAsRead(userId, audience);
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
const getUnreadCount = async (userId, audience) => {
  return notificationRepository.getUnreadCount(userId, audience);
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
const ORDER_STATUS_NOTICES = {
  CONFIRMED: { type: 'ORDER_CONFIRMED', text: 'has been confirmed by the seller' },
  PREPARING: { type: 'ORDER_CONFIRMED', text: 'is being prepared' },
  TO_SHIP: { type: 'ORDER_READY', text: 'is packed and ready to ship' },
  OUT_FOR_DELIVERY: { type: 'ORDER_READY', text: 'is out for delivery' },
  DELIVERED: { type: 'ORDER_READY', text: 'has been delivered' },
  READY: { type: 'ORDER_READY', text: 'is ready' },
  READY_FOR_PICKUP: { type: 'ORDER_READY', text: 'is ready for pickup' },
  PICKED_UP: { type: 'ORDER_READY', text: 'has been picked up' },
  COMPLETED: { type: 'ORDER_COMPLETED', text: 'is complete' },
  CANCELLED: { type: 'ORDER_CANCELLED', text: 'was cancelled by the seller' },
};

/**
 * Notify order status updated
 * @param {String} buyerId - Buyer user ID
 * @param {String} orderId - Order ID
 * @param {String} newStatus - New order status
 * @param {Object} [options] - { orderNumber, refundNote }
 */
const notifyOrderUpdated = async (buyerId, orderId, newStatus, { orderNumber, refundNote } = {}) => {
  const notice = ORDER_STATUS_NOTICES[newStatus] || { type: 'ORDER_CONFIRMED', text: 'was updated' };
  const refund = refundNote ? ' The seller will arrange a refund of your payment.' : '';
  return createNotification({
    userId: buyerId,
    type: notice.type,
    title: 'Order Status Updated',
    message: `Your order${orderNumber ? ` ${orderNumber}` : ''} ${notice.text}.${refund}`,
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
const notifyProductRejected = async (sellerId, productId, productName, { reason, archived = false } = {}) => {
  const action = archived ? 'archived' : 'suspended';
  return createNotification({
    userId: sellerId,
    type: 'PRODUCT_SUSPENDED',
    title: archived ? 'Product Archived' : 'Product Suspended',
    message: `Your product "${productName}" has been ${action}${reason ? `. Reason: ${reason}` : ''}`,
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

/**
 * Admins responsible for a municipality: its active municipal admins
 * (including unexpired backup admins), or the superadmins when none exist.
 */
const findResponsibleAdmins = async (municipalityId) => {
  const now = new Date();
  const municipal = municipalityId
    ? await prisma.user.findMany({
      where: {
        role: 'MUNICIPAL_ADMIN',
        municipalityId,
        isActive: true,
        deletedAt: null,
        OR: [{ adminAccessExpiresAt: null }, { adminAccessExpiresAt: { gt: now } }],
      },
      select: { id: true },
    })
    : [];
  if (municipal.length > 0) return municipal.map((u) => u.id);
  const supers = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null },
    select: { id: true },
  });
  return supers.map((u) => u.id);
};

/**
 * Notify the admins of a municipality (admin audience). Never throws.
 * @param {String|null} municipalityId
 * @param {{type: String, title: String, message: String, relatedId?: String}} notice
 */
const notifyMunicipalAdmins = async (municipalityId, notice) => {
  try {
    const adminIds = await findResponsibleAdmins(municipalityId);
    await Promise.all(adminIds.map((userId) => createNotification({ ...notice, userId, audience: 'ADMIN' })));
  } catch (err) {
    console.error('[notifyMunicipalAdmins] failed:', err.message);
  }
};

module.exports = {
  findResponsibleAdmins,
  notifyMunicipalAdmins,
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
