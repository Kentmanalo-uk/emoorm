const express = require('express');
const router = express.Router();
const phone = require('../services/phoneVerify.service');
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

// Proving a mobile number by SMS (off until an SMS key is set).
router.get('/config', (req, res) => successResponse(res, phone.config()));
router.post('/send', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await phone.sendCode(req.user.id, req.body?.number), 'Code sent');
}));
router.post('/verify', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await phone.verifyCode(req.user.id, req.body?.code), 'Number verified');
}));

// Continue with mobile number (signed out): a code to the number, then the
// code back for a session (or the complete-your-account step).
router.post('/login/send', asyncHandler(async (req, res) => {
  successResponse(res, await phone.sendLoginCode(req.body?.number, req.ip), 'Code sent');
}));
router.post('/login', asyncHandler(async (req, res) => {
  successResponse(res, await authService.loginWithPhone({ number: req.body?.number, code: req.body?.code }), 'Signed in');
}));

module.exports = router;
