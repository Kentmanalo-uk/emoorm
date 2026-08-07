const express = require('express');
const router = express.Router();
const followController = require('../controllers/storeFollow.controller');
const { authenticate, optionalAuth, checkStoreOwnership } = require('../middleware/auth');

/**
 * Store Follow Routes
 */

// Buyer: list stores I follow
router.get('/me', authenticate, followController.listMine);

// Public: follow status (works with or without auth)
router.get('/status/:storeId', optionalAuth, followController.getStatus);

// Buyer: follow / unfollow
router.post('/:storeId', authenticate, followController.follow);
router.delete('/:storeId', authenticate, followController.unfollow);

// Buyer: enable/disable notifications for a followed store
router.patch('/:storeId/notifications', authenticate, followController.setNotifications);

// Seller / owner: follower stats
router.get(
  '/store/:storeId/stats',
  authenticate,
  checkStoreOwnership,
  followController.sellerStats
);

module.exports = router;
