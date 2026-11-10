const prisma = require('../config/database');

/**
 * Product performance (ML_DOC.MD Phase 3, seller dashboard): a shop's
 * products that buyers look at but rarely order, over the last 30 days, with
 * plain hints a seller can act on. Worked out when asked (a few small
 * queries for one shop), not by a job: there is no model to learn.
 *
 * A product is flagged with 20+ views and no orders, or 30+ views and under
 * half the shop's own view-to-order rate. Nothing is said for a shop with
 * fewer than 50 views in the period. Hints are facts about the listing, not
 * guesses: one photo, a short description, a price well above the median of
 * its category, out of stock.
 */

const DAYS = 30;
const MIN_SHOP_VIEWS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const firstImage = (images) => {
  const list = Array.isArray(images) ? images : [];
  const first = list[0];
  return typeof first === 'string' ? first : first?.url || null;
};

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/**
 * Flag products from their numbers (pure, for tests).
 * @param {Array<{ id, views, orders }>} rows
 */
const flag = (rows) => {
  const views = rows.reduce((s, r) => s + r.views, 0);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  if (views < MIN_SHOP_VIEWS) return { status: 'insufficient', views, needs: MIN_SHOP_VIEWS, flagged: [] };
  const shopRate = orders / views;
  const flagged = rows
    .filter((r) => (r.views >= 20 && r.orders === 0) || (r.views >= 30 && r.orders / r.views < shopRate * 0.5))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
  return {
    status: 'ok', views, shopConversion: Math.round(shopRate * 1000) / 1000, flagged,
  };
};

/** The shop's flagged products with their numbers and hints. */
const forShop = async (storeId, now = new Date()) => {
  const since = new Date(now.getTime() - DAYS * DAY_MS);
  const sinceDay = new Date(`${new Date(since.getTime() + 8 * 3600e3).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null },
    select: {
      id: true, name: true, images: true, description: true, price: true, stock: true, categoryId: true, productType: true, listingKind: true,
    },
  });
  if (!products.length) return { status: 'insufficient', views: 0, needs: MIN_SHOP_VIEWS, flagged: [], days: DAYS };
  const ids = products.map((p) => p.id);
  const [views, carts, orders] = await Promise.all([
    prisma.productView.groupBy({ by: ['productId'], where: { productId: { in: ids }, day: { gte: sinceDay } }, _sum: { views: true } }),
    prisma.mlEventCount.groupBy({
      by: ['productId'], where: { productId: { in: ids }, eventType: 'cart_add', day: { gte: sinceDay } }, _sum: { count: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: ids }, order: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } },
      _count: { orderId: true },
    }),
  ]);
  const get = (list, id, pick) => Number(pick(list.find((r) => r.productId === id)) || 0);
  const rows = products.map((p) => ({
    id: p.id,
    views: get(views, p.id, (r) => r?._sum.views),
    cartAdds: get(carts, p.id, (r) => r?._sum.count),
    orders: get(orders, p.id, (r) => r?._count.orderId),
  }));
  const result = flag(rows);
  if (result.status !== 'ok' || !result.flagged.length) return { ...result, days: DAYS };

  // Each flagged product's category median price, from showable products.
  const byId = new Map(products.map((p) => [p.id, p]));
  const categories = [...new Set(result.flagged.map((r) => byId.get(r.id).categoryId))];
  const peers = await prisma.product.findMany({
    where: {
      categoryId: { in: categories }, deletedAt: null, status: 'APPROVED',
    },
    select: { categoryId: true, price: true },
    take: 5000,
  });
  const medians = new Map(categories.map((c) => [c, median(peers.filter((x) => x.categoryId === c).map((x) => Number(x.price)))]));

  return {
    ...result,
    days: DAYS,
    flagged: result.flagged.map((r) => {
      const p = byId.get(r.id);
      const price = Number(p.price);
      const med = medians.get(p.categoryId);
      const photos = Array.isArray(p.images) ? p.images.length : 0;
      const hints = [];
      if (photos < 2) hints.push('photos');
      if (String(p.description || '').trim().length < 80) hints.push('description');
      if (med && price > med * 1.3) hints.push('price');
      const stocked = p.listingKind === 'REGULAR' && !['COOK_TO_ORDER', 'PACKAGE'].includes(p.productType);
      if (stocked && p.stock <= 0) hints.push('out_of_stock');
      return {
        ...r,
        name: p.name,
        image: firstImage(p.images),
        conversion: r.views ? Math.round((r.orders / r.views) * 1000) / 1000 : 0,
        price,
        categoryMedianPrice: med,
        hints,
      };
    }),
  };
};

module.exports = {
  forShop, flag, DAYS, MIN_SHOP_VIEWS,
};
