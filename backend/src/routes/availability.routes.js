const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { publicCache } = require('../middleware/httpCache');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse, createdResponse } = require('../utils/response');
const availabilityService = require('../services/availability.service');

/**
 * Available Today
 *
 * GET  /today             what buyers can order now (filters: municipalityId,
 *                         near, deliversTo, barangay, categoryId, mode, search,
 *                         sort, page, pageSize)
 * GET  /today/mine        the seller's windows (?scope=ended for past ones)
 * GET  /today/menu        the shop's menu (its Available Today items, each with
 *                         the post to show) → { enabled, items, choices }
 *                         (choices: products that can be added)
 * POST /today/menu        { productId } add one of the shop's products to the
 *                         menu: Available Today, 0 in stock until posted (not
 *                         packages, paluto or live animals)
 * DELETE /today/menu/:productId   take it off the menu (a regular product with
 *                         0 in stock); refused while it has a live or upcoming post
 * POST /today             publish a window for an Available Today product
 * POST /today/batch       publish it on several days, all or none: { productId,
 *                         mode, quantity (per day), prepMinutes?, fulfillment?,
 *                         note?, dates: [YYYY-MM-DD], open: HH:MM | "now",
 *                         close: HH:MM, readyFrom?, readyUntil?, readyNextDay? }
 *                         (times of day in Manila) → { windows }
 * PATCH /today/:id        change anything chosen when posting it: productId,
 *                         mode, prepMinutes, quantity, fulfillment, note, and
 *                         its times as moments (ordersOpenAt, ordersCloseAt,
 *                         readyFrom, readyUntil) or like /batch on one day
 *                         (date?, open?, close, readyFrom?, readyUntil?,
 *                         readyNextDay?); once buyers ordered it, the product,
 *                         kind, day and opening time stay
 * POST /today/:id/quantity { delta }   add to or take from its batch
 * POST /today/:id/end     stop taking orders now
 * POST /today/:id/repeat  { date?, quantity? }   publish it again on another day;
 *                         { dates: [YYYY-MM-DD], quantity? } on several → { windows }
 */

router.get('/', publicCache(config.cache.ttl.search), asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.listPublic(req.query), 'Available today');
}));

router.use('/mine', authenticate, authorize('SELLER'));
router.get('/mine', asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.listMine(req.user.id, req.query), 'Your Available Today windows');
}));

// The menu: the shop's Available Today items (posted or not).
router.use('/menu', authenticate, authorize('SELLER'));
router.get('/menu', asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.listMenu(req.user.id), 'Your menu');
}));

router.post('/menu', asyncHandler(async (req, res) => {
  const item = await availabilityService.addToMenu(req.user.id, req.body?.productId);
  createdResponse(res, item, `${item.name} is on your menu. Post it when you have it.`);
}));

router.delete('/menu/:productId', asyncHandler(async (req, res) => {
  const item = await availabilityService.removeFromMenu(req.user.id, req.params.productId);
  successResponse(res, item, `${item.name} is off your menu. It's a regular product now with 0 in stock: set its stock in My products.`);
}));

router.post('/', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  createdResponse(res, await availabilityService.publish(req.user.id, req.body), 'Published');
}));

router.post('/batch', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  createdResponse(res, await availabilityService.publishBatch(req.user.id, req.body), 'Published');
}));

router.patch('/:id', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.updateWindow(req.user.id, req.params.id, req.body), 'Updated');
}));

router.post('/:id/quantity', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.adjustQuantity(req.user.id, req.params.id, req.body?.delta), 'Quantity updated');
}));

router.post('/:id/end', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.endWindow(req.user.id, req.params.id), 'Ended');
}));

router.post('/:id/repeat', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  createdResponse(res, await availabilityService.repeatWindow(req.user.id, req.params.id, req.body), 'Published again');
}));

module.exports = router;
