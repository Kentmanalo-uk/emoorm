const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const moormoveController = require('../controllers/moormove.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { publicCache } = require('../middleware/httpCache');

/**
 * MoorMove rider delivery (move.emoorm.shop).
 *
 *   router       mounted at /moormove: the option's status, checkout's rider
 *                fee, the super admin's connection check
 *   orderRouter  mounted at /orders (ahead of the order routes): the seller's
 *                rider bookings, the rider cash, live tracking
 *   receiveEvent POST /partner/moormove/events, mounted in app.js on the raw
 *                body (its signature covers the exact bytes)
 */

const router = express.Router();

// Asking MoorMove for a price costs it a little work: plenty for a person
// moving their pin about, a stop for a script.
const quoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many price checks. Please wait a moment.' },
});

router.get('/status', publicCache(60), moormoveController.status);
router.post('/quote', authenticate, quoteLimiter, moormoveController.quote);
router.get('/admin/health', authenticate, authorize('SUPER_ADMIN'), moormoveController.health);

const orderRouter = express.Router();

// Before /orders/:id in the order routes.
orderRouter.get('/store/rider-cash', authenticate, authorize('SELLER'), moormoveController.riderCash);
orderRouter.get('/:id/tracking', authenticate, moormoveController.tracking);
orderRouter.post('/:id/rider', authenticate, authorize('SELLER'), moormoveController.book);
orderRouter.delete('/:id/rider', authenticate, authorize('SELLER'), moormoveController.cancelBooking);
orderRouter.post('/:id/rider/self', authenticate, authorize('SELLER'), moormoveController.deliverMyself);
orderRouter.post('/:id/rider/cash-received', authenticate, authorize('SELLER'), moormoveController.cashReceived);

// MoorMove's updates: signed, so not limited like people are, but limited.
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many updates' },
});
const receiveEvent = [
  eventLimiter,
  express.raw({ type: () => true, limit: '256kb' }),
  moormoveController.receiveEvent,
];

module.exports = { router, orderRouter, receiveEvent };
