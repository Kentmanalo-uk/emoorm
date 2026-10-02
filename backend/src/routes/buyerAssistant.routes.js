const express = require('express');
const rateLimit = require('express-rate-limit');
const buyerAssistantController = require('../controllers/buyerAssistant.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Buyer Assistant Routes ("Ate Moormy" in the buyer's Messages)
 *
 * Anyone who can shop (buyers, and sellers buying from other shops).
 * Questions are capped per person: each typed one may be a paid model call
 * on the free Hugging Face allowance.
 */
const askLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `buyer-assistant:${req.user.id}`,
  message: { success: false, message: 'Ate Moormy needs a short break. Try again in a few minutes.' },
});

router.get('/', authenticate, authorize('BUYER', 'SELLER'), buyerAssistantController.getIntro);
router.post('/chat', authenticate, authorize('BUYER', 'SELLER'), askLimiter, buyerAssistantController.chat);

module.exports = router;
