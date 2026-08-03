const reportService = require('../services/report.service');
const {
  successResponse,
  createdResponse,
  paginatedResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Report Controller
 * Handles HTTP requests for report operations
 */

/**
 * Create report
 * @route POST /api/reports
 * @access Private (Authenticated users)
 */
const createReport = asyncHandler(async (req, res) => {
  const report = await reportService.createReport(req.user.id, req.body);

  createdResponse(res, report, 'Report submitted successfully');
});

/**
 * Get all reports (Admin)
 * @route GET /api/reports
 * @access Private (Admin only)
 */
const getAllReports = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    type,
    status,
  } = req.query;

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    type,
    status,
  };

  const result = await reportService.getAllReports(options);

  paginatedResponse(
    res,
    result.reports,
    result.total,
    result.page,
    result.pageSize,
    'Reports retrieved successfully'
  );
});

/**
 * Get my reports
 * @route GET /api/reports/my/reports
 * @access Private (Authenticated users)
 */
const getMyReports = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    status,
  } = req.query;

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    status,
  };

  const result = await reportService.getMyReports(req.user.id, options);

  paginatedResponse(
    res,
    result.reports,
    result.total,
    result.page,
    result.pageSize,
    'Your reports retrieved successfully'
  );
});

/**
 * Get report by ID
 * @route GET /api/reports/:id
 * @access Private (Reporter or Admin)
 */
const getReportById = asyncHandler(async (req, res) => {
  const report = await reportService.getReportById(
    req.params.id,
    req.user.id,
    req.user.role
  );

  successResponse(res, report, 'Report retrieved successfully');
});

/**
 * Update report status (Admin)
 * @route PUT /api/reports/:id/status
 * @access Private (Admin only)
 */
const updateReportStatus = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;

  const report = await reportService.updateReportStatus(
    req.params.id,
    status,
    adminNotes
  );

  successResponse(res, report, 'Report status updated successfully');
});

module.exports = {
  createReport,
  getAllReports,
  getMyReports,
  getReportById,
  updateReportStatus,
};
