const express = require('express');
const router = express.Router();
const qrLoginController = require('../controllers/qrLogin.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  statusValidation,
  scanValidation,
  approveValidation,
} = require('../validators/qrLogin.validator');

/**
 * QR Code Login Approval routes.
 * - `create` / `status` are public: the web browser is not authenticated yet.
 * - `scan` / `approve` require an already authenticated mobile session.
 */

// Web (public)
router.post('/create', qrLoginController.create);
router.get('/status/:token', statusValidation, validate, qrLoginController.getStatus);

// Mobile (authenticated)
router.post('/scan', authenticate, scanValidation, validate, qrLoginController.scan);
router.post('/approve', authenticate, approveValidation, validate, qrLoginController.approve);

module.exports = router;
