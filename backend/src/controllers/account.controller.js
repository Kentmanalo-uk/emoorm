const accountService = require('../services/account.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * May the account be closed now, and what confirms it
 * @route GET /api/account/deletion
 */
const deletionCheck = asyncHandler(async (req, res) => {
  successResponse(res, await accountService.deletionCheck(req.user.id));
});

/**
 * Close the signed-in account (erased 30 days later)
 * @route POST /api/account/delete
 */
const requestDeletion = asyncHandler(async (req, res) => {
  const { password, email } = req.body || {};
  const result = await accountService.requestDeletion(req.user.id, { password, email }, req);
  successResponse(res, result, 'Your account was closed');
});

/**
 * Download everything Emoorm holds about the signed-in user
 * @route GET /api/account/export
 */
const exportData = asyncHandler(async (req, res) => {
  const data = await accountService.exportData(req.user.id);
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="emoorm-my-data-${day}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/json').send(JSON.stringify(data, null, 2));
});

/**
 * Undo an account closing within the 30 days (super admin, on the owner's request)
 * @route POST /api/account/users/:id/restore
 */
const cancelDeletion = asyncHandler(async (req, res) => {
  successResponse(res, await accountService.cancelDeletion(req.params.id, req.user, req), 'Account restored');
});

module.exports = { deletionCheck, requestDeletion, exportData, cancelDeletion };
