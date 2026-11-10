const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const productRepository = require('../repositories/product.repository');
const settings = require('./settings');
const recommendations = require('./recommendations');
const bundles = require('./bundles');
const { cardsFor } = require('./catalog');
const { guard } = require('./safe');

/**
 * What buyers and sellers get from the engine (routes/ml.routes.js). Every
 * answer works with the engine off or failing: "Similar items" falls back to
 * the product's category (what the product page showed before), the others
 * come back empty and the page leaves their row out. `source` says which:
 * 'ml', 'category' (the fallback) or 'none'.
 */

const ID = /^[\w-]{1,64}$/;
const clampLimit = (v, d, max) => Math.min(max, Math.max(1, parseInt(v, 10) || d));
const idOrThrow = (id) => {
  if (!ID.test(String(id || ''))) throw new ApiError('Product not found', 404);
  return String(id);
};

/** "Similar items" for a product page. */
const similar = async (rawId, rawLimit) => {
  const productId = idOrThrow(rawId);
  const limit = clampLimit(rawLimit, 12, 24);
  const fromMl = await guard('similar', async () => {
    if (!(await settings.isOn('recommendations'))) return null;
    const ids = await recommendations.similarIds(productId);
    if (!ids?.length) return null;
    const products = await cardsFor(ids.slice(0, limit));
    return products.length ? products : null;
  }, null, 1500);
  if (fromMl) return { products: fromMl, source: 'ml' };

  // As before: the same category, best sellers first.
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true } });
  if (!product) return { products: [], source: 'none' };
  const rows = await productRepository.findRecommendable({
    where: { categoryId: product.categoryId, id: { not: productId } }, take: limit, orderBy: { soldCount: 'desc' },
  });
  return { products: await cardsFor(rows.map((r) => r.id)), source: 'category' };
};

/** Home's trending row (empty: no row). */
const trending = async (rawLimit) => {
  const limit = clampLimit(rawLimit, 12, 30);
  const products = await guard('trending', async () => {
    if (!(await settings.isOn('recommendations'))) return [];
    const ids = await recommendations.trendingIds();
    return ids.length ? cardsFor(ids.slice(0, limit)) : [];
  }, [], 1500);
  return { products, source: products.length ? 'ml' : 'none' };
};

/** "Often bought together" for a product page (empty: no row). */
const together = async (rawId, rawLimit) => {
  const productId = idOrThrow(rawId);
  const limit = clampLimit(rawLimit, 6, 12);
  const result = await guard('together', async () => {
    if (!(await settings.isOn('bundles'))) return null;
    const rules = (await bundles.togetherFor(productId)).slice(0, limit);
    if (!rules.length) return null;
    const products = await cardsFor(rules.map((r) => r.id));
    const byId = new Map(rules.map((r) => [r.id, r]));
    return products.map((p) => ({ ...p, bundle: { confidence: byId.get(p.id).confidence, lift: byId.get(p.id).lift } }));
  }, null, 1500);
  return { products: result || [], source: result ? 'ml' : 'none' };
};

/** The cart's "Goes well with": bought with what is in it (empty: the cart keeps its usual suggestions). */
const forCart = async (rawIds, rawLimit) => {
  const ids = [...new Set(String(rawIds || '').split(','))].filter((id) => ID.test(id)).slice(0, 50);
  const limit = clampLimit(rawLimit, 8, 20);
  const products = await guard('cart', async () => {
    if (!ids.length || !(await settings.isOn('bundles'))) return [];
    const rules = (await bundles.forCart(ids)).slice(0, limit);
    return rules.length ? cardsFor(rules.map((r) => r.id)) : [];
  }, [], 1500);
  return { products, source: products.length ? 'ml' : 'none' };
};

/**
 * A seller's bundle ideas: pairs of their own products bought together, and
 * how much there is to learn from so far. Only their own shop.
 */
const myBundleIdeas = async (userId) => {
  const shop = await prisma.store.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (!shop) throw new ApiError('You do not have a store', 404);
  const on = await settings.isOn('bundles');
  const [ideas, counted] = await Promise.all([
    on ? guard('ideas', () => bundles.ideasFor(shop.id), [], 1500) : [],
    // Orders of this shop with two or more different products: what ideas come from.
    prisma.$queryRaw`
      SELECT COUNT(*) AS n FROM (
        SELECT o.id FROM orders o JOIN order_items i ON i.order_id = o.id
        WHERE o.store_id = ${shop.id} AND o.status IN ('COMPLETED', 'DELIVERED', 'PICKED_UP')
        GROUP BY o.id HAVING COUNT(DISTINCT i.product_id) >= 2
      ) t`,
  ]);
  const cards = await cardsFor([...new Set(ideas.flatMap((i) => i.ids))]);
  const byId = new Map(cards.map((p) => [p.id, p]));
  return {
    on,
    ideas: ideas
      .filter((i) => i.ids.every((id) => byId.has(id)))
      .map((i) => ({
        products: i.ids.map((id) => byId.get(id)), orders: i.pairs, support: i.support, confidence: i.confidence, lift: i.lift,
      })),
    ordersWithTwoOrMore: Number(counted?.[0]?.n || 0),
    needed: { basketsOverall: bundles.LIMITS.minBaskets, timesTogether: bundles.LIMITS.minPairs },
  };
};

module.exports = {
  similar, trending, together, forCart, myBundleIdeas,
};
