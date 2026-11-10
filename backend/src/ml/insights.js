const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const settings = require('./settings');
const { guard } = require('./safe');
const forecasting = require('./forecasting');
const inventory = require('./inventory');
const segmentation = require('./segmentation');
const performance = require('./performance');
const sentiment = require('./sentiment');

/**
 * A seller's insights (Seller Center › Analytics): forecast, demand, stock
 * risk, buyer groups, products viewed but not bought and what buyers say in
 * reviews, all for their own
 * shop only. Each part says 'off' (switched off), 'insufficient' (not enough
 * data yet, with what it needs) or 'ok'; a part that fails is left out
 * ('unavailable') without taking the others with it.
 */

const RISK_ORDER = {
  OUT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NO_SALES: 4,
};

const firstImage = (images) => {
  const first = Array.isArray(images) ? images[0] : null;
  return typeof first === 'string' ? first : first?.url || null;
};

const priceOf = (p) => {
  const sale = Number(p.salePrice);
  const now = Date.now();
  const onSale = sale > 0 && sale < Number(p.price)
    && (!p.saleStartsAt || new Date(p.saleStartsAt).getTime() <= now)
    && (!p.saleEndsAt || new Date(p.saleEndsAt).getTime() > now);
  return onSale ? sale : Number(p.price);
};

const shopOf = async (userId) => {
  const shop = await prisma.store.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (!shop) throw new ApiError('You do not have a store', 404);
  return shop;
};

const productsOf = (storeId) => prisma.product.findMany({
  where: { storeId, deletedAt: null },
  select: {
    id: true, name: true, images: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true, status: true,
  },
});

const card = (p) => ({ id: p.id, name: p.name, image: firstImage(p.images) });

/** Forecast and demand for the shop's products. */
const forecastPart = async (products) => {
  const forecasts = await forecasting.forecastsFor(products.map((p) => p.id));
  if (!forecasts.size) {
    return { status: 'insufficient', needs: { weeks: forecasting.LIMITS.minWeeks, units: forecasting.LIMITS.minUnits } };
  }
  const rows = products.filter((p) => forecasts.has(p.id)).map((p) => {
    const f = forecasts.get(p.id);
    return {
      ...card(p),
      status: f.status,
      method: f.method,
      historyWeeks: f.historyWeeks,
      weekly: f.weekly,
      next7: f.next7,
      next30: f.next30,
      next90: f.next90,
      prepare: f.prepare,
      trend: f.trend,
      validation: f.validation,
      baseline: f.baseline,
      price: priceOf(p),
    };
  });
  const total = (k, field) => Math.round(rows.reduce((s, r) => s + (r[k]?.[field] || 0) * r.price, 0));
  return {
    status: 'ok',
    // Expected sales in pesos at today's prices, with the range.
    sales7: { amount: total('next7', 'units'), low: total('next7', 'low'), high: total('next7', 'high') },
    sales30: { amount: total('next30', 'units'), low: total('next30', 'low'), high: total('next30', 'high') },
    products: rows.sort((a, b) => b.next30.units - a.next30.units),
    rising: rows.filter((r) => r.trend === 'rising').map(card),
    falling: rows.filter((r) => r.trend === 'falling').map(card),
    withoutForecast: products.length - rows.length,
  };
};

/** Stock risk for the shop's products, the most urgent first. */
const stockPart = async (products) => {
  const outlooks = await inventory.outlooksFor(products.map((p) => p.id));
  if (!outlooks.size) return { status: 'insufficient' };
  const rows = products.filter((p) => outlooks.has(p.id)).map((p) => ({ ...card(p), ...outlooks.get(p.id), storeId: undefined }))
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  const count = (risk) => rows.filter((r) => r.risk === risk).length;
  return {
    status: 'ok',
    counts: {
      out: count('OUT'), high: count('HIGH'), medium: count('MEDIUM'), low: count('LOW'), noSales: count('NO_SALES'),
    },
    products: rows,
  };
};

/** Everything in one answer for the Insights section. */
const mine = async (userId) => {
  const shop = await shopOf(userId);
  const [engine, onForecast, onStock, onGroups, onReviews] = await Promise.all([
    settings.isOn(), settings.isOn('forecasting'), settings.isOn('inventory'), settings.isOn('segmentation'), settings.isOn('sentiment'),
  ]);
  const products = await productsOf(shop.id);
  const off = { status: 'off' };
  const unavailable = { status: 'unavailable' };
  const [forecast, stock, buyers, performanceResult, reviews] = await Promise.all([
    onForecast ? guard('insights-forecast', () => forecastPart(products), unavailable, 3000) : off,
    onStock ? guard('insights-stock', () => stockPart(products), unavailable, 3000) : off,
    onGroups ? guard('insights-groups', async () => (await segmentation.segmentsFor(shop.id))
      || { status: 'insufficient', needs: segmentation.MIN_BUYERS }, unavailable, 3000) : off,
    engine ? guard('insights-performance', () => performance.forShop(shop.id), unavailable, 3000) : off,
    onReviews ? guard('insights-reviews', async () => {
      const summary = await sentiment.storeSummary(shop.id);
      return summary ? { status: 'ok', ...summary } : { status: 'insufficient', needs: sentiment.MIN_SUMMARY };
    }, unavailable, 3000) : off,
  ]);
  return {
    on: {
      engine, forecasting: onForecast, inventory: onStock, segmentation: onGroups, sentiment: onReviews,
    },
    forecast,
    stock,
    buyers,
    performance: performanceResult,
    reviews,
  };
};

/** One of the seller's own products: its forecast and stock outlook. */
const forProduct = async (userId, productId) => {
  const shop = await shopOf(userId);
  const product = await prisma.product.findFirst({ where: { id: String(productId), storeId: shop.id, deletedAt: null }, select: { id: true } });
  // Another shop's product looks the same as one that does not exist.
  if (!product) throw new ApiError('Product not found', 404);
  const [onForecast, onStock] = await Promise.all([settings.isOn('forecasting'), settings.isOn('inventory')]);
  const [f, s] = await Promise.all([
    onForecast ? guard('product-forecast', async () => (await forecasting.forecastsFor([product.id])).get(product.id) || null, null) : null,
    onStock ? guard('product-stock', async () => (await inventory.outlooksFor([product.id])).get(product.id) || null, null) : null,
  ]);
  return {
    forecast: onForecast ? (f || { status: 'insufficient', needs: { weeks: forecasting.LIMITS.minWeeks, units: forecasting.LIMITS.minUnits } }) : { status: 'off' },
    stock: onStock ? (s ? { status: 'ok', ...s, storeId: undefined } : { status: 'insufficient' }) : { status: 'off' },
  };
};

module.exports = { mine, forProduct };
