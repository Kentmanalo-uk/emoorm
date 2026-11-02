const referralService = require('../services/referral.service');
const auditLog = require('../services/auditLog.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Invites (services/referral)
 */

// GET /api/referrals/me
const getMine = asyncHandler(async (req, res) => {
  successResponse(res, await referralService.getMine(req.user.id), 'Invites retrieved');
});

// GET /api/referrals/vouchers?storeId=
const myVouchers = asyncHandler(async (req, res) => {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.slice(0, 191) : null;
  successResponse(res, await referralService.myVouchers(req.user.id, storeId || null), 'Invite vouchers retrieved');
});

// GET /api/referrals/invite/:code?shop=
const getInvite = asyncHandler(async (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop : null;
  successResponse(res, await referralService.getInvite(req.params.code, shop), 'Invite retrieved');
});

// GET /api/referrals/shop/:storeId
const getShopRewards = asyncHandler(async (req, res) => {
  successResponse(res, await referralService.getShopRewards(req.params.storeId), 'Invite rewards retrieved');
});

// GET /api/referrals/my-shop
const getMyProgram = asyncHandler(async (req, res) => {
  successResponse(res, await referralService.getMyProgram(req.user.id), 'Invite rewards retrieved');
});

// PUT /api/referrals/my-shop
const saveMyProgram = asyncHandler(async (req, res) => {
  const data = await referralService.saveMyProgram(req.user.id, req.body || {});
  await auditLog.record({
    actor: req.user, action: 'UPDATE_SHOP_INVITES', entity: 'ShopReferralProgram', details: data.program, req,
  });
  successResponse(res, data, 'Invite rewards saved');
});

// GET /api/referrals/admin
const listAdmin = asyncHandler(async (req, res) => {
  successResponse(res, await referralService.listAdmin(req.user, req.query), 'Invites retrieved');
});

// POST /api/referrals/admin/:id/:action (approve | reject)
const decide = asyncHandler(async (req, res) => {
  const data = await referralService.decide(req.user, req.params.id, req.params.action);
  await auditLog.record({
    actor: req.user, action: req.params.action === 'approve' ? 'APPROVE_INVITE' : 'REJECT_INVITE', entity: 'Referral', entityId: req.params.id, req,
  });
  successResponse(res, data, 'Invite decided');
});

module.exports = {
  getMine, myVouchers, getInvite, getShopRewards, getMyProgram, saveMyProgram, listAdmin, decide,
};
