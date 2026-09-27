const express = require('express');
const rateLimit = require('express-rate-limit');
const sellerAssistantController = require('../controllers/sellerAssistant.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Seller Assistant Routes ("Ate Moormy")
 *
 * Sellers only. Questions are capped per seller: each typed one may be a
 * paid model call on the free Hugging Face allowance.
 */
const askLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `seller-assistant:${req.user.id}`,
  message: { success: false, message: 'Ate Moormy needs a short break. Try again in a few minutes.' },
});

router.get('/', authenticate, authorize('SELLER'), sellerAssistantController.getIntro);
router.post('/chat', authenticate, authorize('SELLER'), askLimiter, sellerAssistantController.chat);

module.exports = router;
