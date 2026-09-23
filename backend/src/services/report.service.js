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

const VALID_TYPES = ['PRODUCT', 'SELLER', 'BUYER'];

/**
 * Reasons are a controlled list so the admin queue can be filtered and counted.
 * The first group predates buyer reports; the last three exist because "the
 * customer never paid" has no sensible spelling in the seller-facing set.
 */
const VALID_REASONS = [
  'INAPPROPRIATE_CONTENT',
  'COUNTERFEIT',
  'FRAUD',
  'SPAM',
  'MISLEADING',
  'ABUSIVE_BEHAVIOR',
  'NON_PAYMENT',
  'FAKE_ORDER',
  'OTHER',
];
const VALID_STATUSES = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

/**
 * Create report
 * @param {String} userId - Reporter user ID
 * @param {Object} data - { type, productId?, reportedSellerId? | storeId?, reason, description, evidence? }
 */
/** What the admin sees in the notification title. */
const TYPE_LABEL = { PRODUCT: 'product', SELLER: 'seller', BUYER: 'buyer' };

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
  let reportedBuyerId = null;

  if (type === 'BUYER') {
    // Only someone who actually sells can report a customer; otherwise this is
    // a buyer-on-buyer harassment vector with an admin queue attached.
    const reporter = await userRepository.findById(userId);
    const reporterStore = await storeRepository.findByOwnerId(userId);
    if (!reporterStore && reporter?.role !== 'SELLER') {
      throw new ApiError('Only sellers can report a buyer', 403);
    }

    reportedBuyerId = data.reportedBuyerId || null;
    if (!reportedBuyerId) {
      throw new ApiError('Buyer ID is required for buyer reports', 400);
    }
    if (reportedBuyerId === userId) {
      throw new ApiError('You cannot report yourself', 400);
    }

    const buyer = await userRepository.findById(reportedBuyerId);
    if (!buyer || buyer.deletedAt) {
      throw new ApiError('Buyer not found', 404);
    }
    // The buyer's own municipal admin is the one who can act on the account,
    // so it routes there rather than to the seller's admin.
    municipalityId = buyer.municipalityId || null;
    if (!municipalityId) {
      throw new ApiError('Cannot determine municipality for this buyer', 400);
    }
  } else if (type === 'PRODUCT') {
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
    if (reportedSellerId === userId) {
      throw new ApiError('You cannot report yourself', 400);
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
    reportedBuyerId: type === 'BUYER' ? reportedBuyerId : null,
    reason,
    description: description || null,
    evidence: evidence || null,
    status: 'PENDING',
    municipalityId,
  });

  await notificationService.notifyMunicipalAdmins(municipalityId, {
    type: 'REPORT_SUBMITTED',
    title: `New ${TYPE_LABEL[type] || 'account'} report`,
    message: `A user reported: ${reason}`,
    relatedId: report.id,
  });

  // Notify the reporter that we received it.
  // Without an explicit audience this defaulted to SELLER (REPORT_SUBMITTED is
  // an admin-facing type), so a buyer's own acknowledgement was filed in a feed
  // they never open and was never seen.
  try {
    const reporter = await userRepository.findById(userId);
    await notificationService.createNotification({
      userId,
      type: 'REPORT_SUBMITTED',
      title: 'Report Submitted',
      message: 'We received your report and will review it shortly.',
      relatedId: report.id,
      // A seller reporting a customer reads the receipt in their seller feed;
      // everyone else reads it as a buyer.
      audience: (type === 'BUYER' || reporter?.role === 'SELLER') ? 'SELLER' : 'BUYER',
    });
  } catch (err) {
    console.error('[createReport] reporter notification failed:', err.message);
  }

  return report;
};

const getReportById = async (id, userId, userRole, userMunicipalityId) => {
  const report = await reportRepository.findById(id);
  if (!report) throw new ApiError('Report not found', 404);

  const isReporter = report.reporterId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MUNICIPAL_ADMIN';
  if (!isReporter && !isAdmin) {
    throw new ApiError('You do not have permission to view this report', 403);
  }
  if (!isReporter && userRole === 'MUNICIPAL_ADMIN' && report.municipalityId !== userMunicipalityId) {
    throw new ApiError('You can only view reports in your assigned municipality', 403);
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

  const updated = await reportRepository.updateStatus(reportId, status, resolutionNotes, actor?.id || null);

  if (status === 'RESOLVED' || status === 'DISMISSED') {
    try {
      const reporter = await userRepository.findById(report.reporterId);
      await notificationService.createNotification({
        userId: report.reporterId,
        type: 'REPORT_RESOLVED',
        title: 'Report Update',
        message: resolutionNotes
          ? `Your report has been marked ${status.toLowerCase()}: ${String(resolutionNotes).slice(0, 160)}`
          : `Your report has been marked ${status.toLowerCase()}`,
        relatedId: reportId,
        audience: reporter?.role === 'SELLER' ? 'SELLER' : 'BUYER',
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
