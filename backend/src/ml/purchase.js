const prisma = require('../config/database');
const store = require('./store');

/**
 * Module 05, purchase prediction (ML_DOC.MD): the chance that a buyer orders
 * a product within 14 days, by logistic regression on the buyer's own order
 * history. Worked out weekly, used for nothing that a buyer sees yet: never
 * to change a price, and never to send more messages (the blueprint's rule).
 *
 * The engine stores no per-person views or searches (the owner chose totals
 * only), and carts and favourites have no history, so what it can learn from
 * is orders. Each example is a (buyer, product) pair at the time of one of
 * the buyer's orders:
 *
 *   positive   the product they ordered then
 *   negatives  3 other products, picked at random, they did not order then
 *
 * Features, as they were just before that order (no look-ahead):
 *   catOrders   their earlier orders in the product's category (log)
 *   shopOrders  their earlier orders from its shop (log)
 *   rebuy       they had ordered this exact product before (0/1)
 *   popularity  units of it anyone had ordered before (log)
 *   priceRatio  its price against their usual item price (log)
 *   sameTown    its town is theirs (0/1)
 *
 * Training: standardised features, L2-regularised gradient descent. Checked
 * on the latest 20% of examples (time split) by AUC and log loss, against
 * popularity alone. Below 200 positive examples nothing is trained, and the
 * answer says so; a model that does not beat popularity is not used.
 */

const MODEL = 'purchasePrediction';
const DAY_MS = 24 * 60 * 60 * 1000;
const FEATURES = ['catOrders', 'shopOrders', 'rebuy', 'popularity', 'priceRatio', 'sameTown'];
const LIMITS = {
  minPositives: 200, negativesPerPositive: 3, historyDays: 365, windowDays: 14, minAuc: 0.6, beatBy: 0.02,
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** A small seeded random number generator, so a run can be repeated exactly. */
const rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

/** Area under the ROC curve: the chance a positive is scored above a negative. */
const auc = (scores, labels) => {
  // Rank-sum (Mann-Whitney), ties sharing their average rank.
  const pairs = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
  let sumPos = 0;
  let pos = 0;
  for (let i = 0; i < pairs.length;) {
    let j = i;
    while (j < pairs.length && pairs[j][0] === pairs[i][0]) j += 1;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k += 1) {
      if (pairs[k][1]) {
        sumPos += avg;
        pos += 1;
      }
    }
    i = j;
  }
  const neg = pairs.length - pos;
  if (!pos || !neg) return null;
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
};

const logLoss = (probs, labels) => {
  const eps = 1e-9;
  return -probs.reduce((s, p, i) => s + (labels[i] ? Math.log(p + eps) : Math.log(1 - p + eps)), 0) / probs.length;
};

/** Fit a logistic regression. X: rows of numbers; y: 0/1. */
const fit = (X, y, { iterations = 400, rate = 0.3, l2 = 0.01 } = {}) => {
  const n = X.length;
  const d = X[0].length;
  const means = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n);
  const stds = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - means[j]) ** 2, 0) / n) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < iterations; it += 1) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i += 1) {
      const err = sigmoid(b + Z[i].reduce((s, v, j) => s + v * w[j], 0)) - y[i];
      for (let j = 0; j < d; j += 1) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j += 1) w[j] -= rate * (gw[j] / n + l2 * w[j]);
    b -= rate * (gb / n);
  }
  return {
    weights: w, bias: b, means, stds,
  };
};

const predict = (model, x) => sigmoid(model.bias + x.reduce((s, v, j) => s + ((v - model.means[j]) / model.stds[j]) * model.weights[j], 0));

/** A feature row from counts. */
const row = (f) => [
  Math.log1p(f.catOrders), Math.log1p(f.shopOrders), f.rebuy ? 1 : 0, Math.log1p(f.popularity),
  f.usualPrice > 0 && f.price > 0 ? Math.log(f.price / f.usualPrice) : 0, f.sameTown ? 1 : 0,
];

/** The examples, from order history (oldest first). */
const examples = async (timeLeft) => {
  const since = new Date(Date.now() - LIMITS.historyDays * DAY_MS);
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } },
    select: {
      productId: true, quantity: true, price: true,
      order: { select: { buyerId: true, createdAt: true, buyer: { select: { municipalityId: true } } } },
    },
    take: 50000,
  });
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true, categoryId: true, storeId: true, municipalityId: true, price: true,
    },
    take: 20000,
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const events = items
    .filter((i) => byId.has(i.productId))
    .map((i) => ({
      buyerId: i.order.buyerId, town: i.order.buyer?.municipalityId, at: i.order.createdAt.getTime(), p: byId.get(i.productId), price: Number(i.price) || 0, qty: i.quantity || 1,
    }))
    .sort((a, b) => a.at - b.at);
  const positives = events.length;
  if (positives < LIMITS.minPositives) return { positives, rows: [] };

  // Running tallies, so each example sees only what came before it.
  const cat = new Map(); // buyer|category -> orders
  const shop = new Map(); // buyer|store -> orders
  const bought = new Set(); // buyer|product
  const sold = new Map(); // product -> units
  const spend = new Map(); // buyer -> [sum, count]
  const random = rng(42);
  const out = [];
  events.forEach((e, idx) => {
    if (idx % 500 === 0 && timeLeft() < 3000) throw new Error('Ran out of time building examples');
    const featuresFor = (p) => {
      const [sum, count] = spend.get(e.buyerId) || [0, 0];
      return row({
        catOrders: cat.get(`${e.buyerId}|${p.categoryId}`) || 0,
        shopOrders: shop.get(`${e.buyerId}|${p.storeId}`) || 0,
        rebuy: bought.has(`${e.buyerId}|${p.id}`),
        popularity: sold.get(p.id) || 0,
        price: Number(p.price) || 0,
        usualPrice: count ? sum / count : 0,
        sameTown: p.municipalityId && p.municipalityId === e.town,
      });
    };
    out.push({ at: e.at, x: featuresFor(e.p), y: 1 });
    for (let k = 0; k < LIMITS.negativesPerPositive; k += 1) {
      const p = products[Math.floor(random() * products.length)];
      if (p.id !== e.p.id) out.push({ at: e.at, x: featuresFor(p), y: 0 });
    }
    const add = (m, key, v = 1) => m.set(key, (m.get(key) || 0) + v);
    add(cat, `${e.buyerId}|${e.p.categoryId}`);
    add(shop, `${e.buyerId}|${e.p.storeId}`);
    bought.add(`${e.buyerId}|${e.p.id}`);
    add(sold, e.p.id, e.qty);
    const [s, c] = spend.get(e.buyerId) || [0, 0];
    spend.set(e.buyerId, [s + e.price, c + 1]);
  });
  return { positives, rows: out };
};

/** The weekly job. */
const run = async (ctx) => {
  const { positives, rows } = await examples(ctx.timeLeft);
  if (!rows.length) {
    return {
      skipped: true,
      reason: `Only ${positives} past purchases to learn from; purchase prediction needs ${LIMITS.minPositives}`,
      rowsRead: positives,
      metrics: { positives, needs: LIMITS.minPositives },
    };
  }
  const cut = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, cut);
  const test = rows.slice(cut);
  const model = fit(train.map((r) => r.x), train.map((r) => r.y));
  const labels = test.map((r) => r.y);
  const probs = test.map((r) => predict(model, r.x));
  const base = train.reduce((s, r) => s + r.y, 0) / train.length;
  const metrics = {
    examples: rows.length,
    positives,
    auc: auc(probs, labels),
    popularityAuc: auc(test.map((r) => r.x[FEATURES.indexOf('popularity')]), labels),
    logLoss: logLoss(probs, labels),
    baseRateLogLoss: logLoss(test.map(() => base), labels),
  };
  for (const k of ['auc', 'popularityAuc', 'logLoss', 'baseRateLogLoss']) metrics[k] = metrics[k] == null ? null : Math.round(metrics[k] * 1000) / 1000;
  const passed = metrics.auc != null && metrics.auc >= LIMITS.minAuc && metrics.auc >= (metrics.popularityAuc ?? 0) + LIMITS.beatBy;
  const version = await store.createVersion(MODEL, {
    algorithm: 'Logistic regression on order history',
    params: { ...model, features: FEATURES, windowDays: LIMITS.windowDays },
    metrics: { ...metrics, passed },
  });
  if (!passed) {
    return {
      skipped: true,
      reason: `AUC ${metrics.auc} does not beat popularity alone (${metrics.popularityAuc}); not used`,
      rowsRead: positives,
      metrics,
      modelVersion: version.version,
    };
  }
  await store.activateVersion(MODEL, version.version);
  return {
    rowsRead: positives, rowsWritten: 0, metrics, modelVersion: version.version,
  };
};

/**
 * One buyer and one product, now.
 * @returns {Promise<Object>} { status: 'ok', probability, windowDays, modelVersion, at } or { status: 'insufficient' }
 */
const probability = async (user, productId) => {
  const active = await store.getActiveVersion(MODEL);
  if (!active?.params?.weights) return { status: 'insufficient', needs: LIMITS.minPositives };
  const p = await prisma.product.findFirst({
    where: { id: String(productId), deletedAt: null },
    select: {
      id: true, categoryId: true, storeId: true, municipalityId: true, price: true,
    },
  });
  if (!p) return null;
  const items = await prisma.orderItem.findMany({
    where: { order: { buyerId: user.id, status: { not: 'CANCELLED' } } },
    select: { productId: true, price: true, product: { select: { categoryId: true, storeId: true } } },
    take: 2000,
  });
  const popularity = await prisma.orderItem.aggregate({
    where: { productId: p.id, order: { status: { not: 'CANCELLED' } } }, _sum: { quantity: true },
  });
  const x = row({
    catOrders: items.filter((i) => i.product?.categoryId === p.categoryId).length,
    shopOrders: items.filter((i) => i.product?.storeId === p.storeId).length,
    rebuy: items.some((i) => i.productId === p.id),
    popularity: popularity._sum.quantity || 0,
    price: Number(p.price) || 0,
    usualPrice: items.length ? items.reduce((s, i) => s + (Number(i.price) || 0), 0) / items.length : 0,
    sameTown: p.municipalityId && p.municipalityId === user.municipalityId,
  });
  return {
    status: 'ok',
    probability: Math.round(predict(active.params, x) * 1000) / 1000,
    windowDays: active.params.windowDays || LIMITS.windowDays,
    modelVersion: active.version,
    at: new Date().toISOString(),
  };
};

module.exports = {
  run, probability, fit, predict, auc, logLoss, row, LIMITS, FEATURES, MODEL,
};
