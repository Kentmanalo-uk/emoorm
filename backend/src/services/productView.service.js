const prisma = require('../config/database');
const { dayKey } = require('../utils/manilaTime');

/**
 * Product page views per Manila day, and how they turn into orders.
 *
 * A view counts once per visitor (account, or address when signed out) and
 * product every 30 minutes, so refreshing does not inflate it; the shop's
 * own views are not counted.
 */

const REPEAT_MS = 30 * 60 * 1000;
const MAX_REMEMBERED = 50000;
const seen = new Map();

const remember = (key, now) => {
  const last = seen.get(key);
  if (last && now - last < REPEAT_MS) return false;
  if (seen.size >= MAX_REMEMBERED) {
    for (const [k, t] of seen) if (now - t >= REPEAT_MS) seen.delete(k);
    if (seen.size >= MAX_REMEMBERED) seen.clear();
  }
  seen.set(key, now);
  return true;
};

/** @returns {Promise<Boolean>} whether the view was counted */
const recordView = async (productId, { userId = null, ip = '' } = {}) => {
  const now = Date.now();
  if (!remember(`${userId || ip}:${productId}`, now)) return false;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { status: true, deletedAt: true, store: { select: { ownerId: true } } },
  });
  if (!product || product.deletedAt || product.status !== 'APPROVED') return false;
  if (userId && product.store?.ownerId === userId) return false;
  const day = dayKey(new Date(now));
  await prisma.$executeRaw`
    INSERT INTO product_views (product_id, day, views) VALUES (${productId}, ${day}, 1)
    ON DUPLICATE KEY UPDATE views = views + 1`;
  return true;
};

/**
 * Per product in a shop over a window: views, orders, units and conversion
 * (orders per 100 views), most viewed first.
 */
const funnelForStore = async (storeId, from, to, limit = 30) => {
  const views = await prisma.$queryRaw`
    SELECT pv.product_id AS productId, CAST(SUM(pv.views) AS UNSIGNED) AS views
    FROM product_views pv JOIN products p ON p.id = pv.product_id
    WHERE p.store_id = ${storeId} AND pv.day BETWEEN ${dayKey(from)} AND ${dayKey(to)}
    GROUP BY pv.product_id ORDER BY views DESC LIMIT ${limit}`;
  const ids = views.map((v) => v.productId);
  if (!ids.length) return { totalViews: 0, products: [] };
  const [sales, products, total] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: ids }, order: { storeId, status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } } },
      _count: { orderId: true },
      _sum: { quantity: true },
    }),
    prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, images: true } }),
    prisma.$queryRaw`
      SELECT CAST(COALESCE(SUM(pv.views), 0) AS UNSIGNED) AS views
      FROM product_views pv JOIN products p ON p.id = pv.product_id
      WHERE p.store_id = ${storeId} AND pv.day BETWEEN ${dayKey(from)} AND ${dayKey(to)}`,
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const salesById = new Map(sales.map((s) => [s.productId, s]));
  return {
    totalViews: Number(total[0]?.views || 0),
    products: views.map((v) => {
      const p = byId.get(v.productId) || {};
      const s = salesById.get(v.productId);
      const viewCount = Number(v.views);
      const orders = s?._count?.orderId || 0;
      return {
        id: v.productId,
        name: p.name || 'Product',
        slug: p.slug || null,
        image: Array.isArray(p.images) ? p.images[0] || null : null,
        views: viewCount,
        orders,
        units: Number(s?._sum?.quantity || 0),
        conversion: viewCount ? Math.round((orders / viewCount) * 1000) / 10 : 0,
      };
    }),
  };
};

module.exports = { recordView, funnelForStore };
