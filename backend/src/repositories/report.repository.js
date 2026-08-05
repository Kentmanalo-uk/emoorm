const prisma = require('../config/database');

/**
 * Report Repository
 * Matches Prisma schema: type, productId, reportedSellerId, reason, description,
 * status, municipalityId, resolutionNotes, resolvedAt
 */

const REPORT_INCLUDE_LIST = {
  reporter: {
    select: { id: true, fullName: true, email: true },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      store: { select: { id: true, name: true, slug: true } },
    },
  },
  municipality: { select: { id: true, name: true, code: true } },
};

const REPORT_INCLUDE_DETAIL = {
  reporter: {
    select: { id: true, fullName: true, email: true, contactNumber: true },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      images: true,
      store: {
        select: { id: true, name: true, slug: true, ownerId: true },
      },
    },
  },
  municipality: { select: { id: true, name: true, code: true } },
};

const createReport = async (data) => {
  return prisma.report.create({
    data,
    include: REPORT_INCLUDE_LIST,
  });
};

const findById = async (id) => {
  return prisma.report.findUnique({
    where: { id },
    include: REPORT_INCLUDE_DETAIL,
  });
};

const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    reporterId,
    productId,
    reportedSellerId,
    type,
    status,
    municipalityId,
  } = options;

  const where = {};
  if (reporterId) where.reporterId = reporterId;
  if (productId) where.productId = productId;
  if (reportedSellerId) where.reportedSellerId = reportedSellerId;
  if (type) where.type = type;
  if (status) where.status = status;
  if (municipalityId) where.municipalityId = municipalityId;

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: REPORT_INCLUDE_LIST,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.report.count({ where }),
  ]);

  return { reports, total, page, pageSize };
};

const updateStatus = async (id, status, resolutionNotes = null) => {
  const data = { status };
  if (resolutionNotes !== null && resolutionNotes !== undefined) {
    data.resolutionNotes = resolutionNotes;
  }
  if (status === 'RESOLVED' || status === 'DISMISSED') {
    data.resolvedAt = new Date();
  }
  return prisma.report.update({
    where: { id },
    data,
    include: REPORT_INCLUDE_LIST,
  });
};

const updateReport = async (id, data) => {
  return prisma.report.update({ where: { id }, data });
};

module.exports = {
  createReport,
  findById,
  findAll,
  updateStatus,
  updateReport,
};
