const prisma = require('../config/database');
const manila = require('../utils/manilaTime');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Analytics Repository — unified aggregations
 * Each fn takes a `{ from, to }` window; delta and shape live in the service.
 */

const DEFAULT_WINDOW_DAYS = 30;
const DAY_MS = 86400000;
// Nothing was sold on E-MOORM before this, so earlier dates add only work.
const EARLIEST = new Date('2020-01-01T00:00:00.000Z');
// A window that is charted day by day stays within a year (a leap year fits);
// one charted by month or year may run to five years. Past that the queries
// and the padded arrays grow with whatever the request asks for.
const MAX_DAY_SPAN_DAYS = 366;
const MAX_LONG_SPAN_DAYS = 5 * 366;

const clampDate = (d, fallback) => {
  if (!d) return fallback;
  const parsed = d instanceof Date ? d : new Date(d);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

/**
 * The window asked for, kept within what the dashboards can chart: `to` no
 * later than a day from now, `from` no earlier than 2020, and the span within
 * a year when the figures are laid out day by day (`granularity` day, and the
 * admin dashboards, which always are), five years otherwise.
 */
const resolveWindow = ({ from, to, granularity } = {}, { daily = true } = {}) => {
  const now = new Date();
  const latest = new Date(now.getTime() + DAY_MS);
  let end = clampDate(to, now);
  if (end > latest) end = latest;
  let start = clampDate(
    from,
    new Date(end.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS),
  );
  if (start < EARLIEST) start = EARLIEST;
  if (start > end) throw new ApiError('The start date must be on or before the end date.', 400);
  const byDay = daily || !['month', 'year'].includes(granularity);
  const maxDays = byDay ? MAX_DAY_SPAN_DAYS : MAX_LONG_SPAN_DAYS;
  if (end.getTime() - start.getTime() > maxDays * DAY_MS) {
    throw new ApiError(
      byDay
        ? 'Pick a period of one year or less, or view it by month or year.'
        : 'Pick a period of five years or less.',
      400,
    );
  }
  const spanMs = Math.max(1, end.getTime() - start.getTime());
  return {
    from: start,
    to: end,
    previousFrom: new Date(start.getTime() - spanMs),
    previousTo: start,
  };
};

// Revenue counts a completed order only while its money is kept: orders
// refunded in full are left out, and partial refunds (REFUNDED return
// requests on the remaining orders) are subtracted by the service.
const EARNED = { status: 'COMPLETED', paymentStatus: { not: 'REFUNDED' } };

const revenueAggregate = (scope) => prisma.order.aggregate({
  where: { ...scope, ...EARNED },
  _sum: { total: true },
  _count: { _all: true },
});

const refundedAggregate = (scope) => prisma.returnRequest.aggregate({
  where: { status: 'REFUNDED', order: { ...scope, ...EARNED } },
  _sum: { refundedAmount: true },
});

const bucketByDay = (orders) => {
  const map = new Map();
  for (const o of orders) {
    const day = manila.dayKey(o.createdAt);
    const cur = map.get(day) || { total: 0, orders: 0 };
    cur.total += Number(o.total || 0);
    cur.orders += 1;
    map.set(day, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, total: v.total, orders: v.orders }));
};

const bucketBy = (orders, granularity = 'day') => {
  // Manila days, months and years: the calendar the shops and buyers live by.
  const keyOf = (d) => {
    if (granularity === 'month') return manila.monthKey(d);
    if (granularity === 'year') return manila.yearKey(d);
    return manila.dayKey(d);
  };
  const map = new Map();
  for (const o of orders) {
    const key = keyOf(o.createdAt);
    const cur = map.get(key) || { total: 0, orders: 0 };
    cur.total += Number(o.total || 0);
    cur.orders += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, total: v.total, orders: v.orders }));
};

const getSellerDayDetails = async (storeId, dateISO) => {
  const start = manila.dayStart(dateISO);
  const end = new Date(start.getTime() + 86400000);
  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: 'asc' },
    include: {
      buyer: { select: { id: true, fullName: true, email: true } },
      items: {
        select: {
          id: true, productName: true, price: true, quantity: true, subtotal: true,
          product: { select: { id: true, slug: true, images: true } },
        },
      },
    },
  });
  return { date: dateISO, orders };
};

// ---------- SELLER ----------
const getSellerStats = async (storeId, window) => {
  // A shop's chart may go by month or year, so its window may be longer.
  const w = resolveWindow(window, { daily: false });
  const granularity = window?.granularity || 'day';
  const orderScope = { storeId, createdAt: { gte: w.from, lte: w.to } };
  const prevOrderScope = { storeId, createdAt: { gte: w.previousFrom, lt: w.previousTo } };

  const [
    ordersByStatus,
    revenueAgg,
    previousRevenueAgg,
    productsByStatus,
    lowStock,
    topSoldItems,
    topCategoryRows,
    windowOrders,
    lifetimeRevenue,
    lifetimeUnitsSold,
    uniqueBuyers,
    refundedAgg,
    previousRefundedAgg,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { storeId },
      _count: { _all: true },
    }),
    revenueAggregate(orderScope),
    revenueAggregate(prevOrderScope),
    prisma.product.groupBy({
      by: ['status'],
      where: { storeId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { storeId, deletedAt: null, listingKind: 'REGULAR', productType: { not: 'COOK_TO_ORDER' } },
      select: { id: true, name: true, slug: true, images: true, stock: true, lowStockThreshold: true, status: true },
      orderBy: { stock: 'asc' },
    }).then((products) => products.filter((product) => product.stock <= product.lowStockThreshold).slice(0, 5)),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { storeId, status: { not: 'CANCELLED' }, createdAt: { gte: w.from, lte: w.to } },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { storeId, status: { not: 'CANCELLED' }, createdAt: { gte: w.from, lte: w.to } },
      },
      _sum: { quantity: true, subtotal: true },
    }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.aggregate({
      where: { storeId, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: { storeId, status: 'COMPLETED' } },
      _sum: { quantity: true },
    }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      distinct: ['buyerId'],
      select: { buyerId: true },
    }),
    refundedAggregate(orderScope),
    refundedAggregate(prevOrderScope),
  ]);

  const topProductIds = topSoldItems.map((i) => i.productId);
  const productDetails = topProductIds.length
    ? await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, slug: true, images: true, price: true, categoryId: true },
    })
    : [];

  // Aggregate categories from ALL sold items in window
  const catProductIds = topCategoryRows.map((r) => r.productId);
  const catProductInfo = catProductIds.length
    ? await prisma.product.findMany({
      where: { id: { in: catProductIds } },
      select: {
        id: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    })
    : [];
  const catInfoById = new Map(catProductInfo.map((p) => [p.id, p.category]));
  const catAgg = new Map();
  for (const row of topCategoryRows) {
    const cat = catInfoById.get(row.productId);
    if (!cat) continue;
    const cur = catAgg.get(cat.id) || { id: cat.id, name: cat.name, slug: cat.slug, quantity: 0, revenue: 0 };
    cur.quantity += Number(row._sum.quantity || 0);
    cur.revenue += Number(row._sum.subtotal || 0);
    catAgg.set(cat.id, cur);
  }
  const topCategories = Array.from(catAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    window: w,
    granularity,
    ordersByStatus,
    revenueAgg,
    previousRevenueAgg,
    productsByStatus,
    lowStock,
    topSoldItems,
    productDetails,
    salesByDay: bucketByDay(windowOrders),
    salesBucketed: bucketBy(windowOrders, granularity),
    lifetimeRevenue,
    lifetimeUnitsSold,
    topCategories,
    uniqueBuyers: uniqueBuyers.length,
    refundedAgg,
    previousRefundedAgg,
  };
};

// ---------- MUNICIPALITY ----------
const getMunicipalityStats = async (municipalityId, window) => {
  const w = resolveWindow(window);
  const orderScope = { store: { municipalityId }, createdAt: { gte: w.from, lte: w.to } };
  const prevOrderScope = { store: { municipalityId }, createdAt: { gte: w.previousFrom, lt: w.previousTo } };

  const [
    pendingSellers,
    approvedSellers,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    previousRevenueAgg,
    pendingReports,
    resolvedReports,
    windowOrders,
    recentSellers,
    recentProducts,
    topStoreRows,
    topProductRows,
    lifetimeRevenue,
    uniqueBuyers,
    refundedAgg,
    previousRefundedAgg,
  ] = await Promise.all([
    prisma.user.count({
      // Applications follow the shop's municipality, which may differ from
      // the applicant's own.
      where: {
        sellerApplicationStatus: 'PENDING',
        deletedAt: null,
        OR: [{ municipalityId }, { shopMunicipalityId: municipalityId }],
      },
    }),
    prisma.user.count({ where: { municipalityId, role: 'SELLER', deletedAt: null } }),
    prisma.store.count({ where: { municipalityId, isActive: true, isSuspended: false, deletedAt: null } }),
    prisma.store.count({ where: { municipalityId, isSuspended: true, deletedAt: null } }),
    prisma.product.groupBy({
      by: ['status'],
      where: { municipalityId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { store: { municipalityId } },
      _count: { _all: true },
    }),
    revenueAggregate(orderScope),
    revenueAggregate(prevOrderScope),
    prisma.report.count({ where: { municipalityId, status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.report.count({ where: { municipalityId, status: { in: ['RESOLVED', 'DISMISSED'] } } }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      where: {
        sellerApplicationStatus: 'PENDING',
        deletedAt: null,
        OR: [{ municipalityId }, { shopMunicipalityId: municipalityId }],
      },
      select: { id: true, fullName: true, email: true, shopName: true, sellerApplicationDate: true },
      orderBy: { sellerApplicationDate: 'desc' },
      take: 5,
    }),
    prisma.product.findMany({
      where: { municipalityId, status: 'PENDING', deletedAt: null },
      select: {
        id: true, name: true, slug: true, price: true, images: true, createdAt: true,
        store: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ['storeId'],
      where: { ...orderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          store: { municipalityId },
          status: { not: 'CANCELLED' },
          createdAt: { gte: w.from, lte: w.to },
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
    prisma.order.aggregate({
      where: { store: { municipalityId }, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      distinct: ['buyerId'],
      select: { buyerId: true },
    }),
    refundedAggregate(orderScope),
    refundedAggregate(prevOrderScope),
  ]);

  const topStoreIds = topStoreRows.map((r) => r.storeId);
  const stores = topStoreIds.length
    ? await prisma.store.findMany({
      where: { id: { in: topStoreIds } },
      select: { id: true, name: true, slug: true, logo: true },
    })
    : [];
  const topProductIds = topProductRows.map((r) => r.productId);
  const productDetails = topProductIds.length
    ? await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: {
        id: true, name: true, slug: true, images: true, price: true,
        store: { select: { id: true, name: true } },
      },
    })
    : [];

  return {
    window: w,
    pendingSellers,
    approvedSellers,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    previousRevenueAgg,
    pendingReports,
    resolvedReports,
    salesByDay: bucketByDay(windowOrders),
    recentSellers,
    recentProducts,
    topStoreRows,
    stores,
    topProductRows,
    productDetails,
    lifetimeRevenue,
    uniqueBuyers: uniqueBuyers.length,
    refundedAgg,
    previousRefundedAgg,
  };
};

// ---------- PLATFORM ----------
const getPlatformStats = async (window, filterMunicipalityId = null) => {
  const w = resolveWindow(window);
  const storeMuniFilter = filterMunicipalityId ? { municipalityId: filterMunicipalityId } : {};
  const orderMuniFilter = filterMunicipalityId ? { store: { municipalityId: filterMunicipalityId } } : {};
  const orderScope = { ...orderMuniFilter, createdAt: { gte: w.from, lte: w.to } };
  const prevOrderScope = { ...orderMuniFilter, createdAt: { gte: w.previousFrom, lt: w.previousTo } };

  const [
    usersByRole,
    totalStores,
    activeStores,
    suspendedStores,
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    previousRevenueAgg,
    salesByStoreAll,
    salesByStorePrevious,
    windowOrders,
    municipalities,
    pendingReports,
    pendingSellers,
    pendingProducts,
    topStoreRows,
    topProductRows,
    lifetimeRevenue,
    uniqueBuyers,
    refundedAgg,
    previousRefundedAgg,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.store.count({ where: { ...storeMuniFilter, deletedAt: null } }),
    prisma.store.count({ where: { ...storeMuniFilter, isActive: true, isSuspended: false, deletedAt: null } }),
    prisma.store.count({ where: { ...storeMuniFilter, isSuspended: true, deletedAt: null } }),
    prisma.product.groupBy({
      by: ['status'],
      where: { ...(filterMunicipalityId ? { municipalityId: filterMunicipalityId } : {}), deletedAt: null },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: orderMuniFilter,
      _count: { _all: true },
    }),
    revenueAggregate(orderScope),
    revenueAggregate(prevOrderScope),
    // Sales per store in the chosen period and the one before it, for each
    // municipality's share and growth.
    prisma.order.groupBy({
      by: ['storeId'],
      where: { ...orderScope, ...EARNED },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['storeId'],
      where: { ...prevOrderScope, ...EARNED },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.municipality.findMany({
      select: { id: true, name: true, code: true, adminId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.report.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.user.count({
      where: { sellerApplicationStatus: 'PENDING', deletedAt: null },
    }),
    prisma.product.count({ where: { status: 'PENDING', deletedAt: null } }),
    prisma.order.groupBy({
      by: ['storeId'],
      where: { ...orderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          status: { not: 'CANCELLED' },
          createdAt: { gte: w.from, lte: w.to },
          ...orderMuniFilter,
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
    prisma.order.aggregate({
      where: { status: 'COMPLETED', ...orderMuniFilter },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      distinct: ['buyerId'],
      select: { buyerId: true },
    }),
    refundedAggregate(orderScope),
    refundedAggregate(prevOrderScope),
  ]);

  const topStoreIds = topStoreRows.map((r) => r.storeId);
  const topStores = topStoreIds.length
    ? await prisma.store.findMany({
      where: { id: { in: topStoreIds } },
      select: { id: true, name: true, slug: true, logo: true, municipality: { select: { name: true } } },
    })
    : [];
  const topProductIds = topProductRows.map((r) => r.productId);
  const topProducts = topProductIds.length
    ? await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: {
        id: true, name: true, slug: true, images: true, price: true,
        store: { select: { id: true, name: true } },
      },
    })
    : [];

  return {
    window: w,
    usersByRole,
    stores: { total: totalStores, active: activeStores, suspended: suspendedStores },
    productsByStatus,
    ordersByStatus,
    revenueAgg,
    previousRevenueAgg,
    salesByStoreAll,
    salesByStorePrevious,
    salesByDay: bucketByDay(windowOrders),
    municipalities,
    pendingReports,
    pendingSellers,
    pendingProducts,
    topStoreRows,
    topStores,
    topProductRows,
    topProducts,
    lifetimeRevenue,
    uniqueBuyers: uniqueBuyers.length,
    refundedAgg,
    previousRefundedAgg,
  };
};

module.exports = {
  resolveWindow,
  getSellerStats,
  getSellerDayDetails,
  getMunicipalityStats,
  getPlatformStats,
};
