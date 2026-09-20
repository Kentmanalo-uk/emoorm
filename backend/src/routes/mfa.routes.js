const express = require('express');
const router = express.Router();
const mfaController = require('../controllers/mfa.controller');
const { authenticate } = require('../middleware/auth');
const { mfaLimiter } = require('../middleware/security');

/**
 * MFA routes.
 * Public endpoints operate on a short-lived `mfaToken` returned by /auth/login
 * when a second factor is required. Everything else is authenticated.
 */

// Login-time flow (public, but each hits requires a valid mfaToken).
router.post('/verify-login', mfaLimiter, mfaController.verifyLogin);
router.post('/setup/begin-login', mfaLimiter, mfaController.beginSetupWithToken);
router.post('/setup/complete-login', mfaLimiter, mfaController.completeSetupWithToken);

// Authenticated flow (Settings page).
router.get('/status', authenticate, mfaController.getStatus);
router.post('/setup/begin', authenticate, mfaController.beginSetup);
router.post('/setup/complete', authenticate, mfaController.completeSetup);
router.post('/disable', authenticate, mfaController.disable);
router.post('/backup-codes/regenerate', authenticate, mfaController.regenerateBackupCodes);

module.exports = router;
