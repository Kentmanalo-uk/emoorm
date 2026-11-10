const prisma = require('../config/database');
const store = require('./store');
const { dayKey } = require('../utils/manilaTime');

/**
 * Module 04, buyer groups (ML_DOC.MD): each shop's buyers grouped by how
 * recently, how often and how much they buy (RFM), worked out monthly.
 *
 * The groups are fixed rules, not clusters (the blueprint's deterministic
 * fallback; k-means would need far more buyers per shop than any shop has):
 *
 *   inactive     last order over 120 days ago
 *   new          first and only order in the last 30 days
 *   frequent     3+ orders, the last within 60 days
 *   high_value   spends in the shop's top quarter, last order within 90 days
 *                (only with 8+ buyers, or a quarter means nothing)
 *   returning    2+ orders, the last within 90 days
 *   occasional   everyone else (one order, 31 to 120 days ago)
 *
 * Only counts and averages leave this module: no buyer is named, and a shop
 * with fewer than 5 buyers gets no groups at all (they would point at people).
 */

const MODEL = 'segmentation';
const TTL_MS = 35 * 24 * 60 * 60 * 1000; // outlives one missed monthly run
const DAY_MS = 24 * 60 * 60 * 1000;
const SETTLED = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];
const LOOKBACK_DAYS = 365;
const MIN_BUYERS = 5;
const MIN_FOR_QUARTILE = 8;
const BATCH = 2000;

const GROUPS = ['new', 'frequent', 'high_value', 'returning', 'occasional', 'inactive'];

/**
 * Group one shop's buyers.
 * @param {Array<{ recencyDays, frequency, monetary, firstDays }>} buyers
 * @returns {{ groups: Object, buyers, repeatRate, avgOrders, avgSpend } | null}
 */
const groupBuyers = (buyers) => {
  if (buyers.length < MIN_BUYERS) return null;
  const spend = buyers.map((b) => b.monetary).sort((a, b) => a - b);
  const q3 = buyers.length >= MIN_FOR_QUARTILE ? spend[Math.floor(spend.length * 0.75)] : Infinity;
  const groups = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const b of buyers) {
    let g;
    if (b.recencyDays > 120) g = 'inactive';
    else if (b.frequency === 1 && b.firstDays <= 30) g = 'new';
    else if (b.frequency >= 3 && b.recencyDays <= 60) g = 'frequent';
    else if (b.monetary >= q3 && b.recencyDays <= 90) g = 'high_value';
    else if (b.frequency >= 2 && b.recencyDays <= 90) g = 'returning';
    else g = 'occasional';
    groups[g] += 1;
  }
  const round = (v) => Math.round(v * 100) / 100;
  return {
    buyers: buyers.length,
    groups,
    repeatRate: round(buyers.filter((b) => b.frequency >= 2).length / buyers.length),
    avgOrders: round(buyers.reduce((s, b) => s + b.frequency, 0) / buyers.length),
    avgSpend: round(buyers.reduce((s, b) => s + b.monetary, 0) / buyers.length),
  };
};

/** New and returning buyers per month for the last 6 months (counts only). */
const monthly = (orders, now = new Date()) => {
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getTime() + 8 * 3600e3);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const firstMonth = new Map();
  const seen = new Map(months.map((m) => [m, { new: new Set(), returning: new Set() }]));
  for (const o of [...orders].sort((a, b) => a.createdAt - b.createdAt)) {
    const m = dayKey(o.createdAt).slice(0, 7);
    if (!firstMonth.has(o.buyerId)) firstMonth.set(o.buyerId, m);
    const bucket = seen.get(m);
    if (!bucket) continue;
    (firstMonth.get(o.buyerId) === m ? bucket.new : bucket.returning).add(o.buyerId);
  }
  return months.map((m) => ({ month: m, new: seen.get(m).new.size, returning: seen.get(m).returning.size }));
};

/** The monthly job. */
const run = async (ctx) => {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const byShop = new Map(); // storeId -> orders
  let cursor = null;
  let read = 0;
  for (;;) {
    if (ctx.timeLeft() < 1500) throw new Error('Ran out of time reading orders');
    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.order.findMany({
      where: { status: { in: SETTLED }, createdAt: { gte: since } },
      select: {
        id: true, storeId: true, buyerId: true, total: true, createdAt: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const o of rows) {
      if (!byShop.has(o.storeId)) byShop.set(o.storeId, []);
      byShop.get(o.storeId).push(o);
    }
    read += rows.length;
    if (rows.length < BATCH) break;
    cursor = rows[rows.length - 1].id;
  }

  const now = Date.now();
  const out = [];
  let grouped = 0;
  for (const [storeId, orders] of byShop) {
    const people = new Map();
    for (const o of orders) {
      const p = people.get(o.buyerId) || { first: o.createdAt, last: o.createdAt, frequency: 0, monetary: 0 };
      if (o.createdAt < p.first) p.first = o.createdAt;
      if (o.createdAt > p.last) p.last = o.createdAt;
      p.frequency += 1;
      p.monetary += Number(o.total) || 0;
      people.set(o.buyerId, p);
    }
    const buyers = [...people.values()].map((p) => ({
      recencyDays: (now - p.last.getTime()) / DAY_MS,
      firstDays: (now - p.first.getTime()) / DAY_MS,
      frequency: p.frequency,
      monetary: p.monetary,
    }));
    const summary = groupBuyers(buyers);
    if (summary) grouped += 1;
    out.push({
      entityType: 'store',
      entityId: storeId,
      value: summary
        ? { status: 'ok', ...summary, months: monthly(orders) }
        : { status: 'insufficient', buyers: buyers.length, needs: MIN_BUYERS, months: monthly(orders) },
    });
  }
  const metrics = { orders: read, shops: out.length, shopsGrouped: grouped };
  if (!out.length) return { skipped: true, reason: 'No completed orders in the last year', rowsRead: read, metrics };
  const version = await store.createVersion(MODEL, {
    algorithm: 'RFM rules (recency, frequency, monetary)',
    params: {
      lookbackDays: LOOKBACK_DAYS, minBuyers: MIN_BUYERS, minForQuartile: MIN_FOR_QUARTILE, groups: GROUPS,
    },
    metrics,
  });
  const written = await store.replacePredictions(MODEL, 'segments', version.version, out, TTL_MS);
  await store.activateVersion(MODEL, version.version);
  return {
    rowsRead: read, rowsWritten: written, metrics, modelVersion: version.version,
  };
};

/** A shop's groups (or null when none are stored). */
const segmentsFor = async (storeId) => (await store.getPrediction(MODEL, 'segments', 'store', storeId))?.value || null;

module.exports = {
  run, groupBuyers, monthly, segmentsFor, GROUPS, MIN_BUYERS, MODEL,
};
