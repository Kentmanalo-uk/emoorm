const prisma = require('../config/database');
const store = require('./store');
const { memo } = require('./memo');
const { dayKey } = require('../utils/manilaTime');

/**
 * Module 09, bundles (ML_DOC.MD): products bought together, from completed
 * orders only, worked out once a week.
 *
 * A basket is one buyer's settled orders (completed, delivered or picked up)
 * on one Manila day: a checkout from two shops at once is one basket. For
 * each pair of products in the same basket:
 *
 *   support     share of all baskets with both
 *   confidence  of the baskets with A, the share that also had B
 *   lift        confidence over B's own share: above 1 means "more often
 *               together than by chance"
 *
 * Exact pair counting: with this catalogue it is faster and simpler than
 * Apriori or FP-Growth and gives the same pairs. Nothing is shown below the
 * minimums (enough baskets overall, a pair seen at least twice, lift above 1).
 *
 * Results: "Often bought together" on the product page and in the cart, and
 * bundle ideas for each seller from their own shop's pairs. A seller makes a
 * package themselves; nothing is published for them.
 */

const MODEL = 'bundles';
const TTL_MS = 9 * 24 * 60 * 60 * 1000; // outlives one missed weekly run
const SETTLED = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];
const BATCH = 500;

const LIMITS = {
  minBaskets: 20, // baskets overall before any rule is trusted
  minPairs: 2, // a pair seen once is a coincidence
  minLift: 1.0, // must be more often together than by chance
  minConfidence: 0.1,
  perProduct: 6,
  perShop: 10,
};

const round = (v) => Math.round(v * 1000) / 1000;

/** Every basket, as a set of product ids (read in pages, within the time budget). */
const loadBaskets = async (timeLeft = () => Infinity) => {
  const baskets = new Map(); // `${buyerId}|${day}` -> Set(productId)
  const shopOf = new Map(); // productId -> storeId
  let cursor = null;
  let read = 0;
  for (;;) {
    if (timeLeft() < 1500) throw new Error('Ran out of time reading orders');
    // eslint-disable-next-line no-await-in-loop
    const orders = await prisma.order.findMany({
      where: { status: { in: SETTLED } },
      select: {
        id: true, buyerId: true, createdAt: true, storeId: true, items: { select: { productId: true } },
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const o of orders) {
      const key = `${o.buyerId}|${dayKey(o.createdAt)}`;
      if (!baskets.has(key)) baskets.set(key, new Set());
      for (const item of o.items) {
        if (!item.productId) continue;
        baskets.get(key).add(item.productId);
        shopOf.set(item.productId, o.storeId);
      }
    }
    read += orders.length;
    if (orders.length < BATCH) break;
    cursor = orders[orders.length - 1].id;
  }
  return { baskets: [...baskets.values()].filter((b) => b.size), shopOf, ordersRead: read };
};

/**
 * Rules from baskets.
 * @returns {{ rules: Map<string, Array>, pairs: Array, single: Map }}
 *   rules: product -> [{ id, support, confidence, lift, pairs }] best first;
 *   pairs: every kept unordered pair
 */
const mine = (baskets, limits = LIMITS) => {
  const n = baskets.length;
  const single = new Map();
  const pairCounts = new Map();
  for (const basket of baskets) {
    const items = [...basket].sort();
    for (const a of items) single.set(a, (single.get(a) || 0) + 1);
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const key = `${items[i]}|${items[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }
  const rules = new Map();
  const pairs = [];
  for (const [key, count] of pairCounts) {
    if (count < limits.minPairs) continue;
    const [a, b] = key.split('|');
    const support = count / n;
    const side = (x, y) => {
      const confidence = count / single.get(x);
      const lift = confidence / (single.get(y) / n);
      return { confidence, lift };
    };
    const ab = side(a, b);
    const ba = side(b, a);
    if (ab.lift <= limits.minLift) continue; // lift is the same both ways
    const keep = (x, y, s) => {
      if (s.confidence < limits.minConfidence) return;
      if (!rules.has(x)) rules.set(x, []);
      rules.get(x).push({
        id: y, support: round(support), confidence: round(s.confidence), lift: round(s.lift), pairs: count,
      });
    };
    keep(a, b, ab);
    keep(b, a, ba);
    pairs.push({
      ids: [a, b], pairs: count, support: round(support), confidence: round(Math.max(ab.confidence, ba.confidence)), lift: round(ab.lift),
    });
  }
  for (const [x, list] of rules) {
    list.sort((p, q) => q.confidence * q.lift - p.confidence * p.lift || q.pairs - p.pairs);
    rules.set(x, list.slice(0, limits.perProduct));
  }
  return { rules, pairs, single };
};

/** The weekly job. */
const run = async (ctx) => {
  const { baskets, shopOf, ordersRead } = await loadBaskets(ctx.timeLeft);
  const multi = baskets.filter((b) => b.size >= 2).length;
  const metrics = { orders: ordersRead, baskets: baskets.length, multiItemBaskets: multi };
  if (baskets.length < LIMITS.minBaskets) {
    return {
      skipped: true, reason: `Only ${baskets.length} completed baskets so far; bundles need ${LIMITS.minBaskets}`, rowsRead: ordersRead, metrics,
    };
  }
  const { rules, pairs } = mine(baskets);
  metrics.rules = [...rules.values()].reduce((s, l) => s + l.length, 0);
  metrics.pairs = pairs.length;

  // Each shop's own pairs: both products from that shop.
  const byShop = new Map();
  for (const pair of pairs) {
    const [a, b] = pair.ids;
    const shop = shopOf.get(a);
    if (!shop || shop !== shopOf.get(b)) continue;
    if (!byShop.has(shop)) byShop.set(shop, []);
    byShop.get(shop).push(pair);
  }
  for (const [shop, list] of byShop) {
    byShop.set(shop, list.sort((p, q) => q.pairs - p.pairs || q.lift - p.lift).slice(0, LIMITS.perShop));
  }

  const version = await store.createVersion(MODEL, { algorithm: 'Pair counting (support, confidence, lift)', params: { limits: LIMITS }, metrics });
  let written = await store.replacePredictions(MODEL, 'together', version.version,
    [...rules].map(([id, list]) => ({ entityType: 'product', entityId: id, value: { rules: list } })), TTL_MS);
  written += await store.replacePredictions(MODEL, 'store_bundles', version.version,
    [...byShop].map(([id, list]) => ({ entityType: 'store', entityId: id, value: { ideas: list } })), TTL_MS);
  await store.activateVersion(MODEL, version.version);
  cache.clear();
  return {
    rowsRead: ordersRead, rowsWritten: written, metrics, modelVersion: version.version,
  };
};

// ── Reading ─────────────────────────────────────────────────────────────────

const cache = memo({ ttlMs: 5 * 60 * 1000, max: 2000 });

/** "Often bought together" for one product: its rules, best first (or []). */
const togetherFor = (productId) => cache.get(`t:${productId}`, async () => {
  const hit = await store.getPrediction(MODEL, 'together', 'product', productId);
  return hit ? hit.value.rules : [];
});

/** For a cart: products bought with what is in it, best first, not already in it. */
const forCart = async (productIds) => {
  const inCart = new Set(productIds);
  const lists = await store.getPredictions(MODEL, 'together', 'product', [...inCart]);
  const best = new Map();
  for (const value of lists.values()) {
    for (const r of value.rules) {
      if (inCart.has(r.id)) continue;
      const score = r.confidence * r.lift;
      if (!best.has(r.id) || best.get(r.id).score < score) best.set(r.id, { ...r, score });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
};

/** A shop's own bundle ideas (or []). */
const ideasFor = async (storeId) => {
  const hit = await store.getPrediction(MODEL, 'store_bundles', 'store', storeId);
  return hit ? hit.value.ideas : [];
};

module.exports = {
  run, mine, loadBaskets, togetherFor, forCart, ideasFor, LIMITS, MODEL,
};
