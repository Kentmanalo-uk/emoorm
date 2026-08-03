const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Report Routes
 */

// Authenticated user routes
router.post(
  '/',
  authenticate,
  reportController.createReport
);

router.get(
  '/my/reports',
  authenticate,
  reportController.getMyReports
);

router.get(
  '/:id',
  authenticate,
  reportController.getReportById
);

// Admin routes
router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  reportController.getAllReports
);

router.put(
  '/:id/status',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  reportController.updateReportStatus
);

module.exports = router;
