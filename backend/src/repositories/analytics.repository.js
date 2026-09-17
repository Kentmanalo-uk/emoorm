const prisma = require('../config/database');

/**
 * Analytics Repository — unified aggregations
 * Each fn takes a `{ from, to }` window; delta and shape live in the service.
 */

const DEFAULT_WINDOW_DAYS = 30;

const clampDate = (d, fallback) => {
  if (!d) return fallback;
  const parsed = d instanceof Date ? d : new Date(d);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const resolveWindow = ({ from, to } = {}) => {
  const now = new Date();
  const end = clampDate(to, now);
  const start = clampDate(
    from,
    new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 86400000),
  );
  const spanMs = Math.max(1, end.getTime() - start.getTime());
  return {
    from: start,
    to: end,
    previousFrom: new Date(start.getTime() - spanMs),
    previousTo: start,
  };
};

const bucketByDay = (orders) => {
  const map = new Map();
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
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
  const keyOf = (d) => {
    const iso = d.toISOString();
    if (granularity === 'month') return iso.slice(0, 7);
    if (granularity === 'year') return iso.slice(0, 4);
    return iso.slice(0, 10);
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
  const start = new Date(`${dateISO}T00:00:00.000Z`);
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
  const w = resolveWindow(window);
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
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { ...orderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { ...prevOrderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['status'],
      where: { storeId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { storeId, deletedAt: null },
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
  ] = await Promise.all([
    prisma.user.count({
      where: { municipalityId, sellerApplicationStatus: 'PENDING', deletedAt: null },
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
    prisma.order.aggregate({
      where: { ...orderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { ...prevOrderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.report.count({ where: { municipalityId, status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.report.count({ where: { municipalityId, status: { in: ['RESOLVED', 'DISMISSED'] } } }),
    prisma.order.findMany({
      where: { ...orderScope, status: 'COMPLETED' },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { municipalityId, sellerApplicationStatus: 'PENDING', deletedAt: null },
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
    windowOrders,
    municipalities,
    pendingReports,
    pendingSellers,
    pendingProducts,
    topStoreRows,
    topProductRows,
    lifetimeRevenue,
    uniqueBuyers,
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
    prisma.order.aggregate({
      where: { ...orderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { ...prevOrderScope, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['storeId'],
      where: { status: 'COMPLETED', ...orderMuniFilter },
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
  };
};

module.exports = {
  resolveWindow,
  getSellerStats,
  getSellerDayDetails,
  getMunicipalityStats,
  getPlatformStats,
};
