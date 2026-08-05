const prisma = require('../config/database');
const userRepository = require('../repositories/user.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const auditLogService = require('./auditLog.service');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Admin Management Service
 * Super Admin CRUD for MUNICIPAL_ADMIN accounts.
 * Assigning an admin also sets Municipality.adminId in the same transaction.
 */

const listJuniorAdmins = async (options = {}) => {
  const { page = 1, pageSize = 25, search, municipalityId } = options;

  const where = {
    role: 'MUNICIPAL_ADMIN',
    deletedAt: null,
  };
  if (municipalityId) where.municipalityId = municipalityId;
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const [admins, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        contactNumber: true,
        municipalityId: true,
        municipality: { select: { id: true, name: true, code: true } },
        createdAt: true,
        updatedAt: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return { admins, total, page, pageSize };
};

/**
 * Promote an existing user to MUNICIPAL_ADMIN and pin them to a municipality.
 * Also updates Municipality.adminId (single-admin per municipality).
 */
const assignJuniorAdmin = async (actor, { userId, municipalityId }) => {
  if (!userId) throw new ApiError('userId is required', 400);
  if (!municipalityId) throw new ApiError('municipalityId is required', 400);

  const [user, municipality] = await Promise.all([
    userRepository.findById(userId),
    municipalityRepository.findById(municipalityId),
  ]);
  if (!user || user.deletedAt) throw new ApiError('User not found', 404);
  if (!municipality) throw new ApiError('Municipality not found', 404);
  if (user.role === 'SUPER_ADMIN') {
    throw new ApiError('Cannot demote a super admin', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // If municipality already has a different admin, demote them
    if (municipality.adminId && municipality.adminId !== userId) {
      await tx.user.update({
        where: { id: municipality.adminId },
        data: { role: 'BUYER' },
      });
    }
    // If user was admin somewhere else, clear that municipality's adminId
    if (user.role === 'MUNICIPAL_ADMIN' && user.municipalityId && user.municipalityId !== municipalityId) {
      await tx.municipality.updateMany({
        where: { adminId: userId },
        data: { adminId: null },
      });
    }
    const nextUser = await tx.user.update({
      where: { id: userId },
      data: { role: 'MUNICIPAL_ADMIN', municipalityId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        municipalityId: true,
        municipality: { select: { id: true, name: true, code: true } },
      },
    });
    await tx.municipality.update({
      where: { id: municipalityId },
      data: { adminId: userId },
    });
    return nextUser;
  });

  await auditLogService.record({
    actor,
    action: 'ASSIGN_MUNICIPAL_ADMIN',
    entity: 'User',
    entityId: userId,
    details: { municipalityId },
  });

  try {
    await notificationService.createNotification({
      userId,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'You are now a Municipal Admin',
      message: `You have been assigned as the municipal administrator of ${municipality.name}.`,
      relatedId: municipalityId,
    });
  } catch (err) {
    console.error('[assignJuniorAdmin] notify failed:', err.message);
  }

  return updated;
};

/**
 * Remove MUNICIPAL_ADMIN role from a user (demote to BUYER) and clear
 * their assignment on the Municipality record.
 */
const removeJuniorAdmin = async (actor, userId) => {
  const user = await userRepository.findById(userId);
  if (!user || user.deletedAt) throw new ApiError('User not found', 404);
  if (user.role !== 'MUNICIPAL_ADMIN') {
    throw new ApiError('User is not a municipal admin', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.municipality.updateMany({
      where: { adminId: userId },
      data: { adminId: null },
    });
    return tx.user.update({
      where: { id: userId },
      data: { role: 'BUYER' },
      select: { id: true, fullName: true, email: true, role: true },
    });
  });

  await auditLogService.record({
    actor,
    action: 'REMOVE_MUNICIPAL_ADMIN',
    entity: 'User',
    entityId: userId,
  });

  return updated;
};

module.exports = {
  listJuniorAdmins,
  assignJuniorAdmin,
  removeJuniorAdmin,
};
