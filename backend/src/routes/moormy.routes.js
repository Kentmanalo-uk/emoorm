const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');
const engine = require('../moormy/engine');

/**
 * Moormy, the shopping assistant (src/moormy, docs/moormy/). One turn of a
 * conversation: what was said, the page it was said on, and the
 * conversation's state; the answer comes back with real products and the
 * actions the page may carry out. Guests can shop with Moormy; signed in,
 * Moormy can also read their own orders.
 */
const router = express.Router();

// A person talks a few times a minute; a script talking faster is not a person.
const turnLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Moormy needs a moment. Please try again shortly.' },
});

router.post('/turn', optionalAuth, turnLimiter, asyncHandler(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (text.length > 500) throw new ApiError('That is a lot to take in: please keep it under 500 characters', 400);
  const result = await engine.turn({
    text, state: req.body?.state, context: req.body?.context, user: req.user || null,
  });
  successResponse(res, result, 'Moormy');
}));

module.exports = router;
