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
 * POST /today             publish a window for an Available Today product
 * PATCH /today/:id        change its times, preparation, fulfilment or note
 * POST /today/:id/quantity { delta }   add to or take from its batch
 * POST /today/:id/end     stop taking orders now
 * POST /today/:id/repeat  { date?, quantity? }   publish it again on another day
 */

router.get('/', publicCache(config.cache.ttl.search), asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.listPublic(req.query), 'Available today');
}));

router.use('/mine', authenticate, authorize('SELLER'));
router.get('/mine', asyncHandler(async (req, res) => {
  successResponse(res, await availabilityService.listMine(req.user.id, req.query), 'Your Available Today windows');
}));

router.post('/', authenticate, authorize('SELLER'), asyncHandler(async (req, res) => {
  createdResponse(res, await availabilityService.publish(req.user.id, req.body), 'Published');
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
