const express = require('express');
const router = express.Router();
const phone = require('../services/phoneVerify.service');
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

module.exports = router;
