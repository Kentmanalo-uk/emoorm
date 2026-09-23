const prisma = require('../config/database');

/**
 * Report Repository
 * Matches Prisma schema: type, productId, reportedSellerId, reason, description,
 * status, municipalityId, resolutionNotes, resolvedAt
 */

/**
 * Who filed it. Email and contact number are deliberately absent: a report is
 * read by every admin of the municipality, and none of them needs the
 * reporter's contact details to judge the listing. The reporter's own
 * barangay/municipality stay, as context for where the complaint comes from.
 */
const REPORTER_SELECT = {
  select: {
    id: true,
    fullName: true,
    username: true,
    profilePhoto: true,
    barangay: true,
    municipality: { select: { id: true, name: true } },
  },
};

/** Who was reported — a name and a store, rather than a bare UUID. */
const REPORTED_SELLER_SELECT = {
  select: {
    id: true,
    fullName: true,
    username: true,
    store: {
      select: {
        id: true,
        name: true,
        slug: true,
        municipality: { select: { id: true, name: true } },
      },
    },
  },
};

/** The admin who decided it, so the drawer shows a name and not a UUID. */
const RESOLVER_SELECT = {
  select: { id: true, fullName: true, username: true },
};

/**
 * Who was reported when a seller files against a customer. Same rule as the
 * reporter select: name and place, never contact details — an admin judging
 * "this account places fake orders" does not need their phone number.
 */
const REPORTED_BUYER_SELECT = {
  select: {
    id: true,
    fullName: true,
    username: true,
    profilePhoto: true,
    barangay: true,
    municipality: { select: { id: true, name: true } },
  },
};

const REPORT_INCLUDE_LIST = {
  reporter: REPORTER_SELECT,
  reportedSeller: REPORTED_SELLER_SELECT,
  reportedBuyer: REPORTED_BUYER_SELECT,
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
  resolvedBy: RESOLVER_SELECT,
  reporter: REPORTER_SELECT,
  reportedSeller: REPORTED_SELLER_SELECT,
  reportedBuyer: REPORTED_BUYER_SELECT,
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
    reportedBuyerId,
    type,
    status,
    municipalityId,
  } = options;

  const where = {};
  if (reporterId) where.reporterId = reporterId;
  if (productId) where.productId = productId;
  if (reportedSellerId) where.reportedSellerId = reportedSellerId;
  if (reportedBuyerId) where.reportedBuyerId = reportedBuyerId;
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

const updateStatus = async (id, status, resolutionNotes = null, resolvedById = null) => {
  const data = { status };
  if (resolutionNotes !== null && resolutionNotes !== undefined) {
    data.resolutionNotes = resolutionNotes;
  }
  // Who decided it — previously only recoverable from the audit log, which no
  // admin screen reads.
  if (status === 'RESOLVED' || status === 'DISMISSED') {
    data.resolvedAt = new Date();
    data.resolvedById = resolvedById || null;
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
