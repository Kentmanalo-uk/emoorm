const analyticsRepository = require('../repositories/analytics.repository');
const storeRepository = require('../repositories/store.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Analytics Service
 * Dashboard aggregation logic
 */

/**
 * Get seller dashboard analytics
 * @param {String} userId - Seller user ID
 * @returns {Promise<Object>} Seller analytics
 */
const getSellerAnalytics = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);

  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  const raw = await analyticsRepository.getSellerStats(store.id);

  const orderCounts = {
    PENDING: 0,
    CONFIRMED: 0,
    PREPARING: 0,
    READY: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };
  let totalOrders = 0;
  for (const row of raw.ordersByStatus) {
    orderCounts[row.status] = row._count._all;
    totalOrders += row._count._all;
  }

  const productCounts = {
    PENDING: 0,
    APPROVED: 0,
    HIDDEN: 0,
    SUSPENDED: 0,
    ARCHIVED: 0,
  };
  let totalProducts = 0;
  for (const row of raw.productsByStatus) {
    productCounts[row.status] = row._count._all;
    totalProducts += row._count._all;
  }

  // Sales by day for the last 30 days
  const salesByDay = {};
  for (const order of raw.recentCompletedOrders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    salesByDay[day] = (salesByDay[day] || 0) + Number(order.total);
  }

  // Top products with quantities
  const detailsById = Object.fromEntries(
    raw.topProductDetails.map((p) => [p.id, p])
  );
  const topProducts = raw.topSoldItems.map((item) => ({
    product: detailsById[item.productId] || { id: item.productId },
    quantitySold: item._sum.quantity || 0,
    revenue: Number(item._sum.subtotal || 0),
  }));

  return {
    store: {
      id: store.id,
      name: store.name,
      isActive: store.isActive,
      isSuspended: store.isSuspended,
    },
    totalRevenue: Number(raw.revenueAgg._sum.total || 0),
    completedOrders: raw.revenueAgg._count._all,
    totalOrders,
    orderCounts,
    totalProducts,
    productCounts,
    lowStockProducts: raw.lowStockProducts,
    topProducts,
    salesByDay: Object.entries(salesByDay).map(([date, total]) => ({ date, total })),
  };
};

module.exports = {
  getSellerAnalytics,
  getMunicipalityAnalytics,
  getPlatformAnalytics,
};

/**
 * Get municipality dashboard analytics
 * @param {Object} actor - Authenticated user (MUNICIPAL_ADMIN or SUPER_ADMIN)
 * @param {String} [municipalityIdParam] - Optional override for SUPER_ADMIN
 */
async function getMunicipalityAnalytics(actor, municipalityIdParam) {
  let municipalityId = null;

  if (actor.role === 'SUPER_ADMIN') {
    municipalityId = municipalityIdParam || null;
    if (!municipalityId) {
      throw new ApiError('municipalityId query parameter is required for super admin', 400);
    }
  } else if (actor.role === 'MUNICIPAL_ADMIN') {
    if (!actor.municipalityId) {
      throw new ApiError('No municipality assigned to this admin', 403);
    }
    if (municipalityIdParam && municipalityIdParam !== actor.municipalityId) {
      throw new ApiError('You can only view your assigned municipality', 403);
    }
    municipalityId = actor.municipalityId;
  } else {
    throw new ApiError('Forbidden', 403);
  }

  const municipality = await municipalityRepository.findById(municipalityId);
  if (!municipality) {
    throw new ApiError('Municipality not found', 404);
  }

  const raw = await analyticsRepository.getMunicipalityStats(municipalityId);

  const orderCounts = {
    PENDING: 0,
    CONFIRMED: 0,
    PREPARING: 0,
    READY: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };
  let totalOrders = 0;
  for (const row of raw.ordersByStatus) {
    orderCounts[row.status] = row._count._all;
    totalOrders += row._count._all;
  }

  const productCounts = {
    PENDING: 0,
    APPROVED: 0,
    HIDDEN: 0,
    SUSPENDED: 0,
    ARCHIVED: 0,
  };
  let totalProducts = 0;
  for (const row of raw.productsByStatus) {
    productCounts[row.status] = row._count._all;
    totalProducts += row._count._all;
  }

  const salesByDay = {};
  for (const order of raw.recentCompletedOrders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    salesByDay[day] = (salesByDay[day] || 0) + Number(order.total);
  }

  return {
    municipality: {
      id: municipality.id,
      name: municipality.name,
      code: municipality.code,
    },
    users: {
      pendingSellers: raw.pendingSellers,
      approvedSellers: raw.approvedSellers,
    },
    stores: {
      active: raw.activeStores,
      suspended: raw.suspendedStores,
    },
    products: {
      total: totalProducts,
      counts: productCounts,
    },
    orders: {
      total: totalOrders,
      counts: orderCounts,
    },
    revenue: {
      total: Number(raw.revenueAgg._sum.total || 0),
      completedOrders: raw.revenueAgg._count._all,
    },
    reports: {
      pending: raw.pendingReports,
      resolved: raw.resolvedReports,
    },
    salesByDay: Object.entries(salesByDay).map(([date, total]) => ({ date, total })),
    recentSellerApplications: raw.recentSellers,
    recentPendingProducts: raw.recentProducts,
  };
}

/**
 * Get platform-wide analytics (SUPER_ADMIN only)
 */
async function getPlatformAnalytics() {
  const raw = await analyticsRepository.getPlatformStats();

  const usersByRole = {
    BUYER: 0,
    SELLER: 0,
    MUNICIPAL_ADMIN: 0,
    SUPER_ADMIN: 0,
  };
  for (const row of raw.usersByRole) {
    usersByRole[row.role] = row._count._all;
  }

  const orderCounts = {
    PENDING: 0,
    CONFIRMED: 0,
    PREPARING: 0,
    READY: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };
  let totalOrders = 0;
  for (const row of raw.ordersByStatus) {
    orderCounts[row.status] = row._count._all;
    totalOrders += row._count._all;
  }

  const productCounts = {
    PENDING: 0,
    APPROVED: 0,
    HIDDEN: 0,
    SUSPENDED: 0,
    ARCHIVED: 0,
  };
  let totalProducts = 0;
  for (const row of raw.productsByStatus) {
    productCounts[row.status] = row._count._all;
    totalProducts += row._count._all;
  }

  const salesByDay = {};
  for (const order of raw.recentCompletedOrders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    salesByDay[day] = (salesByDay[day] || 0) + Number(order.total);
  }

  // salesByMunicipality: need to map storeId -> municipalityId
  const storeIds = raw.salesByMunicipality.map((row) => row.storeId);
  const stores = storeIds.length
    ? await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, municipalityId: true },
    })
    : [];
  const storeMuniMap = Object.fromEntries(stores.map((s) => [s.id, s.municipalityId]));

  const muniAgg = {};
  for (const row of raw.salesByMunicipality) {
    const muniId = storeMuniMap[row.storeId];
    if (!muniId) continue;
    if (!muniAgg[muniId]) muniAgg[muniId] = { revenue: 0, orders: 0 };
    muniAgg[muniId].revenue += Number(row._sum.total || 0);
    muniAgg[muniId].orders += row._count._all;
  }

  const salesByMunicipality = raw.municipalities.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    hasAdmin: !!m.adminId,
    revenue: muniAgg[m.id]?.revenue || 0,
    orders: muniAgg[m.id]?.orders || 0,
  }));

  return {
    usersByRole,
    stores: {
      total: raw.totalStores,
      active: raw.activeStores,
      suspended: raw.suspendedStores,
    },
    products: {
      total: totalProducts,
      counts: productCounts,
    },
    orders: {
      total: totalOrders,
      counts: orderCounts,
    },
    revenue: {
      total: Number(raw.revenueAgg._sum.total || 0),
      completedOrders: raw.revenueAgg._count._all,
    },
    pending: {
      sellers: raw.pendingSellers,
      products: raw.pendingProducts,
      reports: raw.pendingReports,
    },
    salesByDay: Object.entries(salesByDay).map(([date, total]) => ({ date, total })),
    salesByMunicipality,
  };
}
