const prisma = require('../config/database');

/**
 * Report Repository
 * Handles all database operations related to reports
 */

/**
 * Create a report
 * @param {Object} data - Report data
 * @returns {Promise<Object>} Created report
 */
const createReport = async (data) => {
  return prisma.report.create({
    data,
    include: {
      reporter: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
};

/**
 * Find report by ID
 * @param {String} id - Report ID
 * @returns {Promise<Object|null>} Report or null
 */
const findById = async (id) => {
  return prisma.report.findUnique({
    where: { id },
    include: {
      reporter: {
        select: {
          id: true,
          fullName: true,
          email: true,
          contactNumber: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          store: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          owner: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Find all reports with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reports and pagination
 */
const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    reporterId,
    productId,
    storeId,
    type,
    status,
    municipalityId,
  } = options;

  const where = {};

  if (reporterId) where.reporterId = reporterId;
  if (productId) where.productId = productId;
  if (storeId) where.storeId = storeId;
  if (type) where.type = type;
  if (status) where.status = status;
  if (municipalityId) where.municipalityId = municipalityId;

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: {
            id: true,
            fullName: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.report.count({ where }),
  ]);

  return {
    reports,
    total,
    page,
    pageSize,
  };
};

/**
 * Update report status
 * @param {String} id - Report ID
 * @param {String} status - New status
 * @param {String} adminNotes - Admin notes
 * @returns {Promise<Object>} Updated report
 */
const updateStatus = async (id, status, adminNotes = null) => {
  return prisma.report.update({
    where: { id },
    data: {
      status,
      adminNotes,
      resolvedAt: status === 'RESOLVED' ? new Date() : null,
    },
  });
};

/**
 * Update report
 * @param {String} id - Report ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated report
 */
const updateReport = async (id, data) => {
  return prisma.report.update({
    where: { id },
    data,
  });
};

module.exports = {
  createReport,
  findById,
  findAll,
  updateStatus,
  updateReport,
};
