const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLog.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  auditLogController.getAuditLogs
);

module.exports = router;
