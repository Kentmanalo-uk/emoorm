const prisma = require('../config/database');
const store = require('./store');
const { PUBLIC_WHERE } = require('./catalog');
const { dailyUnits } = require('./sales');
const { dayKey } = require('../utils/manilaTime');

/**
 * Module 06, stock risk (ML_DOC.MD): days of stock left at the expected
 * sales rate, the day it would run out, a risk level and a restock
 * suggestion, worked out daily. It reads stock; it never changes it.
 *
 * The rate is the product's forecast (module 02) when it has one, else its
 * average over the last 28 days. Example from the blueprint: 40 jars, 5 a day
 * -> 8 days, if sales stay as they are.
 *
 * Products without stock of their own are left out: paluto (cooked to
 * order), packages (their items carry the stock) and Available Today posts
 * (their quantity is per window).
 */

const MODEL = 'inventory';
const TTL_MS = 2 * 24 * 60 * 60 * 1000;
const RECENT_DAYS = 28;
const COVER_DAYS = 30; // a restock suggestion covers this long (no supplier lead times are recorded)
const DAY_MS = 24 * 60 * 60 * 1000;

const RISK = { out: 'OUT', high: 'HIGH', medium: 'MEDIUM', low: 'LOW', none: 'NO_SALES' };

/**
 * One product's stock outlook.
 * @param {Object} p - { stock, lowStockThreshold }
 * @param {Object} rates - { recent: units/day over 28 days, forecast: units/day or null }
 */
const outlook = (p, { recent, forecast }, now = new Date()) => {
  const rate = forecast != null && forecast > 0 ? forecast : recent;
  const basis = forecast != null && forecast > 0 ? 'forecast' : 'recent';
  const stock = Math.max(0, p.stock || 0);
  if (stock === 0) {
    return {
      stock, ratePerDay: round2(rate), basis, daysLeft: 0, runsOutOn: dayKey(now), risk: RISK.out, restock: Math.max(1, Math.ceil(rate * COVER_DAYS)),
    };
  }
  if (!(rate > 0)) {
    return {
      stock, ratePerDay: 0, basis, daysLeft: null, runsOutOn: null, risk: RISK.none, restock: 0,
    };
  }
  const daysLeft = stock / rate;
  let risk = RISK.low;
  if (daysLeft <= 7) risk = RISK.high;
  else if (daysLeft <= 14) risk = RISK.medium;
  return {
    stock,
    ratePerDay: round2(rate),
    basis,
    daysLeft: Math.round(daysLeft * 10) / 10,
    runsOutOn: dayKey(new Date(now.getTime() + daysLeft * DAY_MS)),
    risk,
    restock: Math.max(0, Math.ceil(rate * COVER_DAYS - stock)),
    belowThreshold: stock <= (p.lowStockThreshold ?? 5),
  };
};

function round2(v) { return Math.round((v || 0) * 100) / 100; }

/** The daily job. */
const run = async (ctx) => {
  const products = await prisma.product.findMany({
    where: {
      ...PUBLIC_WHERE,
      listingKind: 'REGULAR',
      productType: { notIn: ['COOK_TO_ORDER', 'PACKAGE'] },
    },
    select: {
      id: true, stock: true, lowStockThreshold: true, storeId: true,
    },
    take: 5000,
  });
  if (!products.length) return { skipped: true, reason: 'No products with stock', rowsRead: 0 };
  const ids = products.map((p) => p.id);
  const [sales, forecasts] = await Promise.all([
    dailyUnits({ days: RECENT_DAYS, productIds: ids, timeLeft: ctx.timeLeft }),
    require('./forecasting').forecastsFor(ids).catch(() => new Map()),
  ]);
  const rows = products.map((p) => {
    let units = 0;
    for (const u of (sales.get(p.id) || new Map()).values()) units += u;
    const f = forecasts.get(p.id);
    const value = outlook(p, { recent: units / RECENT_DAYS, forecast: f ? f.next7.units / 7 : null });
    return { entityType: 'product', entityId: p.id, value: { ...value, storeId: p.storeId } };
  });
  const count = (risk) => rows.filter((r) => r.value.risk === risk).length;
  const metrics = {
    products: rows.length,
    out: count(RISK.out),
    high: count(RISK.high),
    medium: count(RISK.medium),
    low: count(RISK.low),
    noSales: count(RISK.none),
    fromForecast: rows.filter((r) => r.value.basis === 'forecast').length,
  };
  const version = await store.createVersion(MODEL, {
    algorithm: 'Stock / expected daily sales (forecast, else 28-day average)',
    params: { recentDays: RECENT_DAYS, coverDays: COVER_DAYS },
    metrics,
  });
  const written = await store.replacePredictions(MODEL, 'stock', version.version, rows, TTL_MS);
  await store.activateVersion(MODEL, version.version);
  return {
    rowsRead: products.length, rowsWritten: written, metrics, modelVersion: version.version,
  };
};

/** Outlooks for these products: id -> outlook. */
const outlooksFor = (productIds) => store.getPredictions(MODEL, 'stock', 'product', productIds);

module.exports = {
  run, outlook, outlooksFor, RISK, COVER_DAYS, MODEL,
};
