const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Analytics Routes
 */

router.get(
  '/seller',
  authenticate,
  authorize('SELLER'),
  analyticsController.getSellerAnalytics
);

router.get(
  '/seller/day',
  authenticate,
  authorize('SELLER'),
  analyticsController.getSellerDayDetails
);

router.get(
  '/municipality',
  authenticate,
  authorize('MUNICIPAL_ADMIN', 'SUPER_ADMIN'),
  analyticsController.getMunicipalityAnalytics
);

router.get(
  '/platform',
  authenticate,
  authorize('SUPER_ADMIN'),
  analyticsController.getPlatformAnalytics
);

module.exports = router;
