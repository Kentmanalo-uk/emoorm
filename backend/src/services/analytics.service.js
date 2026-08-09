const analyticsRepository = require('../repositories/analytics.repository');
const storeRepository = require('../repositories/store.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const { ApiError } = require('../middleware/errorHandler');

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

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
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
  const days = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    days.push(byDate.get(key) || { date: key, total: 0, orders: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
};

// ---------- SELLER ----------
const getSellerAnalytics = async (userId, query = {}) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('You do not have a store', 404);

  const raw = await analyticsRepository.getSellerStats(store.id, query);
  const orderStatus = toCountMap(raw.ordersByStatus, ORDER_STATUSES);
  const productStatus = toCountMap(raw.productsByStatus, PRODUCT_STATUSES);

  const revenue = Number(raw.revenueAgg._sum.total || 0);
  const previousRevenue = Number(raw.previousRevenueAgg._sum.total || 0);
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
      orders: kpi(completedOrders, previousCompletedOrders),
      avgOrderValue: kpi(avgOrderValue, previousAvg),
      completionRate: { value: Math.round(completionRate), previous: null, delta: null },
      cancelRate: { value: Math.round(cancelRate), previous: null, delta: null },
      activeProducts: { value: productStatus.counts.APPROVED, previous: null, delta: null },
      totalProducts: { value: productStatus.total, previous: null, delta: null },
      lifetimeRevenue: { value: Number(raw.lifetimeRevenue._sum.total || 0), previous: null, delta: null },
      unitsSold: { value: Number(raw.lifetimeUnitsSold._sum.quantity || 0), previous: null, delta: null },
      buyers: { value: raw.uniqueBuyers, previous: null, delta: null },
    },
    salesByDay: padDays(raw.salesByDay, raw.window.from, raw.window.to),
    salesByBucket: raw.salesBucketed,
    granularity: raw.granularity,
    ordersByStatus: orderStatus.counts,
    productsByStatus: productStatus.counts,
    topProducts,
    topCategories: raw.topCategories,
    lowStock: raw.lowStock,
  };
};

// ---------- MUNICIPALITY ----------
const getMunicipalityAnalytics = async (actor, query = {}) => {
  let municipalityId = null;

  if (actor.role === 'SUPER_ADMIN') {
    municipalityId = query.municipalityId || null;
    if (!municipalityId) {
      throw new ApiError('municipalityId query parameter is required for super admin', 400);
    }
  } else if (actor.role === 'MUNICIPAL_ADMIN') {
    if (!actor.municipalityId) throw new ApiError('No municipality assigned to this admin', 403);
    if (query.municipalityId && query.municipalityId !== actor.municipalityId) {
      throw new ApiError('You can only view your assigned municipality', 403);
    }
    municipalityId = actor.municipalityId;
  } else {
    throw new ApiError('Forbidden', 403);
  }

  const municipality = await municipalityRepository.findById(municipalityId);
  if (!municipality) throw new ApiError('Municipality not found', 404);

  const raw = await analyticsRepository.getMunicipalityStats(municipalityId, query);
  const orderStatus = toCountMap(raw.ordersByStatus, ORDER_STATUSES);
  const productStatus = toCountMap(raw.productsByStatus, PRODUCT_STATUSES);

  const revenue = Number(raw.revenueAgg._sum.total || 0);
  const previousRevenue = Number(raw.previousRevenueAgg._sum.total || 0);
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
      orders: kpi(completedOrders, previousCompletedOrders),
      avgOrderValue: kpi(avgOrderValue, previousAvg),
      sellers: { value: raw.approvedSellers, previous: null, delta: null },
      activeStores: { value: raw.activeStores, previous: null, delta: null },
      suspendedStores: { value: raw.suspendedStores, previous: null, delta: null },
      liveProducts: { value: productStatus.counts.APPROVED, previous: null, delta: null },
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
  const raw = await analyticsRepository.getPlatformStats(query, query.municipalityId || null);
  const orderStatus = toCountMap(raw.ordersByStatus, ORDER_STATUSES);
  const productStatus = toCountMap(raw.productsByStatus, PRODUCT_STATUSES);

  const usersByRole = { BUYER: 0, SELLER: 0, MUNICIPAL_ADMIN: 0, SUPER_ADMIN: 0 };
  for (const row of raw.usersByRole) usersByRole[row.role] = row._count._all;

  const revenue = Number(raw.revenueAgg._sum.total || 0);
  const previousRevenue = Number(raw.previousRevenueAgg._sum.total || 0);
  const completedOrders = raw.revenueAgg._count._all;
  const previousCompletedOrders = raw.previousRevenueAgg._count._all;
  const avgOrderValue = completedOrders ? revenue / completedOrders : 0;
  const previousAvg = previousCompletedOrders ? previousRevenue / previousCompletedOrders : 0;

  // Sales by municipality (lifetime revenue rollup)
  const muniRevenue = new Map();
  const storeMuniMap = new Map();
  // We don't have municipality on salesByStoreAll rows; fetch minimal store->muni lookup lazily.
  // For simplicity, refetch stores in one shot:
  const prisma = require('../config/database');
  const storeIds = raw.salesByStoreAll.map((r) => r.storeId);
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
  const salesByMunicipality = raw.municipalities.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    hasAdmin: !!m.adminId,
    revenue: muniRevenue.get(m.id)?.revenue || 0,
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
      orders: kpi(completedOrders, previousCompletedOrders),
      avgOrderValue: kpi(avgOrderValue, previousAvg),
      buyers: { value: usersByRole.BUYER, previous: null, delta: null },
      sellers: { value: usersByRole.SELLER, previous: null, delta: null },
      municipalAdmins: { value: usersByRole.MUNICIPAL_ADMIN, previous: null, delta: null },
      totalStores: { value: raw.stores.total, previous: null, delta: null },
      activeStores: { value: raw.stores.active, previous: null, delta: null },
      totalProducts: { value: productStatus.total, previous: null, delta: null },
      liveProducts: { value: productStatus.counts.APPROVED, previous: null, delta: null },
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

// ---------- Simple in-memory cache (60s TTL) ----------
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

const cacheKey = (scope, ...parts) => `${scope}::${parts.map((p) => p || '').join('|')}`;

const withCache = (key, fn) => async (...args) => {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;
  const value = await fn(...args);
  cache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value;
};

const cachedSeller = async (userId, query = {}) => {
  const key = cacheKey('seller', userId, query.from, query.to, query.granularity);
  return withCache(key, () => getSellerAnalytics(userId, query))();
};

const cachedMunicipality = async (actor, query = {}) => {
  const key = cacheKey('muni', actor.id, actor.role, query.municipalityId, query.from, query.to);
  return withCache(key, () => getMunicipalityAnalytics(actor, query))();
};

const cachedPlatform = async (query = {}) => {
  const key = cacheKey('platform', query.municipalityId, query.from, query.to);
  return withCache(key, () => getPlatformAnalytics(query))();
};

module.exports = {
  getSellerAnalytics: cachedSeller,
  getSellerDayDetails,
  getMunicipalityAnalytics: cachedMunicipality,
  getPlatformAnalytics: cachedPlatform,
};
