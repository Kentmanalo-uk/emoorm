const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Notification Routes
 * All routes require authentication
 */

// Get my notifications
router.get(
  '/',
  authenticate,
  notificationController.getMyNotifications
);

// Get unread count
router.get(
  '/unread/count',
  authenticate,
  notificationController.getUnreadCount
);

// Get notification by ID
router.get(
  '/:id',
  authenticate,
  notificationController.getNotificationById
);

// Mark notification as read
router.put(
  '/:id/read',
  authenticate,
  notificationController.markAsRead
);

// Mark all as read
router.put(
  '/read-all',
  authenticate,
  notificationController.markAllAsRead
);

// Delete notification
router.delete(
  '/:id',
  authenticate,
  notificationController.deleteNotification
);

// Delete all notifications
router.delete(
  '/',
  authenticate,
  notificationController.deleteAllNotifications
);

module.exports = router;
