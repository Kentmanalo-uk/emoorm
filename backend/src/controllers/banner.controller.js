const bannerService = require('../services/banner.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const listPublic = asyncHandler(async (req, res) => {
  const banners = await bannerService.listActive();
  successResponse(res, banners, 'Banners retrieved');
});

const listAdmin = asyncHandler(async (req, res) => {
  const banners = await bannerService.listAll();
  successResponse(res, banners, 'Banners retrieved');
});

const create = asyncHandler(async (req, res) => {
  const banner = await bannerService.create(req.user.id, req.body);
  successResponse(res, banner, 'Banner created', 201);
});

const update = asyncHandler(async (req, res) => {
  const banner = await bannerService.update(req.params.id, req.body);
  successResponse(res, banner, 'Banner updated');
});

const remove = asyncHandler(async (req, res) => {
  await bannerService.remove(req.params.id);
  successResponse(res, null, 'Banner deleted');
});

module.exports = { listPublic, listAdmin, create, update, remove };
