const notificationService = require('../services/notification.service');
const {
  successResponse,
  noContentResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Notification Controller
 * Handles HTTP requests for notification operations
 */

/**
 * Get my notifications
 * @route GET /api/notifications
 * @access Private (Authenticated users)
 */
const getMyNotifications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    isRead,
    audience,
  } = req.query;

  // Clamped rather than trusted: page size reaches Prisma as `take`.
  const options = {
    page: Math.max(1, parseInt(page, 10) || 1),
    pageSize: Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20)),
    isRead: isRead !== undefined ? isRead === 'true' : undefined,
    audience,
  };

  const result = await notificationService.getUserNotifications(
    req.user.id,
    options
  );

  const totalPages = Math.ceil(result.total / result.pageSize);

  res.json({
    success: true,
    message: 'Notifications retrieved successfully',
    data: result.notifications,
    unreadCount: result.unreadCount,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages,
      hasNext: result.page < totalPages,
      hasPrev: result.page > 1,
    },
  });
});

/**
 * Get notification by ID
 * @route GET /api/notifications/:id
 * @access Private (Notification owner)
 */
const getNotificationById = asyncHandler(async (req, res) => {
  const notification = await notificationService.getNotificationById(
    req.params.id,
    req.user.id
  );

  successResponse(res, notification, 'Notification retrieved successfully');
});

/**
 * Get unread count
 * @route GET /api/notifications/unread/count
 * @access Private (Authenticated users)
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id, req.query.audience);

  successResponse(res, { count }, 'Unread count retrieved successfully');
});

/**
 * Mark notification as read
 * @route PUT /api/notifications/:id/read
 * @access Private (Notification owner)
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user.id
  );

  successResponse(res, notification, 'Notification marked as read');
});

/**
 * Mark all notifications as read
 * @route PUT /api/notifications/read-all
 * @access Private (Authenticated users)
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id, req.query.audience);

  successResponse(res, result, 'All notifications marked as read');
});

/**
 * Delete notification
 * @route DELETE /api/notifications/:id
 * @access Private (Notification owner)
 */
const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(req.params.id, req.user.id);

  noContentResponse(res);
});

/**
 * Delete all notifications
 * @route DELETE /api/notifications
 * @access Private (Authenticated users)
 */
const deleteAllNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.deleteAllNotifications(req.user.id);

  successResponse(res, result, 'All notifications deleted');
});

module.exports = {
  getMyNotifications,
  getNotificationById,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};
