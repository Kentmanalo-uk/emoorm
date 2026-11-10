const prisma = require('../config/database');
const store = require('./store');
const { dayKey } = require('../utils/manilaTime');

/**
 * Module 08, unusual activity (ML_DOC.MD): orders and accounts that look out
 * of the ordinary, flagged for an admin to look at. A flag is not proof of
 * anything, and nothing here acts on its own: no account is suspended, no
 * order cancelled, no payment blocked. The existing checks (open-order caps,
 * COD phone checks, payment proofs) stay in charge. Worked out daily.
 *
 * There are no labelled fraud cases to learn from, so these are rules and
 * robust statistics (median and MAD), each with its reason:
 *
 *   order_burst              5+ orders by one buyer within 24 hours
 *   unusual_amount           an order far above its shop's usual (robust
 *                            z >= 5 and 3x the median; shops with 10+ orders)
 *   payment_failures         2+ payment proofs marked failed for one buyer in 14 days
 *   repeat_no_shows          3+ orders a buyer did not pay for, refused or
 *                            did not collect, in 60 days
 *   new_account_large_order  an account under 2 days old ordering 5x the
 *                            marketplace's median order (and ₱3,000+)
 *
 * Each is raised once (ml_alerts, by its dedupe key), with the shop's and
 * town's ids so a municipal admin sees their own town's.
 */

const MODEL = 'anomalies';
const DAY_MS = 24 * 60 * 60 * 1000;

const RULES = {
  burst: { orders: 5, hours: 24, highAt: 10 },
  amount: { minShopOrders: 10, z: 5, timesMedian: 3, historyDays: 180 },
  payments: { failures: 2, days: 14 },
  noShows: { count: 3, days: 60, reasons: ['NO_SHOW', 'REFUSED', 'UNPAID'] },
  newAccount: { accountDays: 2, timesMedian: 5, minTotal: 3000 },
  scanDays: 30,
};

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const mad = (values, m = median(values)) => median(values.map((x) => Math.abs(x - m)));
/** How far x is from the usual, in robust standard deviations. */
const robustZ = (x, values) => {
  const m = median(values);
  const d = mad(values, m);
  if (!d) return x > m ? Infinity : 0;
  return (0.6745 * (x - m)) / d;
};

const peso = (n) => `₱${Math.round(n).toLocaleString('en-PH')}`;

/**
 * Orders by one buyer close together: the largest number within `hours`.
 * @param {Date[]} times
 */
const maxWithin = (times, hours) => {
  const t = times.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  let best = 0;
  let j = 0;
  for (let i = 0; i < t.length; i += 1) {
    while (t[i] - t[j] > hours * 3600e3) j += 1;
    best = Math.max(best, i - j + 1);
  }
  return best;
};

/**
 * The flags for a set of recent orders (pure: the reads are done by the caller).
 * @returns {Array} alerts to raise
 */
const findFlags = ({
  orders, history, failures, noShows, now = new Date(),
}) => {
  const alerts = [];
  const byBuyer = new Map();
  for (const o of orders) {
    if (!byBuyer.has(o.buyerId)) byBuyer.set(o.buyerId, []);
    byBuyer.get(o.buyerId).push(o);
  }

  // 1. Bursts.
  for (const [buyerId, list] of byBuyer) {
    const n = maxWithin(list.map((o) => o.createdAt), RULES.burst.hours);
    if (n < RULES.burst.orders) continue;
    alerts.push({
      alertType: 'order_burst',
      entityType: 'user',
      entityId: buyerId,
      municipalityId: list[0].buyerMunicipalityId || list[0].storeMunicipalityId || null,
      dedupeKey: `${buyerId}:${dayKey(now)}`,
      severity: n >= RULES.burst.highAt ? 'HIGH' : 'MEDIUM',
      score: Math.min(1, n / (2 * RULES.burst.highAt)),
      description: `${n} orders within ${RULES.burst.hours} hours from one buyer`,
      details: { orders: n, orderIds: list.slice(0, 20).map((o) => o.id) },
    });
  }

  // 2. Amounts far above the shop's usual.
  const totalsByShop = new Map();
  for (const h of history) {
    if (!totalsByShop.has(h.storeId)) totalsByShop.set(h.storeId, []);
    totalsByShop.get(h.storeId).push(h.total);
  }
  const all = history.map((h) => h.total);
  const marketMedian = median(all);
  for (const o of orders) {
    const shop = totalsByShop.get(o.storeId) || [];
    if (shop.length >= RULES.amount.minShopOrders) {
      const z = robustZ(o.total, shop);
      const m = median(shop);
      if (z >= RULES.amount.z && o.total >= RULES.amount.timesMedian * m) {
        alerts.push({
          alertType: 'unusual_amount',
          entityType: 'order',
          entityId: o.id,
          storeId: o.storeId,
          municipalityId: o.storeMunicipalityId || null,
          dedupeKey: o.id,
          severity: z >= 2 * RULES.amount.z ? 'HIGH' : 'MEDIUM',
          score: Math.min(1, z / (4 * RULES.amount.z)),
          description: `Order of ${peso(o.total)}, ${Math.round(o.total / m)}x this shop's usual ${peso(m)}`,
          details: {
            orderNumber: o.orderNumber, total: o.total, shopMedian: m, robustZ: Number.isFinite(z) ? Math.round(z * 10) / 10 : null,
          },
        });
      }
    }
    // 5. A brand-new account's large order.
    const ageDays = (new Date(o.createdAt).getTime() - new Date(o.buyerCreatedAt).getTime()) / DAY_MS;
    if (ageDays <= RULES.newAccount.accountDays && all.length >= 20
      && o.total >= Math.max(RULES.newAccount.minTotal, RULES.newAccount.timesMedian * marketMedian)) {
      alerts.push({
        alertType: 'new_account_large_order',
        entityType: 'order',
        entityId: o.id,
        storeId: o.storeId,
        municipalityId: o.storeMunicipalityId || null,
        dedupeKey: o.id,
        severity: 'MEDIUM',
        score: Math.min(1, o.total / (10 * Math.max(1, marketMedian))),
        description: `Order of ${peso(o.total)} from an account ${Math.max(0, Math.round(ageDays * 24))} hours old`,
        details: { orderNumber: o.orderNumber, total: o.total, marketMedian },
      });
    }
  }

  // 3. Failed payment proofs.
  for (const [buyerId, list] of failures) {
    if (list.length < RULES.payments.failures) continue;
    alerts.push({
      alertType: 'payment_failures',
      entityType: 'user',
      entityId: buyerId,
      municipalityId: list[0].municipalityId || null,
      dedupeKey: `${buyerId}:${dayKey(now)}`,
      severity: list.length >= 2 * RULES.payments.failures ? 'HIGH' : 'MEDIUM',
      score: Math.min(1, list.length / (3 * RULES.payments.failures)),
      description: `${list.length} payment proofs marked failed in ${RULES.payments.days} days`,
      details: { orderIds: [...new Set(list.map((f) => f.orderId))].slice(0, 20) },
    });
  }

  // 4. Repeated no-shows.
  for (const [buyerId, list] of noShows) {
    if (list.length < RULES.noShows.count) continue;
    alerts.push({
      alertType: 'repeat_no_shows',
      entityType: 'user',
      entityId: buyerId,
      municipalityId: list[0].municipalityId || null,
      dedupeKey: `${buyerId}:${dayKey(now)}`,
      severity: list.length >= 2 * RULES.noShows.count ? 'HIGH' : 'MEDIUM',
      score: Math.min(1, list.length / (3 * RULES.noShows.count)),
      description: `${list.length} orders not paid, refused or not collected in ${RULES.noShows.days} days`,
      details: { orderIds: list.map((o) => o.id).slice(0, 20), reasons: [...new Set(list.map((o) => o.cancelReason))] },
    });
  }
  return alerts;
};

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  buyerId: true,
  storeId: true,
  total: true,
  createdAt: true,
  buyerMunicipalityId: true,
  store: { select: { municipalityId: true } },
  buyer: { select: { createdAt: true, municipalityId: true } },
};
const flat = (o) => ({
  ...o,
  total: Number(o.total) || 0,
  storeMunicipalityId: o.store?.municipalityId,
  buyerMunicipalityId: o.buyerMunicipalityId || o.buyer?.municipalityId,
  buyerCreatedAt: o.buyer?.createdAt,
});

/** Everything the rules read, for orders created since `since`. */
const gather = async (since, onlyOrderId = null) => {
  const now = Date.now();
  // One order: it and its buyer's other recent orders (a burst needs them).
  let where = { createdAt: { gte: since } };
  if (onlyOrderId) {
    const one = await prisma.order.findUnique({ where: { id: onlyOrderId }, select: { buyerId: true } });
    where = one
      ? { OR: [{ id: onlyOrderId }, { buyerId: one.buyerId, createdAt: { gte: new Date(now - RULES.scanDays * DAY_MS) } }] }
      : { id: onlyOrderId };
  }
  const [orders, history, failed, cancelled] = await Promise.all([
    prisma.order.findMany({ where, select: ORDER_SELECT, take: 20000 }),
    prisma.order.findMany({
      where: { createdAt: { gte: new Date(now - RULES.amount.historyDays * DAY_MS) }, status: { not: 'CANCELLED' } },
      select: { storeId: true, total: true },
      take: 50000,
    }),
    prisma.orderStatusHistory.findMany({
      where: { createdAt: { gte: new Date(now - RULES.payments.days * DAY_MS) }, note: { contains: '-> FAILED' } },
      select: { orderId: true, order: { select: { buyerId: true, buyer: { select: { municipalityId: true } } } } },
      take: 20000,
    }),
    prisma.order.findMany({
      where: {
        cancelledAt: { gte: new Date(now - RULES.noShows.days * DAY_MS) }, cancelReason: { in: RULES.noShows.reasons },
      },
      select: {
        id: true, buyerId: true, cancelReason: true, buyer: { select: { municipalityId: true } },
      },
      take: 20000,
    }),
  ]);
  const group = (rows, key, map) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(map(r));
    }
    return m;
  };
  return {
    orders: orders.map(flat),
    history: history.map((h) => ({ storeId: h.storeId, total: Number(h.total) || 0 })),
    failures: group(failed, (f) => f.order?.buyerId, (f) => ({ orderId: f.orderId, municipalityId: f.order?.buyer?.municipalityId })),
    noShows: group(cancelled, (o) => o.buyerId, (o) => ({ id: o.id, cancelReason: o.cancelReason, municipalityId: o.buyer?.municipalityId })),
  };
};

/** Raise the alerts (each once); returns how many are new. */
const raiseAll = async (alerts) => {
  let raised = 0;
  for (const a of alerts) {
    // eslint-disable-next-line no-await-in-loop
    if (await store.raiseAlert({ ...a, details: a.details ?? undefined })) raised += 1;
  }
  return raised;
};

/** The daily job. */
const run = async (ctx) => {
  const data = await gather(new Date(Date.now() - RULES.scanDays * DAY_MS));
  if (ctx.timeLeft() < 1500) throw new Error('Ran out of time reading orders');
  const alerts = findFlags(data);
  const raised = await raiseAll(alerts);
  const byType = alerts.reduce((m, a) => ({ ...m, [a.alertType]: (m[a.alertType] || 0) + 1 }), {});
  return {
    rowsRead: data.orders.length,
    rowsWritten: raised,
    metrics: {
      orders: data.orders.length, flagged: alerts.length, newAlerts: raised, ...byType,
    },
  };
};

/** One order, now (an admin asking): the flags it raises. */
const evaluateOrder = async (orderId) => {
  const data = await gather(null, String(orderId));
  const order = data.orders.find((o) => o.id === String(orderId));
  if (!order) return null;
  const alerts = findFlags(data).filter((a) => a.entityId === order.id || a.entityId === order.buyerId);
  await raiseAll(alerts);
  return { orderId: order.id, orderNumber: order.orderNumber, flags: alerts.map((a) => ({ type: a.alertType, severity: a.severity, description: a.description })) };
};

module.exports = {
  run, findFlags, evaluateOrder, robustZ, maxWithin, median, RULES, MODEL,
};
