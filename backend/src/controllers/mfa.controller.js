const mfaService = require('../services/mfa.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/** Authenticated user starts MFA enrolment from Settings. */
const beginSetup = asyncHandler(async (req, res) => {
  const data = await mfaService.beginSetup(req.user.id);
  successResponse(res, data, 'MFA setup initiated');
});

/** Authenticated user confirms first authenticator code and enables MFA. */
const completeSetup = asyncHandler(async (req, res) => {
  const data = await mfaService.completeSetup(req.user.id, req.body.code);
  successResponse(res, data, 'MFA enabled successfully');
});

const disable = asyncHandler(async (req, res) => {
  const data = await mfaService.disable(req.user.id, req.body.code);
  successResponse(res, data, 'MFA disabled');
});

const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const data = await mfaService.regenerateBackupCodes(req.user.id, req.body.code);
  successResponse(res, data, 'New backup codes generated');
});

const getStatus = asyncHandler(async (req, res) => {
  const data = await mfaService.getStatus(req.user.id);
  successResponse(res, data, 'MFA status');
});

/** Public: verify MFA code during login (holds a short-lived mfaToken). */
const verifyLogin = asyncHandler(async (req, res) => {
  const { mfaToken, code } = req.body;
  const data = await mfaService.verifyLogin(mfaToken, code);
  successResponse(res, data, 'MFA verified');
});

/** Public: begin setup mid-login for admins with no MFA yet. */
const beginSetupWithToken = asyncHandler(async (req, res) => {
  const { mfaToken } = req.body;
  const data = await mfaService.beginSetupWithMfaToken(mfaToken);
  successResponse(res, data, 'MFA setup initiated');
});

/** Public: finalise setup mid-login and receive full auth tokens. */
const completeSetupWithToken = asyncHandler(async (req, res) => {
  const { mfaToken, code } = req.body;
  const data = await mfaService.completeSetupDuringLogin(mfaToken, code);
  successResponse(res, data, 'MFA enrolment complete');
});

module.exports = {
  beginSetup,
  completeSetup,
  disable,
  regenerateBackupCodes,
  getStatus,
  verifyLogin,
  beginSetupWithToken,
  completeSetupWithToken,
};
