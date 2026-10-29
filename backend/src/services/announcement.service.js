const prisma = require('../config/database');
const auditLogService = require('./auditLog.service');
const { cleanText } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Announcement Service
 * Fan-out delivery via Notification records with SYSTEM_ANNOUNCEMENT type.
 */

const VALID_TARGETS = ['all', 'buyers', 'sellers', 'admins'];

/**
 * Which inbox each target writes to.
 *
 * A seller is also a buyer and has two separate feeds — the buyer bell and the
 * seller dashboard. Leaving every announcement in the buyer feed (the schema
 * default) meant a "sellers only" or "admins only" broadcast was written to a
 * feed the recipient never opens for that role, so it was delivered and
 * counted but never actually seen. "All users" stays in the buyer feed because
 * that is the one inbox every account has.
 */
const AUDIENCE_BY_TARGET = {
  all: 'BUYER',
  buyers: 'BUYER',
  sellers: 'SELLER',
  admins: 'ADMIN',
};

// MySQL has a finite packet size; a platform-wide broadcast is written in
// batches so a large user base cannot fail the whole send.
const INSERT_CHUNK = 500;

/**
 * Who an announcement reaches: the target, the town it is limited to, and
 * the people. Shared by the count shown before sending and the send itself,
 * so the two always agree.
 * @param {Object} actor - Acting admin (MUNICIPAL_ADMIN | SUPER_ADMIN)
 * @param {Object} data - { target, municipalityId? }
 */
const audienceOf = (actor, data = {}) => {
  const target = (data.target || 'all').toLowerCase();
  if (!VALID_TARGETS.includes(target)) {
    throw new ApiError('Invalid target audience', 400);
  }

  // Broadcasting to administrators is a platform-level act. The UI only hid
  // the option from municipal admins, so the API accepted it from anyone —
  // a municipal admin could message every admin on the platform.
  if (target === 'admins' && actor.role !== 'SUPER_ADMIN') {
    throw new ApiError('Only a super admin can broadcast to administrators', 403);
  }

  let municipalityId = data.municipalityId || null;

  if (actor.role === 'MUNICIPAL_ADMIN') {
    if (!actor.municipalityId) {
      throw new ApiError('No municipality assigned', 403);
    }
    if (municipalityId && municipalityId !== actor.municipalityId) {
      throw new ApiError('You can only broadcast within your municipality', 403);
    }
    municipalityId = actor.municipalityId;
  }
  // SUPER_ADMIN may pass municipalityId (scoped) or leave it null (platform-wide)

  // Deactivated and deleted accounts are skipped: writing to them inflates the
  // delivered count with notifications nobody can ever open.
  const where = { deletedAt: null, isActive: true };
  if (municipalityId) where.municipalityId = municipalityId;

  if (target === 'buyers') {
    where.role = 'BUYER';
  } else if (target === 'sellers') {
    where.role = 'SELLER';
  } else if (target === 'admins') {
    where.role = { in: ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'] };
  } else {
    // all
    where.role = { in: ['BUYER', 'SELLER'] };
  }
  return { target, municipalityId, where };
};

/** Before sending: how many people it would reach. */
const preview = async (actor, data) => {
  const { target, municipalityId, where } = audienceOf(actor, data);
  const recipients = await prisma.user.count({ where });
  const municipality = municipalityId
    ? await prisma.municipality.findUnique({ where: { id: municipalityId }, select: { id: true, name: true } })
    : null;
  return { recipients, target, municipality };
};

/**
 * Broadcast an announcement
 * @param {Object} actor - Acting admin (MUNICIPAL_ADMIN | SUPER_ADMIN)
 * @param {Object} data - { title, message, target, municipalityId? }
 */
const broadcast = async (actor, data) => {
  // Announcement text is rendered in three clients and a push payload, so it is
  // stripped of markup here rather than trusted to each of them.
  const title = cleanText((data.title || '').trim(), { maxLength: 120 });
  const message = cleanText((data.message || '').trim(), { maxLength: 1000 });

  if (!title || title.length < 3) {
    throw new ApiError('Title must be at least 3 characters', 400);
  }
  if (!message || message.length < 5) {
    throw new ApiError('Message must be at least 5 characters', 400);
  }
  const { target, municipalityId, where } = audienceOf(actor, data);

  const recipients = await prisma.user.findMany({
    where,
    select: { id: true },
  });

  if (recipients.length === 0) {
    return { delivered: 0, target, municipalityId };
  }

  const audience = AUDIENCE_BY_TARGET[target];

  // Every batch in one transaction: a send that fails part-way delivers
  // nothing, so the admin can retry without anyone getting it twice. It also
  // commits once rather than once per batch.
  const batches = [];
  for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
    batches.push(prisma.notification.createMany({
      data: recipients.slice(i, i + INSERT_CHUNK).map((u) => ({
        userId: u.id,
        type: 'SYSTEM_ANNOUNCEMENT',
        audience,
        title,
        message,
        isRead: false,
      })),
    }));
  }
  await prisma.$transaction(batches);

  // Audit trail. Written after the send, because the Sent list reads it as
  // the record of what went out.
  await auditLogService.record({
    actor,
    action: 'BROADCAST_ANNOUNCEMENT',
    entity: 'Announcement',
    details: {
      title,
      message,
      target,
      audience,
      municipalityId,
      recipients: recipients.length,
    },
    municipalityId,
  });

  return { delivered: recipients.length, target, audience, municipalityId };
};

/**
 * Announcements already sent, newest first.
 *
 * Broadcasts are fan-outs rather than rows of their own, so the audit trail is
 * the record of what went out. A municipal admin sees their municipality's.
 * @param {Object} actor
 * @param {Object} options - { page, pageSize }
 */
const listSent = async (actor, options = {}) => {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(options.pageSize) || 10));

  const { logs, total } = await auditLogService.list({
    page,
    pageSize,
    action: 'BROADCAST_ANNOUNCEMENT',
    entity: 'Announcement',
    ...(actor.role === 'MUNICIPAL_ADMIN' ? { municipalityId: actor.municipalityId } : {}),
  });

  // Who sent each, by name (the log keeps the email).
  const senderIds = [...new Set(logs.map((log) => log.userId).filter(Boolean))];
  const names = senderIds.length
    ? new Map((await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, fullName: true } }))
      .map((u) => [u.id, u.fullName]))
    : new Map();
  const townIds = [...new Set(logs.map((log) => log.details?.municipalityId).filter(Boolean))];
  const towns = townIds.length
    ? new Map((await prisma.municipality.findMany({ where: { id: { in: townIds } }, select: { id: true, name: true } }))
      .map((t) => [t.id, t.name]))
    : new Map();

  return {
    announcements: logs.map((log) => ({
      id: log.id,
      title: log.details?.title || '(untitled)',
      message: log.details?.message || '',
      target: log.details?.target || 'all',
      recipients: log.details?.recipients ?? 0,
      municipalityId: log.details?.municipalityId || null,
      sentBy: names.get(log.userId) || log.userEmail,
      municipalityName: towns.get(log.details?.municipalityId) || null,
      sentAt: log.createdAt,
    })),
    total,
    page,
    pageSize,
  };
};

module.exports = { broadcast, preview, listSent };
