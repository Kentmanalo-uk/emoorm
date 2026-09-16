const appSettingService = require('../services/appSetting.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const get = asyncHandler(async (req, res) => {
  const settings = await appSettingService.get();
  successResponse(res, settings, 'App settings retrieved');
});

const update = asyncHandler(async (req, res) => {
  const settings = await appSettingService.update(req.body);
  successResponse(res, settings, 'App branding updated');
});

module.exports = { get, update };