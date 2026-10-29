const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLog.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  auditLogController.getAuditLogs
);

// The people in the log, for its "By" filter.
router.get(
  '/actors',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  auditLogController.getActors
);

module.exports = router;
