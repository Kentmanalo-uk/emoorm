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
 * Submit government ID photos (front, and the back when the card has one)
 * for OCR verification
 * @route POST /api/identity-verification
 * @access Private
 */
const submit = asyncHandler(async (req, res) => {
  const front = req.files?.idImage?.[0] || req.file;
  const back = req.files?.idBackImage?.[0];
  const status = await identityVerificationService.submit(
    req.user,
    req.body.idType,
    { front: front?.buffer, back: back?.buffer },
    req
  );
  // Drop the in-memory images as soon as processing is done.
  if (front) front.buffer = null;
  if (back) back.buffer = null;

  const message = status.status === 'VERIFIED'
    ? 'Your identity has been verified'
    : 'Identity verification failed';
  successResponse(res, status, message);
});

module.exports = { getStatus, submit };
