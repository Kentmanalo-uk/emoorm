const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const questions = require('../services/productQuestion.service');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse, createdResponse } = require('../utils/response');

// A handful of questions an hour per person is plenty; more is spam.
const askLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'You have asked a lot of questions. Try again later.' },
});

const page = (v) => Math.max(1, parseInt(v, 10) || 1);

// A product's questions (public), and asking one.
router.get('/product/:productId', optionalAuth, asyncHandler(async (req, res) => {
  successResponse(res, await questions.listForProduct(req.params.productId, req.user?.id, { page: page(req.query.page) }));
}));
router.post('/product/:productId', authenticate, askLimiter, asyncHandler(async (req, res) => {
  createdResponse(res, await questions.ask(req.user.id, req.params.productId, req.body), 'Question sent to the shop');
}));

// The shop's side.
router.get('/store', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await questions.listForStore(req.user.id, { status: req.query.status === 'all' ? 'all' : 'open' }));
}));
router.post('/:id/answer', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await questions.answer(req.user.id, req.params.id, req.body), 'Answer posted');
}));
router.post('/:id/hide', authenticate, authorize('SELLER', 'SUPER_ADMIN', 'MUNICIPAL_ADMIN'), asyncHandler(async (req, res) => {
  successResponse(res, await questions.hide(req.user, req.params.id), 'Question hidden');
}));

module.exports = router;
