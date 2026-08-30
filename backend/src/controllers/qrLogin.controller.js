const qrLoginService = require('../services/qrLogin.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/** Public: web starts a new QR login session. */
const create = asyncHandler(async (req, res) => {
  const data = await qrLoginService.createSession({
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  });
  successResponse(res, data, 'QR login session created');
});

/** Public: web polls this to detect scan/approval/rejection/expiry. */
const getStatus = asyncHandler(async (req, res) => {
  const data = await qrLoginService.getStatus(req.params.token);
  successResponse(res, data, 'QR login status');
});

/** Authenticated (mobile): scan the QR and bind it to the current user. */
const scan = asyncHandler(async (req, res) => {
  const data = await qrLoginService.scanSession(req.body.token, req.user.id);
  successResponse(res, data, 'QR code scanned');
});

/** Authenticated (mobile): approve or reject a previously scanned session. */
const approve = asyncHandler(async (req, res) => {
  const data = await qrLoginService.approveSession(req.body.token, req.user.id, !!req.body.approve);
  successResponse(res, data, data.status === 'APPROVED' ? 'Login approved' : 'Login rejected');
});

module.exports = {
  create,
  getStatus,
  scan,
  approve,
};
