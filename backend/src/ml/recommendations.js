const prisma = require('../config/database');
const store = require('./store');
const { memo } = require('./memo');
const { loadCatalog, documentOf } = require('./catalog');
const { buildIndex, nearest } = require('./text');
const { dayKey, dayStart } = require('../utils/manilaTime');

/**
 * Module 01, product recommendations (ML_DOC.MD): worked out once a day.
 *
 *   similar   per product, the products most like it: TF-IDF cosine of
 *             their words (name, category, kind, description, shop), plus a
 *             little for the same category, a close price and the same town.
 *             At most 4 from one shop, so the list is not one shop's catalogue.
 *   trending  the products whose engagement grew over the last two weeks
 *             against the two before: views, cart adds, saves and units
 *             ordered (real counts only; nothing qualifies without them).
 *
 * For You blends both in (services/recommendation.service, guarded); the
 * product page and Home read them through /api/ml/recommendations/*.
 */

const MODEL = 'recommendations';
const TTL_MS = 2 * 24 * 60 * 60 * 1000; // outlives one missed daily run

const SIMILAR = {
  keep: 12, perShop: 4, candidates: 60, minScore: 0.12, sameCategoryPool: 30,
  weights: {
    text: 0.75, category: 0.15, price: 0.07, town: 0.03,
  },
};
const TRENDING = {
  days: 14,
  keep: 30,
  // What each kind of engagement is worth.
  weights: {
    view: 1, cart: 3, favorite: 2, unit: 5,
  },
  // A product needs this much engagement in the last two weeks to trend.
  minRecent: 6,
  // A list shorter than this is not shown (one product is not a trend).
  minProducts: 3,
};

const num = (v) => Number(v || 0);
const priceOf = (p) => (num(p.salePrice) > 0 && num(p.salePrice) < num(p.price) ? num(p.salePrice) : num(p.price));

/** 1 when two prices are the same, 0 when one is four times the other or more. */
const priceCloseness = (a, b) => {
  if (!(a > 0) || !(b > 0)) return 0;
  return Math.max(0, 1 - Math.abs(Math.log(a / b)) / Math.log(4));
};

/**
 * Each product's similar products, best first.
 * @param {Array} catalog - from loadCatalog
 * @param {Function} [timeLeft] - stop (throw) when the run's budget is nearly gone
 * @returns {{ lists: Map<string, Array<[string, number]>>, vocabulary: number }}
 */
const similarLists = (catalog, timeLeft = () => Infinity) => {
  const index = buildIndex(catalog.map(documentOf));
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const byCategory = new Map();
  for (const p of catalog) {
    if (!byCategory.has(p.categoryId)) byCategory.set(p.categoryId, []);
    if (byCategory.get(p.categoryId).length < SIMILAR.sameCategoryPool) byCategory.get(p.categoryId).push(p.id);
  }
  const w = SIMILAR.weights;
  const lists = new Map();
  catalog.forEach((p, i) => {
    if (i % 200 === 0 && timeLeft() < 1500) throw new Error('Ran out of time working out similar products');
    const text = new Map(nearest(index, index.vectors.get(p.id), { limit: SIMILAR.candidates, exclude: p.id }));
    const candidates = new Set([...text.keys(), ...(byCategory.get(p.categoryId) || [])]);
    candidates.delete(p.id);
    const scored = [...candidates].map((id) => {
      const q = byId.get(id);
      const score = w.text * (text.get(id) || 0)
        + w.category * (q.categoryId === p.categoryId ? 1 : 0)
        + w.price * priceCloseness(priceOf(p), priceOf(q))
        + w.town * (q.municipalityId && q.municipalityId === p.municipalityId ? 1 : 0);
      return [id, Math.round(score * 1000) / 1000];
    }).filter(([, s]) => s >= SIMILAR.minScore)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const perShop = new Map();
    const kept = [];
    for (const [id, s] of scored) {
      const shop = byId.get(id).storeId;
      if ((perShop.get(shop) || 0) >= SIMILAR.perShop) continue;
      perShop.set(shop, (perShop.get(shop) || 0) + 1);
      kept.push([id, s]);
      if (kept.length >= SIMILAR.keep) break;
    }
    if (kept.length) lists.set(p.id, kept);
  });
  return { lists, vocabulary: index.idf.size };
};

/** Engagement per product in a Manila-day range: weighted sum. */
const DAY_MS = 24 * 60 * 60 * 1000;
const engagement = async (ids, fromDay, toDay) => {
  // DATE columns (Manila days, stored as plain dates) compare as UTC midnight;
  // order times are instants, so those take the Manila day's real start.
  const fromDate = new Date(`${fromDay}T00:00:00.000Z`);
  const toDate = new Date(new Date(`${toDay}T00:00:00.000Z`).getTime() + DAY_MS);
  const from = dayStart(fromDay);
  const to = new Date(dayStart(toDay).getTime() + DAY_MS);
  const [views, counts, units] = await Promise.all([
    prisma.productView.groupBy({
      by: ['productId'], where: { productId: { in: ids }, day: { gte: fromDate, lt: toDate } }, _sum: { views: true },
    }),
    prisma.mlEventCount.groupBy({
      by: ['productId', 'eventType'],
      where: { productId: { in: ids }, eventType: { in: ['cart_add', 'favorite_add'] }, day: { gte: fromDate, lt: toDate } },
      _sum: { count: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: ids }, order: { createdAt: { gte: from, lt: to }, status: { not: 'CANCELLED' } } },
      _sum: { quantity: true },
    }),
  ]);
  const w = TRENDING.weights;
  const out = new Map();
  const add = (id, amount) => out.set(id, (out.get(id) || 0) + amount);
  views.forEach((r) => add(r.productId, w.view * num(r._sum.views)));
  counts.forEach((r) => add(r.productId, (r.eventType === 'cart_add' ? w.cart : w.favorite) * num(r._sum.count)));
  units.forEach((r) => add(r.productId, w.unit * num(r._sum.quantity)));
  return out;
};

/**
 * The trending list: engagement in the last two weeks, more for growth over
 * the two before. Empty when too few products qualify.
 */
const trendingList = async (catalog, now = new Date()) => {
  const ids = catalog.map((p) => p.id);
  const day = (back) => dayKey(new Date(now.getTime() - back * 24 * 60 * 60 * 1000));
  const d = TRENDING.days;
  const [recent, prior] = await Promise.all([
    engagement(ids, day(d - 1), day(0)),
    engagement(ids, day(2 * d - 1), day(d)),
  ]);
  const scored = [...recent]
    .filter(([, r]) => r >= TRENDING.minRecent)
    .map(([id, r]) => {
      const before = prior.get(id) || 0;
      const growth = Math.max(-0.5, Math.min(2, (r - before) / (before + 5)));
      return [id, Math.round(r * (1 + growth) * 100) / 100];
    })
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, TRENDING.keep);
  return { list: scored.length >= TRENDING.minProducts ? scored : [], qualified: scored.length };
};

/** The daily job. */
const run = async (ctx) => {
  const catalog = await loadCatalog();
  if (catalog.length < 2) return { skipped: true, reason: 'Fewer than 2 products to compare', rowsRead: catalog.length };
  const { lists, vocabulary } = similarLists(catalog, ctx.timeLeft);
  const trending = await trendingList(catalog);

  const tops = [...lists.values()].map((l) => l[0][1]);
  const metrics = {
    products: catalog.length,
    vocabulary,
    coverage: Math.round((lists.size / catalog.length) * 1000) / 1000,
    avgTopScore: tops.length ? Math.round((tops.reduce((a, b) => a + b, 0) / tops.length) * 1000) / 1000 : 0,
    trending: trending.list.length,
    trendingQualified: trending.qualified,
  };
  if (!lists.size) return { skipped: true, reason: 'No two products are alike enough yet', rowsRead: catalog.length, metrics };

  const version = await store.createVersion(MODEL, {
    algorithm: 'TF-IDF cosine + category/price/town; weighted engagement growth',
    params: { similar: SIMILAR, trending: TRENDING },
    metrics,
  });
  const similarRows = [...lists].map(([id, list]) => ({
    entityType: 'product', entityId: id, value: { ids: list.map(([x]) => x), scores: list.map(([, s]) => s) },
  }));
  let written = await store.replacePredictions(MODEL, 'similar', version.version, similarRows, TTL_MS);
  written += await store.replacePredictions(MODEL, 'trending', version.version, [{
    entityType: 'all', entityId: 'all', value: { ids: trending.list.map(([x]) => x), scores: trending.list.map(([, s]) => s) },
  }], TTL_MS);
  await store.activateVersion(MODEL, version.version);
  cache.clear();
  return {
    rowsRead: catalog.length, rowsWritten: written, metrics, modelVersion: version.version,
  };
};

// ── Reading ─────────────────────────────────────────────────────────────────

const cache = memo({ ttlMs: 5 * 60 * 1000, max: 2000 });

/** A product's similar product ids (best first), or null when none is stored. */
const similarIds = (productId) => cache.get(`s:${productId}`, async () => {
  const hit = await store.getPrediction(MODEL, 'similar', 'product', productId);
  return hit ? hit.value.ids : null;
});

/** The trending product ids, best first (empty when nothing trends). */
const trendingIds = () => cache.get('trending', async () => {
  const hit = await store.getPrediction(MODEL, 'trending', 'all', 'all');
  return hit ? hit.value.ids : [];
});

/**
 * For You: how related each product is to what this person engaged with
 * (0..1), from the similar lists of those products, nearer ones counting more.
 * @param {string[]} signalIds - products they ordered, carted, saved or viewed, strongest first
 */
const relatedScores = async (signalIds) => {
  const seeds = [...new Set(signalIds)].slice(0, 20);
  const lists = await store.getPredictions(MODEL, 'similar', 'product', seeds);
  const out = new Map();
  seeds.forEach((seed, i) => {
    const value = lists.get(seed);
    if (!value) return;
    const fade = 0.9 ** i;
    value.ids.forEach((id, j) => out.set(id, Math.max(out.get(id) || 0, value.scores[j] * fade)));
  });
  const top = Math.max(0, ...out.values());
  if (top > 0) for (const [id, s] of out) out.set(id, s / top);
  return out;
};

module.exports = {
  run, similarIds, trendingIds, relatedScores, similarLists, trendingList, priceCloseness, SIMILAR, TRENDING, MODEL,
};
