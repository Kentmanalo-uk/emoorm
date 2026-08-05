const express = require('express');
const router = express.Router();
const mfaController = require('../controllers/mfa.controller');
const { authenticate } = require('../middleware/auth');

/**
 * MFA routes.
 * Public endpoints operate on a short-lived `mfaToken` returned by /auth/login
 * when a second factor is required. Everything else is authenticated.
 */

// Login-time flow (public, but each hits requires a valid mfaToken).
router.post('/verify-login', mfaController.verifyLogin);
router.post('/setup/begin-login', mfaController.beginSetupWithToken);
router.post('/setup/complete-login', mfaController.completeSetupWithToken);

// Authenticated flow (Settings page).
router.get('/status', authenticate, mfaController.getStatus);
router.post('/setup/begin', authenticate, mfaController.beginSetup);
router.post('/setup/complete', authenticate, mfaController.completeSetup);
router.post('/disable', authenticate, mfaController.disable);
router.post('/backup-codes/regenerate', authenticate, mfaController.regenerateBackupCodes);

module.exports = router;
