const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const offers = require('../services/priceOffer.service');

// Price offers on livestock (services/priceOffer.service.js). Buyers make and
// answer them; sellers answer the offers on their own listings.
router.use(authenticate, authorize('BUYER', 'SELLER'));

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

router.post('/', asyncHandler(async (req, res) => ok(res, await offers.make(req.user, req.body), 201)));
router.get('/mine', asyncHandler(async (req, res) => ok(res, await offers.listMine(req.user, req.query))));
router.get('/store', authorize('SELLER'), asyncHandler(async (req, res) => ok(res, await offers.listForStore(req.user, req.query))));
router.get('/:id/checkout', asyncHandler(async (req, res) => ok(res, await offers.forCheckout(req.user, req.params.id))));
router.post('/:id/respond', authorize('SELLER'), asyncHandler(async (req, res) => ok(res, await offers.respond(req.user, req.params.id, req.body))));
router.post('/:id/answer', asyncHandler(async (req, res) => ok(res, await offers.answerCounter(req.user, req.params.id, req.body))));
router.post('/:id/cancel', asyncHandler(async (req, res) => ok(res, await offers.cancel(req.user, req.params.id))));

module.exports = router;
