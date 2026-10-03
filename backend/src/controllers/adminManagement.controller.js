const adminMgmtService = require('../services/adminManagement.service');
const { successResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const listJuniorAdmins = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 25, search, municipalityId } = req.query;
  const result = await adminMgmtService.listJuniorAdmins({
    page: Math.max(1, parseInt(page, 10) || 1),
    pageSize: Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20)),
    search,
    municipalityId,
  });
  paginatedResponse(
    res,
    result.admins,
    result.total,
    result.page,
    result.pageSize,
    'Junior admins retrieved successfully'
  );
});

const assignJuniorAdmin = asyncHandler(async (req, res) => {
  const admin = await adminMgmtService.assignJuniorAdmin(req.user, req.body);
  successResponse(res, admin, 'Municipal admin assigned successfully');
});

const removeJuniorAdmin = asyncHandler(async (req, res) => {
  const result = await adminMgmtService.removeJuniorAdmin(req.user, req.params.id);
  successResponse(res, result, 'Municipal admin removed successfully');
});

module.exports = {
  listJuniorAdmins,
  assignJuniorAdmin,
  removeJuniorAdmin,
};
