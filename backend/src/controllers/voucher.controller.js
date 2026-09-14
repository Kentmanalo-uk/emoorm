const voucherService = require('../services/voucher.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const validate = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body || {};
  const result = await voucherService.validate({
    code,
    subtotal,
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

module.exports = { validate, listAdmin, create, update, remove };
