const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordView } = require('../services/productView.service');

// Every product page reports a view, but nobody opens two pages a second for
// a minute: past that it is a script, and each report can mean a write.
const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// The product page reports a view; counted once per visitor per half hour.
router.post('/product/:id', viewLimiter, optionalAuth, asyncHandler(async (req, res) => {
  const counted = await recordView(req.params.id, { userId: req.user?.id, ip: req.ip });
  res.status(202).json({ success: true, counted });
}));

module.exports = router;
