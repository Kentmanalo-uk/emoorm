const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const notificationService = require('./notification.service');
const { cleanText } = require('../utils/sanitize');

/**
 * Questions buyers ask on a product page, answered by the shop. Everyone sees
 * answered questions (with the asker's first name only); the shop or an admin
 * can hide one (spam, rudeness).
 */

const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const ANSWER_MAX = 1000;

const firstName = (name) => String(name || 'Buyer').trim().split(/\s+/)[0];

const publicShape = (q) => ({
  id: q.id,
  question: q.question,
  answer: q.answer,
  answeredAt: q.answeredAt,
  createdAt: q.createdAt,
  askedBy: firstName(q.asker?.fullName),
});

/** A product's questions for its page: answered ones, and the viewer's own. */
const listForProduct = async (productId, viewerId = null, { page = 1, pageSize = 10 } = {}) => {
  const where = {
    productId,
    isHidden: false,
    OR: [{ answer: { not: null } }, ...(viewerId ? [{ askerId: viewerId }] : [])],
  };
  const [rows, total] = await Promise.all([
    prisma.productQuestion.findMany({
      where,
      orderBy: [{ answeredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { asker: { select: { fullName: true } } },
    }),
    prisma.productQuestion.count({ where }),
  ]);
  return { items: rows.map((q) => ({ ...publicShape(q), mine: q.askerId === viewerId })), total, page, pageSize };
};

const ask = async (userId, productId, body = {}) => {
  const question = cleanText(String(body.question || '')).trim();
  if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
    throw new ApiError(`Ask in ${QUESTION_MIN} to ${QUESTION_MAX} characters`, 400);
  }
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, status: true, deletedAt: true, storeId: true, store: { select: { ownerId: true } } },
  });
  if (!product || product.deletedAt || product.status !== 'APPROVED') throw new ApiError('Product not found', 404);
  if (product.store.ownerId === userId) throw new ApiError('You cannot ask about your own product', 400);

  const created = await prisma.productQuestion.create({
    data: { productId, storeId: product.storeId, askerId: userId, question },
    include: { asker: { select: { fullName: true } } },
  });
  await notificationService.createNotification({
    userId: product.store.ownerId,
    type: 'PRODUCT_QUESTION',
    audience: 'SELLER',
    title: `New question on ${product.name}`,
    message: question.length > 120 ? `${question.slice(0, 117)}…` : question,
    relatedId: created.id,
  }).catch((err) => console.error('[questions] seller notice failed:', err.message));
  return { ...publicShape(created), mine: true };
};

const ownStoreId = async (userId) => {
  const store = await prisma.store.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (!store) throw new ApiError('You do not have a shop', 403);
  return store.id;
};

/** The shop's questions, the ones still waiting first. */
const listForStore = async (userId, { status = 'open' } = {}) => {
  const storeId = await ownStoreId(userId);
  const where = { storeId, isHidden: false, ...(status === 'open' ? { answer: null } : {}) };
  const [rows, open] = await Promise.all([
    prisma.productQuestion.findMany({
      where,
      orderBy: [{ answeredAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        asker: { select: { fullName: true } },
        product: { select: { id: true, name: true, slug: true, images: true } },
      },
    }),
    prisma.productQuestion.count({ where: { storeId, isHidden: false, answer: null } }),
  ]);
  return { items: rows.map((q) => ({ ...publicShape(q), product: q.product })), open };
};

const ownQuestion = async (userId, id) => {
  const q = await prisma.productQuestion.findUnique({
    where: { id },
    include: { store: { select: { ownerId: true } }, product: { select: { name: true } } },
  });
  if (!q || q.store.ownerId !== userId) throw new ApiError('Question not found', 404);
  return q;
};

const answer = async (userId, id, body = {}) => {
  const q = await ownQuestion(userId, id);
  const text = cleanText(String(body.answer || '')).trim();
  if (!text || text.length > ANSWER_MAX) throw new ApiError(`Answer in 1 to ${ANSWER_MAX} characters`, 400);
  const first = !q.answer;
  const updated = await prisma.productQuestion.update({
    where: { id },
    data: { answer: text, answeredAt: q.answeredAt || new Date() },
    include: { asker: { select: { fullName: true } } },
  });
  if (first) {
    await notificationService.createNotification({
      userId: q.askerId,
      type: 'PRODUCT_ANSWER',
      title: `The shop answered your question`,
      message: `${q.product.name}: ${text.length > 120 ? `${text.slice(0, 117)}…` : text}`,
      relatedId: q.productId,
    }).catch((err) => console.error('[questions] answer notice failed:', err.message));
  }
  return publicShape(updated);
};

/** Hide a question (the shop, or an admin moderating). */
const hide = async (user, id) => {
  const q = await prisma.productQuestion.findUnique({ where: { id }, include: { store: { select: { ownerId: true, municipalityId: true } } } });
  // The shop, a super admin, or the admin of the shop's own town.
  const allowed = q && (
    user.role === 'SUPER_ADMIN'
    || (user.role === 'MUNICIPAL_ADMIN' && q.store.municipalityId === user.municipalityId)
    || q.store.ownerId === user.id
  );
  if (!allowed) throw new ApiError('Question not found', 404);
  await prisma.productQuestion.update({ where: { id }, data: { isHidden: true } });
  return { hidden: true };
};

module.exports = { listForProduct, ask, listForStore, answer, hide };
