const auditLogRepository = require('../repositories/auditLog.repository');
const prisma = require('../config/database');

/**
 * Audit Log Service
 * Records administrative and moderation actions. Never throws.
 */

/**
 * Record an audit event. Errors are swallowed so audit failures never block business flow.
 * @param {Object} params
 * @param {Object|null} params.actor - req.user (id/email)
 * @param {String} params.action - e.g. 'APPROVE_SELLER', 'SUSPEND_PRODUCT'
 * @param {String} params.entity - e.g. 'User', 'Product', 'Report'
 * @param {String} [params.entityId]
 * @param {Object} [params.details]
 * @param {Object} [params.req] - optional Express req for IP/UA capture
 * @param {String} [params.municipalityId] - municipality the action concerns;
 *   defaults to a municipal admin actor's own municipality
 */
const record = async ({ actor, action, entity, entityId, details, req, municipalityId }) => {
  try {
    await auditLogRepository.create({
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action,
      entity,
      entityId: entityId || null,
      // A superadmin acting as this seller is written down beside the
      // seller's own name, so nothing done inside the account is anonymous.
      details: req?.actingAdmin
        ? { ...(details || {}), actingAdmin: req.actingAdmin }
        : (details || null),
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      userAgent: req?.headers?.['user-agent'] || null,
      municipalityId: municipalityId
        || (actor?.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : null)
        || null,
    });
  } catch (err) {
    console.error('[auditLog] failed:', err.message);
  }
};

const list = async (options) => auditLogRepository.findAll(options);

const idsOf = (logs, entity) => [...new Set(logs.filter((l) => l.entity === entity && l.entityId).map((l) => l.entityId))];

/**
 * How each kind of record is named on the audit page, read a page of ids
 * at a time: { id: { name, slug?, role? } }. A record that has since been
 * deleted simply has no name.
 */
const NAMERS = {
  User: (ids) => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true } })
    .then((rows) => rows.map((u) => [u.id, { name: u.fullName, role: u.role }])),
  // An ID check is filed under the person it is about.
  IdentityVerification: (ids) => NAMERS.User(ids),
  Product: (ids) => prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
    .then((rows) => rows.map((p) => [p.id, { name: p.name, slug: p.slug }])),
  Store: (ids) => prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
    .then((rows) => rows.map((s) => [s.id, { name: s.name, slug: s.slug }])),
  Order: (ids) => prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, orderNumber: true } })
    .then((rows) => rows.map((o) => [o.id, { name: o.orderNumber }])),
  ReturnRequest: (ids) => prisma.returnRequest.findMany({ where: { id: { in: ids } }, select: { id: true, requestNumber: true } })
    .then((rows) => rows.map((r) => [r.id, { name: r.requestNumber }])),
  Municipality: (ids) => prisma.municipality.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    .then((rows) => rows.map((m) => [m.id, { name: m.name }])),
  Courier: (ids) => prisma.courier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    .then((rows) => rows.map((c) => [c.id, { name: c.name }])),
  // A report by what it is about.
  Report: (ids) => prisma.report.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      type: true,
      product: { select: { name: true } },
      reportedSeller: { select: { fullName: true, store: { select: { name: true } } } },
      reportedBuyer: { select: { fullName: true } },
    },
  }).then((rows) => rows.map((r) => [r.id, {
    name: `Report on ${r.product?.name || r.reportedSeller?.store?.name || r.reportedSeller?.fullName || r.reportedBuyer?.fullName || 'a deleted record'}`,
  }])),
  Review: (ids) => prisma.review.findMany({ where: { id: { in: ids } }, select: { id: true, product: { select: { name: true } } } })
    .then((rows) => rows.map((r) => [r.id, { name: `Review of ${r.product?.name || 'a product'}` }])),
  SupportConversation: (ids) => prisma.supportConversation.findMany({
    where: { id: { in: ids } },
    select: { id: true, subject: true, user: { select: { fullName: true } } },
  }).then((rows) => rows.map((c) => [c.id, { name: [c.user?.fullName, c.subject].filter(Boolean).join(': ') || 'Support case' }])),
  EmailBroadcast: (ids) => prisma.emailBroadcast.findMany({ where: { id: { in: ids } }, select: { id: true, subject: true } })
    .then((rows) => rows.map((e) => [e.id, { name: e.subject }])),
};

/**
 * A page of audit rows with names instead of ids: `actorName` (who did it)
 * and `record` ({ name, slug, role }, what it was done to), so the page
 * shows "Ana Cruz suspended Mango" rather than an email and a hash.
 */
const describe = async (logs) => {
  if (!logs.length) return logs;
  const actorIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
  const [actors, ...named] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [],
    ...Object.entries(NAMERS).map(async ([entity, namer]) => {
      const ids = idsOf(logs, entity);
      return [entity, new Map(ids.length ? await namer(ids).catch(() => []) : [])];
    }),
  ]);
  const actorById = new Map(actors.map((u) => [u.id, u.fullName]));
  const records = Object.fromEntries(named);
  return logs.map((l) => ({
    ...l,
    actorName: (l.userId && actorById.get(l.userId)) || null,
    record: (l.entityId && records[l.entity]?.get(l.entityId)) || null,
  }));
};

/**
 * The people who appear in an audit log (for its "By" filter), most active
 * first: a municipal admin only sees people with entries for their town.
 */
const listActors = async ({ municipalityId } = {}) => {
  const groups = await prisma.auditLog.groupBy({
    by: ['userId'],
    where: { userId: { not: null }, ...(municipalityId && { municipalityId }) },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 100,
  });
  const ids = groups.map((g) => g.userId);
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return groups.filter((g) => byId.has(g.userId)).map((g) => ({
    id: g.userId,
    fullName: byId.get(g.userId).fullName,
    role: byId.get(g.userId).role,
    entries: g._count._all,
    lastAt: g._max.createdAt,
  }));
};

module.exports = { record, list, describe, listActors };
