const reportRepository = require('../repositories/report.repository');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Report Service
 * Contains business logic for report operations
 */

/**
 * Create report
 * @param {String} userId - Reporter user ID
 * @param {Object} data - Report data
 * @returns {Promise<Object>} Created report
 */
const createReport = async (userId, data) => {
  const { type, productId, storeId, reason, description } = data;

  // Validate report type
  const validTypes = ['PRODUCT', 'SELLER'];
  if (!validTypes.includes(type)) {
    throw new ApiError('Invalid report type', 400);
  }

  // Validate based on type
  if (type === 'PRODUCT') {
    if (!productId) {
      throw new ApiError('Product ID is required for product reports', 400);
    }

    const product = await productRepository.findById(productId);
    if (!product || product.deletedAt) {
      throw new ApiError('Product not found', 404);
    }
  }

  if (type === 'SELLER') {
    if (!storeId) {
      throw new ApiError('Store ID is required for seller reports', 400);
    }

    const store = await storeRepository.findById(storeId);
    if (!store || store.deletedAt) {
      throw new ApiError('Store not found', 404);
    }
  }

  // Validate reason
  const validReasons = [
    'INAPPROPRIATE_CONTENT',
    'COUNTERFEIT',
    'FRAUD',
    'SPAM',
    'MISLEADING',
    'OTHER',
  ];

  if (!validReasons.includes(reason)) {
    throw new ApiError('Invalid report reason', 400);
  }

  // Create report
  const report = await reportRepository.createReport({
    reporterId: userId,
    type,
    productId: productId || null,
    storeId: storeId || null,
    reason,
    description,
    status: 'PENDING',
  });

  return report;
};

/**
 * Get report by ID
 * @param {String} id - Report ID
 * @param {String} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Object>} Report
 */
const getReportById = async (id, userId, userRole) => {
  const report = await reportRepository.findById(id);

  if (!report) {
    throw new ApiError('Report not found', 404);
  }

  // Authorization check
  const isReporter = report.reporterId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MUNICIPAL_ADMIN';

  if (!isReporter && !isAdmin) {
    throw new ApiError('You do not have permission to view this report', 403);
  }

  return report;
};

/**
 * Get all reports (Admin)
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reports and pagination
 */
const getAllReports = async (options) => {
  return reportRepository.findAll(options);
};

/**
 * Get my reports (Reporter)
 * @param {String} userId - Reporter user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reports and pagination
 */
const getMyReports = async (userId, options) => {
  return reportRepository.findAll({ ...options, reporterId: userId });
};

/**
 * Update report status (Admin)
 * @param {String} reportId - Report ID
 * @param {String} status - New status
 * @param {String} adminNotes - Admin notes
 * @returns {Promise<Object>} Updated report
 */
const updateReportStatus = async (reportId, status, adminNotes) => {
  const report = await reportRepository.findById(reportId);

  if (!report) {
    throw new ApiError('Report not found', 404);
  }

  // Validate status
  const validStatuses = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];
  if (!validStatuses.includes(status)) {
    throw new ApiError('Invalid report status', 400);
  }

  return reportRepository.updateStatus(reportId, status, adminNotes);
};

module.exports = {
  createReport,
  getReportById,
  getAllReports,
  getMyReports,
  updateReportStatus,
};
