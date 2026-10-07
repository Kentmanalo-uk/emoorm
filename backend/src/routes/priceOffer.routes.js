const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const offers = require('../services/priceOffer.service');

// Livestock deals (services/priceOffer.service.js), talked over in the chat.
// Buyers start them; both sides take the steps.

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// What buyers usually pay for this animal in the shop's town: shown in the
// offer sheet before signing in too.
router.get('/estimate', asyncHandler(async (req, res) => ok(res, await offers.estimate(req.query.productId))));

router.use(authenticate, authorize('BUYER', 'SELLER'));

router.post('/', asyncHandler(async (req, res) => ok(res, await offers.make(req.user, req.body), 201)));
router.get('/mine', asyncHandler(async (req, res) => ok(res, await offers.listMine(req.user, req.query))));
router.get('/store', authorize('SELLER'), asyncHandler(async (req, res) => ok(res, await offers.listForStore(req.user, req.query))));
router.get('/:id', asyncHandler(async (req, res) => ok(res, await offers.getOne(req.user, req.params.id))));
// price, accept, decline, meetup, call-off, record, confirm, not-right
router.post('/:id/:action', asyncHandler(async (req, res) => ok(res, await offers.act(req.user, req.params.id, req.params.action, req.body || {}))));

module.exports = router;
