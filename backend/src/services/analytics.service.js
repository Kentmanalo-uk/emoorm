const analyticsRepository = require('../repositories/analytics.repository');
const manila = require('../utils/manilaTime');
const storeRepository = require('../repositories/store.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const { ApiError } = require('../middleware/errorHandler');
const shopReadiness = require('./shopReadiness.service');
const { funnelForStore } = require('./productView.service');

/**
 * Analytics Service
 * Normalizes repository output into a unified response shape:
 *   {
 *     scope: 'seller' | 'municipality' | 'platform',
 *     window: { from, to, previousFrom, previousTo },
 *     kpis: { revenue, orders, avgOrderValue, completionRate, ... },
 *     salesByDay: [{ date, total, orders }],
 *     ordersByStatus: {...},
 *     topProducts: [...], topCategories?: [...], topStores?: [...],
 *     salesByMunicipality?: [...] (platform only),
 *     lowStock?: [...] (seller only),
 *     pending?: {...},
 *     recent?: {...}
 *   }
 */

// Every OrderStatus value, so the counts map always carries the full set.
const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED',
  'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED',
];
const PRODUCT_STATUSES = ['PENDING', 'APPROVED', 'HIDDEN', 'SUSPENDED', 'ARCHIVED'];

const toCountMap = (rows, statuses) => {
  const map = Object.fromEntries(statuses.map((s) => [s, 0]));
  let total = 0;
  for (const row of rows) {
    if (map[row.status] !== undefined) {
      map[row.status] = row._count._all;
    }
    total += row._count._all;
  }
  return { counts: map, total };
};

const delta = (current, previous) => {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p === 0) return c === 0 ? 0 : 100;
  return Math.round(((c - p) / p) * 100);
};

const kpi = (value, previous) => ({
  value: Number(value || 0),
  previous: Number(previous || 0),
  delta: delta(value, previous),
});

// Fill missing days so a chart of last N days shows an unbroken axis.
const padDays = (series, from, to) => {
  const byDate = new Map(series.map((s) => [s.date, s]));
  return manila.daysBetween(from, to).map((key) => byDate.get(key) || { date: key, total: 0, orders: 0 });
};

const padBuckets = (series, from, to, granularity) => {
  if (granularity === 'day') return padDays(series, from, to);

  const values = new Map(series.map((item) => [item.date, item]));
  return manila.periodsBetween(from, to, granularity)
    .map((key) => values.get(key) || { date: key, total: 0, orders: 0 });
};

// ---------- SELLER ----------
const getSellerAnalytics = async (userId, query = {}) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('You do not have a store', 404);

  const raw = await analyticsRepository.getSellerStats(store.id, query);
  // Product page views in the window, and how many turned into orders.
  const funnel = await funnelForStore(store.id, raw.window.from, raw.window.to);
  const orderStatus = toCountMap(raw.ordersByStatus, ORDER_STATUSES);
  const productStatus = toCountMap(raw.productsByStatus, PRODUCT_STATUSES);

  // Revenue is what was kept: completed, not fully refunded, minus partial refunds.
  const refunded = Number(raw.refundedAgg?._sum?.refundedAmount || 0);
  const previousRefunded = Number(raw.previousRefundedAgg?._sum?.refundedAmount || 0);
  const revenue = Number(raw.revenueAgg._sum.total || 0) - refunded;
  const previousRevenue = Number(raw.previousRevenueAgg._sum.total || 0) - previousRefunded;
  const completedOrders = raw.revenueAgg._count._all;
  const previousCompletedOrders = raw.previousRevenueAgg._count._all;
  const avgOrderValue = completedOrders ? revenue / completedOrders : 0;
  const previousAvg = previousCompletedOrders ? previousRevenue / previousCompletedOrders : 0;
  const completionRate = orderStatus.total ? (completedOrders / orderStatus.total) * 100 : 0;
  const cancelRate = orderStatus.total ? (orderStatus.counts.CANCELLED / orderStatus.total) * 100 : 0;

  const productMap = Object.fromEntries(raw.productDetails.map((p) => [p.id, p]));
  const topProducts = raw.topSoldItems.map((item) => {
    const p = productMap[item.productId] || {};
    return {
      id: item.productId,
      name: p.name || 'Unknown product',
      slug: p.slug || null,
      image: Array.isArray(p.images) ? p.images[0] || null : null,
      quantity: Number(item._sum.quantity || 0),
      revenue: Number(item._sum.subtotal || 0),
    };
  });

  return {
    scope: 'seller',
    window: raw.window,
    store: { id: store.id, name: store.name, isActive: store.isActive, isSuspended: store.isSuspended },
    kpis: {
      revenue: kpi(revenue, previousRevenue),
      refunded: kpi(refunded, previousRefunded),
      orders: kpi(completedOrders, previousCompletedOrders),
      totalOrders: { value: orderStatus.total, previous: null, delta: null },
      avgOrderValue: kpi(avgOrderValue, previousAvg),
      completionRate: { value: Math.round(completionRate), previous: null, delta: null },
      cancelRate: { value: Math.round(cancelRate), previous: null, delta: null },
      totalProducts: { value: productStatus.total, previous: null, delta: null },
      lifetimeRevenue: { value: Number(raw.lifetimeRevenue._sum.total || 0), previous: null, delta: null },
      unitsSold: { value: Number(raw.lifetimeUnitsSold._sum.quantity || 0), previous: null, delta: null },
      buyers: { value: raw.uniqueBuyers, previous: null, delta: null },
    },
    salesByDay: padDays(raw.salesByDay, raw.window.from, raw.window.to),
    salesByBucket: padBuckets(raw.salesBucketed, raw.window.from, raw.window.to, raw.granularity),
    granularity: raw.granularity,
    ordersByStatus: orderStatus.counts,
    productsByStatus: productStatus.counts,
    topProducts,
    topCategories: raw.topCategories,
    lowStock: raw.lowStock,
    views: funnel.totalViews,
    productFunnel: funnel.products,
  };
};

// ---------- MUNICIPALITY ----------
// The town an admin's request is about: a municipal admin's own, or the one a
// super admin asked for.
const municipalityFor = (actor, query = {}) => {
  if (actor.role === 'SUPER_ADMIN') {
    if (!query.municipalityId) {
      throw new ApiError('municipalityId query parameter is required for super admin', 400);
    }
    return query.municipalityId;
  }
  if (actor.role === 'MUNICIPAL_ADMIN') {
    if (!actor.municipalityId) throw new ApiError('No municipality assigned to this admin', 403);
    if (query.municipalityId && query.municipalityId !== actor.municipalityId) {
      throw new ApiError('You can only view your assigned municipality', 403);
    }
    return actor.municipalityId;
  }
  throw new ApiError('Forbidden', 403);
};

const getMunicipalityAnalytics = async (municipalityId, query = {}) => {
  const municipality = await municipalityRepository.findById(municipalityId);
  if (!municipality) throw new ApiError('Municipality not found', 404);

  const [raw, liveProducts] = await Promise.all([
    analyticsRepository.getMunicipalityStats(municipalityId, query),
    shopReadiness.countLiveProducts({ municipalityId }),
  ]);
  const orderStatus = toCountMap(raw.ordersByStatus, ORDER_STATUSES);
  const productStatus = toCountMap(raw.productsByStatus, PRODUCT_STATUSES);

  // Revenue is what was kept: completed, not fully refunded, minus partial refunds.
  const refunded = Number(raw.refundedAgg?._sum?.refundedAmount || 0);
  const previousRefunded = Number(raw.previousRefundedAgg?._sum?.refundedAmount || 0);
  const revenue = Number(raw.revenueAgg._sum.total || 0) - refunded;
  const previousRevenue = Number(raw.previousRevenueAgg._sum.total || 0) - previousRefunded;
  const completedOrders = raw.revenueAgg._count._all;
  const previousCompletedOrders = raw.previousRevenueAgg._count._all;
  const avgOrderValue = completedOrders ? revenue / completedOrders : 0;
  const previousAvg = previousCompletedOrders ? previousRevenue / previousCompletedOrders : 0;

  const storesById = Object.fromEntries(raw.stores.map((s) => [s.id, s]));
  const topStores = raw.topStoreRows.map((r) => {
    const s = storesById[r.storeId] || {};
    return {
      id: r.storeId,
      name: s.name || 'Unknown store',
      slug: s.slug || null,
      logo: s.logo || null,
      orders: r._count._all,
      revenue: Number(r._sum.total || 0),
    };
  });

  const productsById = Object.fromEntries(raw.productDetails.map((p) => [p.id, p]));
  const topProducts = raw.topProductRows.map((r) => {
    const p = productsById[r.productId] || {};
    return {
      id: r.productId,
      name: p.name || 'Unknown product',
      slug: p.slug || null,
      image: Array.isArray(p.images) ? p.images[0] || null : null,
      storeName: p.store?.name || null,
      quantity: Number(r._sum.quantity || 0),
      revenue: Number(r._sum.subtotal || 0),
    };
  });

  return {
    scope: 'municipality',
    window: raw.window,
    municipality: { id: municipality.id, name: municipality.name, code: municipality.code },
    kpis: {
      revenue: kpi(revenue, previousRevenue),
      refunded: kpi(refunded, previousRefunded),
      orders: kpi(completedOrders, previousCompletedOrders),
      totalOrders: { value: orderStatus.total, previous: null, delta: null },
      avgOrderValue: kpi(avgOrderValue, previousAvg),
      sellers: { value: raw.approvedSellers, previous: null, delta: null },
      activeStores: { value: raw.activeStores, previous: null, delta: null },
      suspendedStores: { value: raw.suspendedStores, previous: null, delta: null },
      liveProducts: { value: liveProducts, previous: null, delta: null },
      lifetimeRevenue: { value: Number(raw.lifetimeRevenue._sum.total || 0), previous: null, delta: null },
      buyers: { value: raw.uniqueBuyers, previous: null, delta: null },
    },
    salesByDay: padDays(raw.salesByDay, raw.window.from, raw.window.to),
    ordersByStatus: orderStatus.counts,
    productsByStatus: productStatus.counts,
    topStores,
    topProducts,
    pending: {
      sellers: raw.pendingSellers,
      products: productStatus.counts.PENDING,
      reports: raw.pendingReports,
    },
    reports: { pending: raw.pendingReports, resolved: raw.resolvedReports },
    recent: {
      sellerApplications: raw.recentSellers,
      pendingProducts: raw.recentProducts,
    },
  };
};

// ---------- PLATFORM ----------
const getPlatformAnalytics = async (query = {}) => {
  const [raw, liveProducts] = await Promise.all([
    analyticsRepository.getPlatformStats(query, query.municipalityId || null),
    shopReadiness.countLiveProducts(query.municipalityId ? { municipalityId: query.municipalityId } : {}),
  ]);
  const orderStatus = toCountMap(raw.ordersByStatus, ORDER_STATUSES);
  const productStatus = toCountMap(raw.productsByStatus, PRODUCT_STATUSES);

  const usersByRole = { BUYER: 0, SELLER: 0, MUNICIPAL_ADMIN: 0, SUPER_ADMIN: 0 };
  for (const row of raw.usersByRole) usersByRole[row.role] = row._count._all;

  // Revenue is what was kept: completed, not fully refunded, minus partial refunds.
  const refunded = Number(raw.refundedAgg?._sum?.refundedAmount || 0);
  const previousRefunded = Number(raw.previousRefundedAgg?._sum?.refundedAmount || 0);
  const revenue = Number(raw.revenueAgg._sum.total || 0) - refunded;
  const previousRevenue = Number(raw.previousRevenueAgg._sum.total || 0) - previousRefunded;
  const completedOrders = raw.revenueAgg._count._all;
  const previousCompletedOrders = raw.previousRevenueAgg._count._all;
  const avgOrderValue = completedOrders ? revenue / completedOrders : 0;
  const previousAvg = previousCompletedOrders ? previousRevenue / previousCompletedOrders : 0;

  // Sales by municipality for the chosen period and the one before it.
  const muniRevenue = new Map();
  const muniPrevious = new Map();
  const storeMuniMap = new Map();
  // We don't have municipality on salesByStoreAll rows; fetch minimal store->muni lookup lazily.
  // For simplicity, refetch stores in one shot:
  const prisma = require('../config/database');
  const storeIds = [...new Set([...raw.salesByStoreAll, ...raw.salesByStorePrevious].map((r) => r.storeId))];
  const stores = storeIds.length
    ? await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, municipalityId: true },
    })
    : [];
  for (const s of stores) storeMuniMap.set(s.id, s.municipalityId);
  for (const row of raw.salesByStoreAll) {
    const muniId = storeMuniMap.get(row.storeId);
    if (!muniId) continue;
    const cur = muniRevenue.get(muniId) || { revenue: 0, orders: 0 };
    cur.revenue += Number(row._sum.total || 0);
    cur.orders += row._count._all;
    muniRevenue.set(muniId, cur);
  }
  for (const row of raw.salesByStorePrevious) {
    const muniId = storeMuniMap.get(row.storeId);
    if (!muniId) continue;
    muniPrevious.set(muniId, (muniPrevious.get(muniId) || 0) + Number(row._sum.total || 0));
  }
  const salesByMunicipality = raw.municipalities.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    hasAdmin: !!m.adminId,
    revenue: muniRevenue.get(m.id)?.revenue || 0,
    previousRevenue: muniPrevious.get(m.id) || 0,
    orders: muniRevenue.get(m.id)?.orders || 0,
  }));

  const topStoreDetails = Object.fromEntries(raw.topStores.map((s) => [s.id, s]));
  const topStores = raw.topStoreRows.map((r) => {
    const s = topStoreDetails[r.storeId] || {};
    return {
      id: r.storeId,
      name: s.name || 'Unknown store',
      slug: s.slug || null,
      logo: s.logo || null,
      municipalityName: s.municipality?.name || null,
      orders: r._count._all,
      revenue: Number(r._sum.total || 0),
    };
  });

  const topProductDetails = Object.fromEntries(raw.topProducts.map((p) => [p.id, p]));
  const topProducts = raw.topProductRows.map((r) => {
    const p = topProductDetails[r.productId] || {};
    return {
      id: r.productId,
      name: p.name || 'Unknown product',
      slug: p.slug || null,
      image: Array.isArray(p.images) ? p.images[0] || null : null,
      storeName: p.store?.name || null,
      quantity: Number(r._sum.quantity || 0),
      revenue: Number(r._sum.subtotal || 0),
    };
  });

  return {
    scope: 'platform',
    window: raw.window,
    filter: { municipalityId: query.municipalityId || null },
    kpis: {
      revenue: kpi(revenue, previousRevenue),
      refunded: kpi(refunded, previousRefunded),
      orders: kpi(completedOrders, previousCompletedOrders),
      totalOrders: { value: orderStatus.total, previous: null, delta: null },
      avgOrderValue: kpi(avgOrderValue, previousAvg),
      buyers: { value: usersByRole.BUYER, previous: null, delta: null },
      sellers: { value: usersByRole.SELLER, previous: null, delta: null },
      municipalAdmins: { value: usersByRole.MUNICIPAL_ADMIN, previous: null, delta: null },
      totalStores: { value: raw.stores.total, previous: null, delta: null },
      activeStores: { value: raw.stores.active, previous: null, delta: null },
      totalProducts: { value: productStatus.total, previous: null, delta: null },
      liveProducts: { value: liveProducts, previous: null, delta: null },
      lifetimeRevenue: { value: Number(raw.lifetimeRevenue._sum.total || 0), previous: null, delta: null },
      windowBuyers: { value: raw.uniqueBuyers, previous: null, delta: null },
    },
    salesByDay: padDays(raw.salesByDay, raw.window.from, raw.window.to),
    ordersByStatus: orderStatus.counts,
    productsByStatus: productStatus.counts,
    usersByRole,
    topStores,
    topProducts,
    salesByMunicipality,
    pending: {
      sellers: raw.pendingSellers,
      products: raw.pendingProducts,
      reports: raw.pendingReports,
    },
  };
};

// ---------- SELLER DAY DETAILS ----------
const getSellerDayDetails = async (userId, dateISO) => {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new ApiError('Invalid date. Expected YYYY-MM-DD.', 400);
  }
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('You do not have a store', 404);

  const raw = await analyticsRepository.getSellerDayDetails(store.id, dateISO);
  const orders = raw.orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    status: o.status,
    total: Number(o.total || 0),
    subtotal: Number(o.subtotal || 0),
    deliveryFee: Number(o.deliveryFee || 0),
    buyer: o.buyer ? { id: o.buyer.id, name: o.buyer.fullName || o.buyer.email, email: o.buyer.email } : null,
    items: o.items.map((it) => ({
      id: it.id,
      productId: it.product?.id || null,
      productName: it.productName,
      productImage: Array.isArray(it.product?.images) ? it.product.images[0] || null : null,
      price: Number(it.price || 0),
      quantity: it.quantity,
      subtotal: Number(it.subtotal || 0),
    })),
  }));

  const totalRevenue = orders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((s, o) => s + o.total, 0);
  const totalItems = orders.reduce((s, o) => s + o.items.reduce((n, it) => n + it.quantity, 0), 0);

  return {
    date: raw.date,
    summary: {
      orders: orders.length,
      revenue: totalRevenue,
      items: totalItems,
    },
    orders,
  };
};

// ---------- ADMIN VIEW: percentages, never pesos ----------
/*
 * Admins moderate the marketplace; they do not see what shops earn. Every
 * peso figure in the municipality and platform analytics is replaced here,
 * before it leaves the server, by what it means relative to the rest:
 *   - revenue / average order: the growth vs the previous period (delta %)
 *   - refunds: the share of sales refunded (%)
 *   - the sales chart: each day as a % of the busiest day (shape only)
 *   - stores, products, municipalities: their share of the period's sales,
 *     and for municipalities their growth too
 * Order, store, product and user counts stay: they are not money.
 */
const pct = (part, whole, digits = 1) => {
  const w = Number(whole || 0);
  if (!w) return 0;
  const f = 10 ** digits;
  return Math.round((Number(part || 0) / w) * 100 * f) / f;
};

// Growth only, and none when there was nothing before to grow from.
const growthOnly = (k) => (k ? { value: null, previous: null, delta: Number(k.previous || 0) > 0 ? k.delta : null } : k);

const toAdminView = (data) => {
  if (!data) return data;
  const total = Number(data.kpis?.revenue?.value || 0);
  const peak = Math.max(0, ...(data.salesByDay || []).map((d) => Number(d.total || 0)));
  // Product sales count every order not cancelled, so their share is of
  // whichever is larger: completed sales, or the listed products together.
  const productTotal = Math.max(total, (data.topProducts || []).reduce((n, p) => n + Number(p.revenue || 0), 0));
  const kpis = { ...data.kpis };
  kpis.refundRate = {
    value: pct(data.kpis?.refunded?.value, total + Number(data.kpis?.refunded?.value || 0)),
    previous: null,
    delta: null,
  };
  kpis.revenue = growthOnly(kpis.revenue);
  kpis.avgOrderValue = growthOnly(kpis.avgOrderValue);
  delete kpis.refunded;
  delete kpis.lifetimeRevenue;

  const view = {
    ...data,
    kpis,
    salesByDay: (data.salesByDay || []).map((d) => ({
      date: d.date,
      index: peak ? Math.round((Number(d.total || 0) / peak) * 100) : 0,
      orders: d.orders,
    })),
    topStores: (data.topStores || []).map(({ revenue, ...s }) => ({ ...s, share: pct(revenue, total) })),
    topProducts: (data.topProducts || []).map(({ revenue, ...p }) => ({ ...p, share: pct(revenue, productTotal) })),
  };
  // Applicants are listed by name and shop; their email stays private.
  if (data.recent?.sellerApplications) {
    view.recent = {
      ...data.recent,
      sellerApplications: data.recent.sellerApplications.map(({ email, ...applicant }) => applicant),
    };
  }

  if (data.salesByMunicipality) {
    const muniTotal = data.salesByMunicipality.reduce((n, m) => n + Number(m.revenue || 0), 0);
    const muniPrevTotal = data.salesByMunicipality.reduce((n, m) => n + Number(m.previousRevenue || 0), 0);
    view.salesByMunicipality = data.salesByMunicipality.map(({ revenue, previousRevenue, ...m }) => ({
      ...m,
      share: pct(revenue, muniTotal),
      previousShare: pct(previousRevenue, muniPrevTotal),
      // No sales before: there is nothing to grow from, so no figure.
      growth: Number(previousRevenue || 0) > 0 ? delta(revenue, previousRevenue) : null,
    }));
  }
  return view;
};

// ---------- Simple in-memory cache (60s TTL) ----------
const CACHE_TTL_MS = 60 * 1000;
// Plenty for every town's dashboard and the shops looking at theirs; past
// this the oldest entries go, so a long-running server cannot fill up.
const CACHE_MAX = 500;
const cache = new Map();
// Figures being worked out right now: an identical request waits for them
// instead of running the same queries again.
const inflight = new Map();

const cacheKey = (scope, ...parts) => `${scope}::${parts.map((p) => p ?? '').join('|')}`;

const remember = (key, value) => {
  const now = Date.now();
  cache.delete(key);
  // Entries sit in the order they were stored, so the oldest come first:
  // drop the expired ones, and more while the cache is full.
  for (const [oldKey, entry] of cache) {
    if (entry.expires > now && cache.size < CACHE_MAX) break;
    cache.delete(oldKey);
  }
  cache.set(key, { value, expires: now + CACHE_TTL_MS });
};

const cached = async (key, compute) => {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (!inflight.has(key)) {
    inflight.set(key, compute()
      .then((value) => {
        remember(key, value);
        return value;
      })
      .finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
};

/**
 * The requested window to the minute: `from` from the start of its minute,
 * `to` to the end of its minute. The pages send the moment of the request to
 * the millisecond, so without this no two requests ever shared an entry.
 * Neither edge moves by a minute or more, and `to` never ends sooner than
 * asked. A missing or unreadable date stays missing (the default window).
 */
const MINUTE_MS = 60 * 1000;
const minuteOf = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : Math.floor(time / MINUTE_MS);
};
const byMinute = (query) => {
  const from = minuteOf(query.from);
  const to = minuteOf(query.to);
  return {
    minutes: [from, to],
    window: {
      from: from === null ? undefined : new Date(from * MINUTE_MS),
      to: to === null ? undefined : new Date((to + 1) * MINUTE_MS - 1),
    },
  };
};

/**
 * Seller analytics, cached, plus the shop's live products counted on every
 * call: they follow its setup at once (it just became ready to sell, or
 * stopped being), not a minute later.
 */
const cachedSeller = async (userId, query = {}) => {
  const { minutes, window } = byMinute(query);
  const key = cacheKey('seller', userId, ...minutes, query.granularity);
  const data = await cached(key, () => getSellerAnalytics(userId, { ...query, ...window }));
  const live = await shopReadiness.countLiveProducts({ storeId: data.store.id });
  return { ...data, kpis: { ...data.kpis, activeProducts: { value: live, previous: null, delta: null } } };
};

/**
 * A town's figures are the same whoever asks, so they are cached per town,
 * once the asker is known to be allowed to see it.
 */
const cachedMunicipality = async (actor, query = {}) => {
  const municipalityId = municipalityFor(actor, query);
  const { minutes, window } = byMinute(query);
  const key = cacheKey('muni', municipalityId, ...minutes);
  return toAdminView(await cached(key, () => getMunicipalityAnalytics(municipalityId, { ...query, ...window })));
};

const cachedPlatform = async (query = {}) => {
  const { minutes, window } = byMinute(query);
  const key = cacheKey('platform', query.municipalityId, ...minutes);
  return toAdminView(await cached(key, () => getPlatformAnalytics({ ...query, ...window })));
};

module.exports = {
  getSellerAnalytics: cachedSeller,
  getSellerDayDetails,
  getMunicipalityAnalytics: cachedMunicipality,
  getPlatformAnalytics: cachedPlatform,
  // The cache itself, so the tests can check its bounds.
  cache: { cached, size: () => cache.size, MAX: CACHE_MAX },
};
