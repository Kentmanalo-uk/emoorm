const prisma = require('../config/database');
const config = require('../config/env');
const auditLogService = require('./auditLog.service');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Moderation Service
 * Admin work queues shared by municipal admins (scoped to their municipality)
 * and superadmins (all municipalities, optionally filtered).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PAYMENT_MS = DAY_MS;

// Municipal admins are always pinned to their own municipality.
const scopeOf = (actor, requested) => (
  actor.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : (requested || undefined)
);

const oldestOf = (rows, field) => rows.reduce((oldest, row) => {
  const value = row[field];
  return value && (!oldest || value < oldest) ? value : oldest;
}, null);

/**
 * Items waiting on an admin, with how long the oldest has been waiting.
 */
const getAttentionQueue = async (actor, { municipalityId } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const staleBefore = new Date(Date.now() - STALE_PAYMENT_MS);

  const [applications, products, reports, payments, returns, conversations] = await Promise.all([
    prisma.user.findMany({
      // An applicant may live in one municipality and open their shop in
      // another — the queue follows the shop, like the review itself.
      where: {
        sellerApplicationStatus: 'PENDING',
        deletedAt: null,
        ...(scope && { OR: [{ municipalityId: scope }, { shopMunicipalityId: scope }] }),
      },
      select: { sellerApplicationDate: true },
    }),
    prisma.product.findMany({
      where: { status: 'PENDING', deletedAt: null, ...(scope && { municipalityId: scope }) },
      select: { createdAt: true },
    }),
    prisma.report.findMany({
      where: { status: { in: ['PENDING', 'UNDER_REVIEW'] }, ...(scope && { municipalityId: scope }) },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: {
        paymentStatus: 'PENDING_VERIFICATION',
        status: { not: 'CANCELLED' },
        createdAt: { lt: staleBefore },
        ...(scope && { store: { municipalityId: scope } }),
      },
      select: { createdAt: true },
    }),
    prisma.returnRequest.findMany({
      where: { status: 'REQUESTED', ...(scope && { store: { municipalityId: scope } }) },
      select: { createdAt: true },
    }),
    prisma.supportConversation.findMany({
      where: { status: 'OPEN', ...(scope && { municipalityId: scope }) },
      select: {
        userId: true,
        lastMessageAt: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { senderId: true } },
      },
    }),
  ]);
  const awaiting = conversations.filter((c) => c.messages[0]?.senderId === c.userId);

  const items = [
    { key: 'sellerApplications', label: 'Seller applications to review', rows: applications, field: 'sellerApplicationDate', link: '/admin/sellers' },
    { key: 'pendingProducts', label: 'Products awaiting approval', rows: products, field: 'createdAt', link: '/admin/products' },
    { key: 'openReports', label: 'Open reports', rows: reports, field: 'createdAt', link: '/admin/reports' },
    { key: 'supportAwaiting', label: 'Support messages awaiting reply', rows: awaiting, field: 'lastMessageAt', link: '/admin/support' },
    { key: 'stalePayments', label: 'Prepaid payments unverified for over 24h', rows: payments, field: 'createdAt', link: '/admin/orders' },
    { key: 'openReturns', label: 'Return requests awaiting the seller', rows: returns, field: 'createdAt', link: '/admin/returns' },
  ];

  return items.map(({ rows, field, ...item }) => {
    const oldestAt = oldestOf(rows, field);
    const ageDays = oldestAt ? (Date.now() - new Date(oldestAt).getTime()) / DAY_MS : 0;
    return {
      ...item,
      count: rows.length,
      oldestAt,
      severity: rows.length === 0 ? 'none' : ageDays >= 3 ? 'high' : ageDays >= 1 ? 'medium' : 'low',
    };
  });
};

const listReviews = async (actor, { page = 1, pageSize = 20, search, rating, municipalityId } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const where = {
    deletedAt: null,
    ...(rating && { rating: Number(rating) }),
    product: { ...(scope && { municipalityId: scope }) },
  };
  if (search) {
    where.OR = [
      { comment: { contains: search } },
      { product: { name: { contains: search } } },
      { user: { fullName: { contains: search } } },
    ];
  }
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true } },
        product: {
          select: { id: true, name: true, slug: true, store: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.review.count({ where }),
  ]);
  return { items: reviews, total, page, pageSize };
};

const listReturns = async (actor, { page = 1, pageSize = 20, status, municipalityId } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const where = {
    ...(status && { status }),
    ...(scope && { store: { municipalityId: scope } }),
  };
  const [returns, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: {
        buyer: { select: { id: true, fullName: true, email: true } },
        store: { select: { id: true, name: true, slug: true } },
        order: { select: { id: true, orderNumber: true, total: true } },
        items: { select: { id: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.returnRequest.count({ where }),
  ]);
  return { items: returns, total, page, pageSize };
};

const loadScopedUser = async (actor, userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      contactNumber: true,
      municipalityId: true,
      municipality: { select: { name: true } },
      barangay: true,
      address: true,
      province: true,
      deletedAt: true,
      identityVerification: {
        select: {
          status: true,
          idType: true,
          failureReason: true,
          attemptCount: true,
          lastAttemptAt: true,
          verifiedAt: true,
          reviewNote: true,
          reviewedById: true,
        },
      },
    },
  });
  if (!user || user.deletedAt) throw new ApiError('User not found', 404);
  if (actor.role === 'MUNICIPAL_ADMIN' && user.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only review users in your assigned municipality', 403);
  }
  return user;
};

/** Identity verification details an admin needs for an in-person check. */
const getIdentityForReview = async (actor, userId) => {
  const user = await loadScopedUser(actor, userId);
  const attemptsToday = await prisma.auditLog.count({
    where: { userId, action: 'IDENTITY_VERIFICATION_ATTEMPT', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  const { identityVerification, deletedAt, ...profile } = user;
  return {
    user: profile,
    verification: identityVerification || { status: 'NOT_VERIFIED' },
    attemptsToday,
    dailyLimit: config.identity.maxAttemptsPerDay || null,
  };
};

/**
 * Manual decision after the admin has checked the user's ID in person.
 * decision: VERIFIED | REJECTED
 */
const reviewIdentity = async (actor, userId, { decision, note } = {}, req = null) => {
  const normalized = String(decision || '').toUpperCase();
  if (!['VERIFIED', 'REJECTED'].includes(normalized)) {
    throw new ApiError('Decision must be VERIFIED or REJECTED', 400);
  }
  const reviewNote = String(note || '').trim();
  if (reviewNote.length < 5) throw new ApiError('Add a short note describing how you checked the ID', 400);

  const user = await loadScopedUser(actor, userId);
  const verified = normalized === 'VERIFIED';
  const data = {
    status: verified ? 'VERIFIED' : 'FAILED',
    idType: 'IN_PERSON',
    reviewedById: actor.id,
    reviewNote: reviewNote.slice(0, 1000),
    verifiedAt: verified ? new Date() : null,
    failureReason: verified ? null : `Your municipal admin could not verify your identity: ${reviewNote.slice(0, 300)}`,
    encryptedData: null,
    idNumberHash: null,
  };
  await prisma.identityVerification.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  await auditLogService.record({
    actor,
    action: verified ? 'IDENTITY_MANUAL_VERIFY' : 'IDENTITY_MANUAL_REJECT',
    entity: 'IdentityVerification',
    entityId: userId,
    details: { note: reviewNote.slice(0, 200) },
    municipalityId: user.municipalityId,
    req,
  });

  try {
    await notificationService.createNotification({
      userId,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: verified ? 'Your identity is verified' : 'Identity verification update',
      message: verified
        ? 'Your municipal admin verified your identity. You can now check out.'
        : data.failureReason,
      relatedId: userId,
      audience: 'BUYER',
    });
  } catch (err) {
    console.error('[reviewIdentity] notification failed:', err.message);
  }

  return getIdentityForReview(actor, userId);
};

/**
 * Stores that may need a follow-up, with the reasons:
 * no live products, high cancellation rate, low ratings, or no sales lately.
 */
const getStoreHealth = async (actor, { municipalityId, limit = 8 } = {}) => {
  const scope = scopeOf(actor, municipalityId);
  const since = new Date(Date.now() - 30 * DAY_MS);

  const stores = await prisma.store.findMany({
    where: { deletedAt: null, isActive: true, isSuspended: false, ...(scope && { municipalityId: scope }) },
    select: { id: true, name: true, slug: true, logo: true, createdAt: true, ownerId: true },
  });
  if (stores.length === 0) return [];
  const storeIds = stores.map((s) => s.id);

  const [liveProducts, recentOrders, ratings] = await Promise.all([
    prisma.product.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds }, status: 'APPROVED', deletedAt: null },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['storeId', 'status'],
      where: { storeId: { in: storeIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.review.findMany({
      where: { deletedAt: null, product: { storeId: { in: storeIds } } },
      select: { rating: true, product: { select: { storeId: true } } },
    }),
  ]);

  const liveByStore = new Map(liveProducts.map((r) => [r.storeId, r._count._all]));
  const ordersByStore = new Map();
  for (const row of recentOrders) {
    const cur = ordersByStore.get(row.storeId) || { total: 0, cancelled: 0 };
    cur.total += row._count._all;
    if (row.status === 'CANCELLED') cur.cancelled += row._count._all;
    ordersByStore.set(row.storeId, cur);
  }
  const ratingByStore = new Map();
  for (const r of ratings) {
    const id = r.product.storeId;
    const cur = ratingByStore.get(id) || { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    ratingByStore.set(id, cur);
  }

  const flagged = [];
  for (const store of stores) {
    const issues = [];
    const live = liveByStore.get(store.id) || 0;
    const orders = ordersByStore.get(store.id) || { total: 0, cancelled: 0 };
    const rating = ratingByStore.get(store.id);
    const avgRating = rating ? rating.sum / rating.count : null;
    const olderThan30Days = store.createdAt < since;

    if (live === 0) issues.push({ code: 'NO_PRODUCTS', label: 'No live products' });
    if (orders.total >= 3 && orders.cancelled / orders.total >= 0.3) {
      issues.push({ code: 'HIGH_CANCELLATIONS', label: `${Math.round((orders.cancelled / orders.total) * 100)}% cancelled` });
    }
    if (rating && rating.count >= 3 && avgRating < 3) {
      issues.push({ code: 'LOW_RATING', label: `${avgRating.toFixed(1)}★ average` });
    }
    if (live > 0 && olderThan30Days && orders.total === 0) {
      issues.push({ code: 'NO_SALES', label: 'No orders in 30 days' });
    }
    if (issues.length) {
      flagged.push({
        id: store.id,
        name: store.name,
        slug: store.slug,
        logo: store.logo,
        ownerId: store.ownerId,
        liveProducts: live,
        ordersLast30Days: orders.total,
        avgRating: avgRating === null ? null : Number(avgRating.toFixed(1)),
        issues,
      });
    }
  }

  // Most issues first; cancellations and low ratings outrank inactivity.
  const weight = { HIGH_CANCELLATIONS: 3, LOW_RATING: 3, NO_PRODUCTS: 1, NO_SALES: 1 };
  const score = (s) => s.issues.reduce((sum, i) => sum + (weight[i.code] || 1), 0);
  return flagged.sort((a, b) => score(b) - score(a)).slice(0, Math.min(20, Number(limit) || 8));
};

module.exports = {
  getStoreHealth,
  getAttentionQueue,
  listReviews,
  listReturns,
  getIdentityForReview,
  reviewIdentity,
};
