const moormoveService = require('../services/moormove.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * MoorMove rider delivery: the option at checkout, the seller's rider
 * bookings, live tracking, and MoorMove's own updates.
 */

/** GET /moormove/status: whether MoorMove riders are on. */
const status = asyncHandler(async (req, res) => {
  successResponse(res, await moormoveService.publicStatus(), 'MoorMove status');
});

/** POST /moormove/quote: the rider fee for a checkout. */
const quote = asyncHandler(async (req, res) => {
  const {
    storeId, lat, lng, items, municipalityId, barangay,
  } = req.body || {};
  const data = await moormoveService.checkoutQuote(req.user, {
    storeId, lat, lng, items, municipalityId, barangay,
  });
  successResponse(res, data, 'Rider fee');
});

/** GET /moormove/admin/health: the super admin's connection check. */
const health = asyncHandler(async (req, res) => {
  successResponse(res, await moormoveService.health(), 'MoorMove connection');
});

/** POST /orders/:id/rider: the seller calls a rider. */
const book = asyncHandler(async (req, res) => {
  successResponse(res, await moormoveService.book(req.params.id, req.user.id), 'A rider is being found');
});

/** DELETE /orders/:id/rider: the seller calls the rider off. */
const cancelBooking = asyncHandler(async (req, res) => {
  const order = await moormoveService.cancelBooking(req.params.id, req.user.id, req.body?.reason);
  successResponse(res, order, 'The rider was cancelled');
});

/** POST /orders/:id/rider/self: the seller delivers it themselves. */
const deliverMyself = asyncHandler(async (req, res) => {
  successResponse(res, await moormoveService.deliverMyself(req.params.id, req.user.id), 'You will deliver this order');
});

/** POST /orders/:id/rider/cash-received: the rider brought the cash back. */
const cashReceived = asyncHandler(async (req, res) => {
  successResponse(res, await moormoveService.cashReceived(req.params.id, req.user.id), 'Cash received');
});

/** GET /orders/:id/tracking */
const tracking = asyncHandler(async (req, res) => {
  successResponse(res, await moormoveService.tracking(req.params.id, req.user), 'Delivery tracking');
});

/** GET /orders/store/rider-cash?status=held|received|all */
const riderCash = asyncHandler(async (req, res) => {
  const wanted = String(req.query.status || 'all').toLowerCase();
  const data = await moormoveService.riderCash(req.user.id, {
    status: ['held', 'received', 'all'].includes(wanted) ? wanted : 'all',
  });
  successResponse(res, data, 'Rider cash');
});

/**
 * POST /partner/moormove/events: MoorMove's signed update about a job. The
 * body arrives raw (see app.js) so its signature can be checked. Unknown
 * jobs are answered 200 too, so MoorMove doesn't keep resending them.
 */
const receiveEvent = asyncHandler(async (req, res) => {
  const result = await moormoveService.handleEvent({
    eventId: req.get('x-moormove-event'),
    timestamp: req.get('x-moormove-timestamp'),
    signature: req.get('x-moormove-signature'),
    rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
  });
  res.status(result.status).json({ success: result.status < 300, message: result.message });
});

module.exports = {
  status,
  quote,
  health,
  book,
  cancelBooking,
  deliverMyself,
  cashReceived,
  tracking,
  riderCash,
  receiveEvent,
};
