const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordView } = require('../services/productView.service');

// The product page reports a view; counted once per visitor per half hour.
router.post('/product/:id', optionalAuth, asyncHandler(async (req, res) => {
  const counted = await recordView(req.params.id, { userId: req.user?.id, ip: req.ip });
  res.status(202).json({ success: true, counted });
}));

module.exports = router;
