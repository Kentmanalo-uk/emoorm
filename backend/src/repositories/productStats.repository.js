const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

/**
 * The figures kept on each product row (prisma/schema.prisma Product
 * soldCount, ratingAvg, reviewCount, searchText), so that a list or a
 * search reads them instead of adding up orders and reviews, or joining the
 * category and shop tables, on every request.
 *
 * Refreshed where they change: an order settling (order.repository
 * updateStatus), a review written, edited or removed (review.repository /
 * review.service), a product, shop or category saved (product.repository
 * invalidateProducts, store.repository invalidateStore, category.repository).
 * reconcileAll (hourly, server.js) puts right anything another path missed.
 *
 * The totals are worked out with plain reads, which lock nothing, and only
 * rows whose figures differ are written, one by one by id. (An UPDATE that
 * reads other tables, or scans the products, locks every row it reads, and
 * fought checkouts for them.) Raw SQL on purpose: Prisma's update would also
 * move products.updated_at.
 */

// Orders that count as a sale: handed over, not merely placed.
const SETTLED_ORDER_STATUSES = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];

const roundRating = (value) => Math.round(Number(value || 0) * 10) / 10;

/** Sold units, rating and reviews of these products (all of them when ids is null), as they should be. */
const figuresFor = async (ids) => {
  const only = ids ? { productId: { in: ids } } : {};
  const [ratings, sales] = await Promise.all([
    prisma.review.groupBy({ by: ['productId'], where: { ...only, deletedAt: null }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ['productId'], where: { ...only, order: { status: { in: SETTLED_ORDER_STATUSES } } }, _sum: { quantity: true } }),
  ]);
  const want = new Map();
  const of = (id) => {
    if (!want.has(id)) want.set(id, { soldCount: 0, ratingAvg: 0, reviewCount: 0 });
    return want.get(id);
  };
  for (const r of ratings) Object.assign(of(r.productId), { ratingAvg: roundRating(r._avg.rating), reviewCount: r._count._all || 0 });
  for (const s of sales) of(s.productId).soldCount = s._sum.quantity || 0;
  return want;
};

const ZERO = { soldCount: 0, ratingAvg: 0, reviewCount: 0 };
const sameFigures = (a, b) => a.soldCount === b.soldCount && Math.abs(a.ratingAvg - b.ratingAvg) < 1e-9 && a.reviewCount === b.reviewCount;

/** Writes the figures of the rows that differ. @returns {Promise<Number>} rows written */
const writeFigures = async (rows, want) => {
  let written = 0;
  for (const row of rows) {
    const next = want.get(row.id) || ZERO;
    if (sameFigures(row, next)) continue;
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRaw`
      UPDATE products SET sold_count = ${next.soldCount}, rating_avg = ${next.ratingAvg}, review_count = ${next.reviewCount}
      WHERE id = ${row.id}`;
    written += 1;
  }
  return written;
};

/**
 * Recount the sold units and the rating of these products.
 * @param {String[]} ids - Product ids
 */
const refreshStats = async (ids) => {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return;
  const [rows, want] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: unique } }, select: { id: true, soldCount: true, ratingAvg: true, reviewCount: true } }),
    figuresFor(unique),
  ]);
  await writeFigures(rows, want);
};

/** The same for every product in these orders (one settled). */
const refreshStatsForOrders = async (orderIds) => {
  const unique = [...new Set((orderIds || []).filter(Boolean))];
  if (!unique.length) return;
  const items = await prisma.orderItem.findMany({ where: { orderId: { in: unique } }, select: { productId: true } });
  await refreshStats(items.map((i) => i.productId));
};

/** Each product's search column as it is and as it should be (name, description, category, shop). */
const searchTextsWhere = (where) => prisma.$queryRaw`
  SELECT p.id, p.search_text AS have, CONCAT_WS(' ', p.name, p.description, c.name, s.name) AS want
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN stores s ON s.id = p.store_id
  WHERE ${where}`;

/** Writes the search column of the rows that differ. @returns {Promise<Number>} rows written */
const writeSearchTexts = async (rows) => {
  let written = 0;
  for (const row of rows) {
    if (row.have === row.want) continue;
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRaw`UPDATE products SET search_text = ${row.want} WHERE id = ${row.id}`;
    written += 1;
  }
  return written;
};

/**
 * Rewrite the search column of the products named, of a shop's products, or
 * of a category's products (after a rename).
 * @param {{ productIds?: String[], storeId?: String, categoryId?: String }} which
 */
const refreshSearchText = async ({ productIds, storeId, categoryId } = {}) => {
  let where;
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (ids.length) where = Prisma.sql`p.id IN (${Prisma.join(ids)})`;
  else if (storeId) where = Prisma.sql`p.store_id = ${storeId}`;
  else if (categoryId) where = Prisma.sql`p.category_id = ${categoryId}`;
  else return;
  await writeSearchTexts(await searchTextsWhere(where));
};

/**
 * Check every product's figures against the orders and reviews, and its
 * search column against its name, description, category and shop.
 * @returns {Promise<{ sold: Number, search: Number }>} rows put right
 */
const reconcileAll = async () => {
  const [rows, want] = await Promise.all([
    prisma.product.findMany({ select: { id: true, soldCount: true, ratingAvg: true, reviewCount: true } }),
    figuresFor(null),
  ]);
  const figures = await writeFigures(rows, want);
  const search = await writeSearchTexts(await searchTextsWhere(Prisma.sql`1 = 1`));
  return { figures, search };
};

module.exports = {
  SETTLED_ORDER_STATUSES, refreshStats, refreshStatsForOrders, refreshSearchText, reconcileAll,
};
