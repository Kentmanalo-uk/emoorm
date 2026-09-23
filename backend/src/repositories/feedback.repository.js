const prisma = require('../config/database');

/**
 * Feedback Repository
 *
 * Platform feedback sent from the top bar. Separate from support cases on
 * purpose — see the `Feedback` model comment in schema.prisma.
 */

/**
 * Who sent it. Email is included here and nowhere else in the codebase's
 * moderation reads: feedback is only ever listed by the super admin, and a bug
 * report you cannot follow up on is worth much less. Contact number is still
 * left out — there is no workflow that phones someone about feedback.
 */
const AUTHOR_SELECT = {
  select: {
    id: true,
    fullName: true,
    username: true,
    email: true,
    profilePhoto: true,
    role: true,
    municipality: { select: { id: true, name: true } },
  },
};

const REVIEWER_SELECT = {
  select: { id: true, fullName: true, username: true },
};

const FEEDBACK_INCLUDE = {
  user: AUTHOR_SELECT,
  reviewedBy: REVIEWER_SELECT,
  municipality: { select: { id: true, name: true, code: true } },
};

const create = async (data) =>
  prisma.feedback.create({ data, include: FEEDBACK_INCLUDE });

const findById = async (id) =>
  prisma.feedback.findUnique({ where: { id }, include: FEEDBACK_INCLUDE });

const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    status,
    category,
    municipalityId,
    role,
    search,
  } = options;

  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (municipalityId) where.municipalityId = municipalityId;
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { message: { contains: search } },
      { user: { fullName: { contains: search } } },
      { user: { email: { contains: search } } },
    ];
  }

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: FEEDBACK_INCLUDE,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.feedback.count({ where }),
  ]);

  return { feedback, total, page, pageSize };
};

/**
 * Headline counts for the page's summary strip. One grouped query rather than
 * one count per status, because this runs on every page load.
 */
const summarise = async () => {
  const [byStatus, byCategory, ratingAgg] = await Promise.all([
    prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.feedback.aggregate({ _avg: { rating: true }, _count: { rating: true } }),
  ]);

  const toMap = (rows, key) =>
    rows.reduce((acc, row) => ({ ...acc, [row[key]]: row._count._all }), {});

  return {
    total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    byStatus: toMap(byStatus, 'status'),
    byCategory: toMap(byCategory, 'category'),
    averageRating: ratingAgg._avg.rating,
    ratedCount: ratingAgg._count.rating,
  };
};

const update = async (id, data) =>
  prisma.feedback.update({ where: { id }, data, include: FEEDBACK_INCLUDE });

/** How many the super admin has not triaged yet — drives the nav badge. */
const countNew = async () => prisma.feedback.count({ where: { status: 'NEW' } });

module.exports = { create, findById, findAll, summarise, update, countNew };
