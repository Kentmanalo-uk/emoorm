const identityVerificationService = require('../services/identityVerification.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get the current user's identity verification status
 * @route GET /api/identity-verification
 * @access Private
 */
const getStatus = asyncHandler(async (req, res) => {
  const status = await identityVerificationService.getStatus(req.user.id);
  successResponse(res, status, 'Identity verification status retrieved');
});

/**
 * Submit a government ID photo for OCR verification
 * @route POST /api/identity-verification
 * @access Private
 */
const submit = asyncHandler(async (req, res) => {
  const status = await identityVerificationService.submit(
    req.user,
    req.body.idType,
    req.file?.buffer,
    req
  );
  // Drop the in-memory image as soon as processing is done.
  if (req.file) req.file.buffer = null;

  const message = status.status === 'VERIFIED'
    ? 'Your identity has been verified'
    : 'Identity verification failed';
  successResponse(res, status, message);
});

module.exports = { getStatus, submit };
