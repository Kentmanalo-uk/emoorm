const express = require('express');
const router = express.Router();
const savedItems = require('../services/savedItems.service');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

/**
 * The signed-in user's saved cart and wishlist (any role that shops).
 * GET returns the list; PUT replaces it with the app's.
 */
router.get('/cart', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await savedItems.getCart(req.user.id));
}));

router.put('/cart', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await savedItems.putCart(req.user.id, req.body?.items), 'Cart saved');
}));

router.get('/wishlist', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await savedItems.getWishlist(req.user.id));
}));

router.put('/wishlist', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, await savedItems.putWishlist(req.user.id, req.body?.productIds), 'Wishlist saved');
}));

module.exports = router;
