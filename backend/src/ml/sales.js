const prisma = require('../config/database');
const { dayKey } = require('../utils/manilaTime');

/**
 * Units ordered per product per Manila day: demand, for forecasts and stock
 * risk. Every order counts except cancelled ones (a pending order is still
 * demand); read in pages within the job's time budget.
 */

const BATCH = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Object} opts
 * @param {number} opts.days - how far back
 * @param {string[]} [opts.productIds] - only these (all when left out)
 * @param {Function} [opts.timeLeft]
 * @returns {Promise<Map<string, Map<string, number>>>} productId -> day -> units
 */
const dailyUnits = async ({ days, productIds, timeLeft = () => Infinity, now = new Date() }) => {
  const since = new Date(now.getTime() - days * DAY_MS);
  const out = new Map();
  let cursor = null;
  for (;;) {
    if (timeLeft() < 1500) throw new Error('Ran out of time reading sales');
    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.orderItem.findMany({
      where: {
        ...(productIds ? { productId: { in: productIds } } : {}),
        order: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      },
      select: {
        id: true, productId: true, quantity: true, order: { select: { createdAt: true } },
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const r of rows) {
      if (!r.productId) continue;
      if (!out.has(r.productId)) out.set(r.productId, new Map());
      const day = dayKey(r.order.createdAt);
      const m = out.get(r.productId);
      m.set(day, (m.get(day) || 0) + (r.quantity || 0));
    }
    if (rows.length < BATCH) break;
    cursor = rows[rows.length - 1].id;
  }
  return out;
};

/**
 * A product's units as whole weeks, oldest first, the last ending today:
 * week i covers the 7 days ending (weeks - 1 - i) * 7 days ago.
 */
const weekly = (days, weeks, now = new Date()) => {
  const out = new Array(weeks).fill(0);
  for (let i = 0; i < weeks * 7; i += 1) {
    const units = days?.get(dayKey(new Date(now.getTime() - i * DAY_MS))) || 0;
    out[weeks - 1 - Math.floor(i / 7)] += units;
  }
  return out;
};

/** Days since the first sale in `days` (null when none). */
const daysSinceFirstSale = (days, now = new Date()) => {
  if (!days?.size) return null;
  const first = [...days.keys()].sort()[0];
  return Math.floor((now.getTime() - new Date(`${first}T00:00:00+08:00`).getTime()) / DAY_MS);
};

module.exports = {
  dailyUnits, weekly, daysSinceFirstSale, DAY_MS,
};
