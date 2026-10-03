const express = require('express');
const router = express.Router();
const push = require('../services/push.service');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

// Whether push is set up, and the key browsers subscribe with.
router.get('/config', (req, res) => successResponse(res, push.config()));
router.post('/subscribe', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await push.subscribe(req.user.id, req.body?.subscription), 'Notifications on for this browser');
}));
router.post('/unsubscribe', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await push.unsubscribe(req.user.id, req.body?.endpoint), 'Notifications off for this browser');
}));

module.exports = router;
