const { Prisma } = require('@prisma/client');
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

// A MoorMove rider's delivery fee is the rider's money, not the shop's: the
// sales of an order a rider delivered (deliveryPartner MOORMOVE) leave its
// delivery fee out. A shop's own delivery fee (and the fee of an order the
// shop took over from a rider) is the shop's and counts. Neither is an
// unpaid failed-trip fee added to an order (failedTripFees): it pays the
// shop back what it paid a rider for the buyer's failed trip.
const RIDER_DELIVERED = { deliveryPartner: 'MOORMOVE' };

/** prisma.order.aggregate of `_sum.total` and `_count`, with riders' and failed trips' fees taken out of the total. */
const salesAggregate = async (where) => {
  const [all, riders] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { total: true, failedTripFees: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { ...where, ...RIDER_DELIVERED }, _sum: { deliveryFee: true } }),
  ]);
  return {
    ...all,
    _sum: {
      ...all._sum,
      total: Number(all._sum.total || 0) - Number(riders._sum.deliveryFee || 0) - Number(all._sum.failedTripFees || 0),
    },
  };
};

/**
 * Sales per store (prisma.order.groupBy by storeId), riders' fees taken out;
 * with `take`, the best-selling stores first.
 */
const salesByStore = async (where, { take } = {}) => {
  const [rows, riders] = await Promise.all([
    prisma.order.groupBy({
      by: ['storeId'], where, _sum: { total: true, failedTripFees: true }, _count: { _all: true },
    }),
    prisma.order.groupBy({ by: ['storeId'], where: { ...where, ...RIDER_DELIVERED }, _sum: { deliveryFee: true } }),
  ]);
  const fees = new Map(riders.map((r) => [r.storeId, Number(r._sum.deliveryFee || 0)]));
  const out = rows.map((r) => ({
    ...r,
    _sum: { ...r._sum, total: Number(r._sum.total || 0) - (fees.get(r.storeId) || 0) - Number(r._sum.failedTripFees || 0) },
  }));
  return take ? out.sort((a, b) => b._sum.total - a._sum.total).slice(0, take) : out;
};

const revenueAggregate = (scope) => salesAggregate({ ...scope, ...EARNED });

// ── Totals worked out by the database ───────────────────────────────────
// The charts, buyer counts and category totals used to load every order (or
// sold line) of the period and add them up here; these ask MySQL for the
// totals instead. `scope`: { storeId } | { municipalityId } | {} (all).

/** SQL for the orders of a scope in a window (orders o, joined to stores s when needed). */
const orderFilter = ({ storeId, municipalityId }, from, to) => Prisma.sql`
  FROM orders o
  ${municipalityId ? Prisma.sql`JOIN stores s ON s.id = o.store_id` : Prisma.empty}
  WHERE o.created_at >= ${from} AND o.created_at <= ${to}
  ${storeId ? Prisma.sql`AND o.store_id = ${storeId}` : Prisma.empty}
  ${municipalityId ? Prisma.sql`AND s.municipality_id = ${municipalityId}` : Prisma.empty}`;

// Manila's calendar (UTC+8, no daylight saving), as utils/manilaTime.
const BUCKET_FORMAT = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

/**
 * Completed orders' sales per Manila day, month or year: [{ date, total, orders }],
 * oldest first, without riders' and failed trips' fees (as salesAggregate).
 */
const salesSeries = async (scope, w, granularity = 'day') => {
  const format = BUCKET_FORMAT[granularity] || BUCKET_FORMAT.day;
  const rows = await prisma.$queryRaw`
    SELECT DATE_FORMAT(DATE_ADD(o.created_at, INTERVAL 8 HOUR), ${format}) AS bucket,
      SUM(o.total - IF(o.delivery_partner = 'MOORMOVE', o.delivery_fee, 0) - o.failed_trip_fees) AS total,
      COUNT(*) AS orders
    ${orderFilter(scope, w.from, w.to)}
    AND o.status = 'COMPLETED'
    GROUP BY bucket
    ORDER BY bucket`;
  return rows.map((r) => ({ date: r.bucket, total: Number(r.total || 0), orders: Number(r.orders) }));
};

/** How many different buyers completed an order in the window. */
const countBuyers = async (scope, w) => {
  const [row] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT o.buyer_id) AS n ${orderFilter(scope, w.from, w.to)} AND o.status = 'COMPLETED'`;
  return Number(row?.n || 0);
};

/** A shop's five best categories in the window (not cancelled), by money taken. */
const topCategoriesOf = async (storeId, w) => {
  const rows = await prisma.$queryRaw`
    SELECT c.id, c.name, c.slug, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE o.store_id = ${storeId} AND o.status <> 'CANCELLED'
      AND o.created_at >= ${w.from} AND o.created_at <= ${w.to}
    GROUP BY c.id, c.name, c.slug
    ORDER BY revenue DESC
    LIMIT 5`;
  return rows.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, quantity: Number(r.quantity || 0), revenue: Number(r.revenue || 0),
  }));
};

const refundedAggregate = (scope) => prisma.returnRequest.aggregate({
  where: { status: 'REFUNDED', order: { ...scope, ...EARNED } },
  _sum: { refundedAmount: true },
});

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
    topCategories,
    salesByDay,
    salesBucketed,
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
      where: {
        storeId, deletedAt: null, listingKind: 'REGULAR', productType: { not: 'COOK_TO_ORDER' },
        stock: { lte: prisma.product.fields.lowStockThreshold },
      },
      select: { id: true, name: true, slug: true, images: true, stock: true, lowStockThreshold: true, status: true },
      orderBy: { stock: 'asc' },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { storeId, status: { not: 'CANCELLED' }, createdAt: { gte: w.from, lte: w.to } },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
    topCategoriesOf(storeId, w),
    salesSeries({ storeId }, w, 'day'),
    salesSeries({ storeId }, w, granularity),
    salesAggregate({ storeId, status: 'COMPLETED' }),
    prisma.orderItem.aggregate({
      where: { order: { storeId, status: 'COMPLETED' } },
      _sum: { quantity: true },
    }),
    countBuyers({ storeId }, w),
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
    salesByDay,
    salesBucketed,
    lifetimeRevenue,
    lifetimeUnitsSold,
    topCategories,
    uniqueBuyers,
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
    salesByDay,
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
    salesSeries({ municipalityId }, w),
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
    salesByStore({ ...orderScope, status: 'COMPLETED' }, { take: 5 }),
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
    salesAggregate({ store: { municipalityId }, status: 'COMPLETED' }),
    countBuyers({ municipalityId }, w),
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
    salesByDay,
    recentSellers,
    recentProducts,
    topStoreRows,
    stores,
    topProductRows,
    productDetails,
    lifetimeRevenue,
    uniqueBuyers,
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
    salesByDay,
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
    salesByStore({ ...orderScope, ...EARNED }),
    salesByStore({ ...prevOrderScope, ...EARNED }),
    salesSeries({ municipalityId: filterMunicipalityId }, w),
    prisma.municipality.findMany({
      select: { id: true, name: true, code: true, adminId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.report.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.user.count({
      where: { sellerApplicationStatus: 'PENDING', deletedAt: null },
    }),
    prisma.product.count({ where: { status: 'PENDING', deletedAt: null } }),
    salesByStore({ ...orderScope, status: 'COMPLETED' }, { take: 5 }),
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
    salesAggregate({ status: 'COMPLETED', ...orderMuniFilter }),
    countBuyers({ municipalityId: filterMunicipalityId }, w),
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
    salesByDay,
    municipalities,
    pendingReports,
    pendingSellers,
    pendingProducts,
    topStoreRows,
    topStores,
    topProductRows,
    topProducts,
    lifetimeRevenue,
    uniqueBuyers,
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
