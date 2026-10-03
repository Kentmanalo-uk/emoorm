const voucherService = require('../services/voucher.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const validate = asyncHandler(async (req, res) => {
  const { code, subtotal, storeId } = req.body || {};
  const result = await voucherService.validate({
    code,
    subtotal,
    storeId: typeof storeId === 'string' ? storeId : undefined,
    userId: req.user?.id,
  });
  successResponse(res, result, 'Voucher applied');
});

const listAdmin = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);
  const search = String(req.query.search || '').trim();
  const result = await voucherService.listAdmin({ page, pageSize, search });
  successResponse(res, result, 'Vouchers retrieved');
});

const create = asyncHandler(async (req, res) => {
  const voucher = await voucherService.create(req.user.id, req.body);
  successResponse(res, voucher, 'Voucher created', 201);
});

const update = asyncHandler(async (req, res) => {
  const voucher = await voucherService.update(req.params.id, req.body);
  successResponse(res, voucher, 'Voucher updated');
});

const remove = asyncHandler(async (req, res) => {
  await voucherService.remove(req.params.id);
  successResponse(res, null, 'Voucher deleted');
});

// A seller's own vouchers.
const listShop = asyncHandler(async (req, res) => {
  successResponse(res, await voucherService.listShop(req.user.id), 'Vouchers retrieved');
});
const createShop = asyncHandler(async (req, res) => {
  successResponse(res, await voucherService.createShop(req.user.id, req.body), 'Voucher created', 201);
});
const updateShop = asyncHandler(async (req, res) => {
  successResponse(res, await voucherService.updateShop(req.user.id, req.params.id, req.body), 'Voucher updated');
});
const removeShop = asyncHandler(async (req, res) => {
  const kept = await voucherService.removeShop(req.user.id, req.params.id);
  successResponse(res, kept, kept ? 'Voucher turned off (it was already used)' : 'Voucher deleted');
});
// A shop's vouchers buyers can use now (public).
const liveForStore = asyncHandler(async (req, res) => {
  successResponse(res, await voucherService.liveForStore(req.params.storeId), 'Vouchers retrieved');
});

module.exports = { validate, listAdmin, create, update, remove, listShop, createShop, updateShop, removeShop, liveForStore };
