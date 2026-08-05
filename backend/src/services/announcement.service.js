const prisma = require('../config/database');
const notificationService = require('./notification.service');
const auditLogService = require('./auditLog.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Announcement Service
 * Fan-out delivery via Notification records with SYSTEM_ANNOUNCEMENT type.
 */

const VALID_TARGETS = ['all', 'buyers', 'sellers', 'admins'];

/**
 * Broadcast an announcement
 * @param {Object} actor - Acting admin (MUNICIPAL_ADMIN | SUPER_ADMIN)
 * @param {Object} data - { title, message, target, municipalityId? }
 */
const broadcast = async (actor, data) => {
  const title = (data.title || '').trim();
  const message = (data.message || '').trim();
  const target = (data.target || 'all').toLowerCase();

  if (!title || title.length < 3) {
    throw new ApiError('Title must be at least 3 characters', 400);
  }
  if (!message || message.length < 5) {
    throw new ApiError('Message must be at least 5 characters', 400);
  }
  if (!VALID_TARGETS.includes(target)) {
    throw new ApiError('Invalid target audience', 400);
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

  const where = { deletedAt: null };
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

  const recipients = await prisma.user.findMany({
    where,
    select: { id: true },
  });

  if (recipients.length === 0) {
    return { delivered: 0, target, municipalityId };
  }

  // Bulk create notifications
  await prisma.notification.createMany({
    data: recipients.map((u) => ({
      userId: u.id,
      type: 'SYSTEM_ANNOUNCEMENT',
      title,
      message,
      isRead: false,
    })),
  });

  // Audit trail
  await auditLogService.record({
    actor,
    action: 'BROADCAST_ANNOUNCEMENT',
    entity: 'Announcement',
    details: {
      title,
      target,
      municipalityId,
      recipients: recipients.length,
    },
  });

  return { delivered: recipients.length, target, municipalityId };
};

module.exports = { broadcast };
