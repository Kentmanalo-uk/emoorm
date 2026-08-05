const reportRepository = require('../repositories/report.repository');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Report Service
 * Product / seller abuse reports, auto-routed to the target's municipality.
 */

const VALID_TYPES = ['PRODUCT', 'SELLER'];
const VALID_REASONS = [
  'INAPPROPRIATE_CONTENT',
  'COUNTERFEIT',
  'FRAUD',
  'SPAM',
  'MISLEADING',
  'OTHER',
];
const VALID_STATUSES = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

/**
 * Create report
 * @param {String} userId - Reporter user ID
 * @param {Object} data - { type, productId?, reportedSellerId? | storeId?, reason, description, evidence? }
 */
const createReport = async (userId, data) => {
  const { type, productId, reason, description, evidence } = data;
  let reportedSellerId = data.reportedSellerId || null;
  const targetStoreId = data.storeId || null;

  if (!VALID_TYPES.includes(type)) {
    throw new ApiError('Invalid report type', 400);
  }
  if (!VALID_REASONS.includes(reason)) {
    throw new ApiError('Invalid report reason', 400);
  }

  let municipalityId = null;

  if (type === 'PRODUCT') {
    if (!productId) {
      throw new ApiError('Product ID is required for product reports', 400);
    }
    const product = await productRepository.findById(productId);
    if (!product || product.deletedAt) {
      throw new ApiError('Product not found', 404);
    }
    municipalityId = product.municipalityId;
  } else {
    // SELLER report — accept either reportedSellerId or storeId
    if (!reportedSellerId && !targetStoreId) {
      throw new ApiError('Seller (or store) ID is required for seller reports', 400);
    }
    let store = null;
    if (targetStoreId) {
      store = await storeRepository.findById(targetStoreId);
      if (!store || store.deletedAt) {
        throw new ApiError('Store not found', 404);
      }
      reportedSellerId = store.ownerId;
    } else {
      const seller = await userRepository.findById(reportedSellerId);
      if (!seller || seller.deletedAt) {
        throw new ApiError('Seller not found', 404);
      }
      store = await storeRepository.findByOwnerId(reportedSellerId);
    }
    municipalityId = store?.municipalityId || null;
    if (!municipalityId) {
      throw new ApiError('Cannot determine municipality for this seller', 400);
    }
  }

  const report = await reportRepository.createReport({
    reporterId: userId,
    type,
    productId: type === 'PRODUCT' ? productId : null,
    reportedSellerId: type === 'SELLER' ? reportedSellerId : null,
    reason,
    description: description || null,
    evidence: evidence || null,
    status: 'PENDING',
    municipalityId,
  });

  // Notify the reporter that we received it
  try {
    await notificationService.createNotification({
      userId,
      type: 'REPORT_SUBMITTED',
      title: 'Report Submitted',
      message: 'We received your report and will review it shortly.',
      relatedId: report.id,
    });
  } catch (err) {
    console.error('[createReport] reporter notification failed:', err.message);
  }

  return report;
};

const getReportById = async (id, userId, userRole) => {
  const report = await reportRepository.findById(id);
  if (!report) throw new ApiError('Report not found', 404);

  const isReporter = report.reporterId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MUNICIPAL_ADMIN';
  if (!isReporter && !isAdmin) {
    throw new ApiError('You do not have permission to view this report', 403);
  }
  return report;
};

const getAllReports = async (options) => reportRepository.findAll(options);

const getMyReports = async (userId, options) =>
  reportRepository.findAll({ ...options, reporterId: userId });

const updateReportStatus = async (reportId, status, resolutionNotes, actor) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError('Invalid report status', 400);
  }

  const report = await reportRepository.findById(reportId);
  if (!report) throw new ApiError('Report not found', 404);

  if (actor?.role === 'MUNICIPAL_ADMIN' && report.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate reports in your assigned municipality', 403);
  }

  const updated = await reportRepository.updateStatus(reportId, status, resolutionNotes);

  if (status === 'RESOLVED' || status === 'DISMISSED') {
    try {
      await notificationService.createNotification({
        userId: report.reporterId,
        type: 'REPORT_RESOLVED',
        title: 'Report Update',
        message: `Your report has been marked ${status.toLowerCase()}`,
        relatedId: reportId,
      });
    } catch (err) {
      console.error('[updateReportStatus] notification failed:', err.message);
    }
  }

  return updated;
};

module.exports = {
  createReport,
  getReportById,
  getAllReports,
  getMyReports,
  updateReportStatus,
};
