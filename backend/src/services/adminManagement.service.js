const prisma = require('../config/database');
const userRepository = require('../repositories/user.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const auditLogService = require('./auditLog.service');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Admin Management Service
 * Super Admin CRUD for MUNICIPAL_ADMIN accounts.
 * A municipality has one primary admin (Municipality.adminId) and may have
 * backup admins with an access end date (User.adminAccessExpiresAt) who
 * cover leave; they share the same municipality-scoped permissions.
 */

const MAX_BACKUP_DAYS = 90;

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
        municipality: { select: { id: true, name: true, code: true, adminId: true } },
        adminAccessExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    admins: admins.map(({ municipality, ...admin }) => ({
      ...admin,
      municipality: municipality && { id: municipality.id, name: municipality.name, code: municipality.code },
      isPrimary: municipality?.adminId === admin.id,
      isBackup: Boolean(admin.adminAccessExpiresAt),
    })),
    total,
    page,
    pageSize,
  };
};

/**
 * Promote an existing user to MUNICIPAL_ADMIN and pin them to a municipality.
 * Also updates Municipality.adminId (single-admin per municipality).
 */
const assignJuniorAdmin = async (actor, { userId, municipalityId, backup = false, accessExpiresAt } = {}) => {
  if (!userId) throw new ApiError('userId is required', 400);
  if (!municipalityId) throw new ApiError('municipalityId is required', 400);
  if (backup) return assignBackupAdmin(actor, { userId, municipalityId, accessExpiresAt });

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
      data: { role: 'MUNICIPAL_ADMIN', municipalityId, adminAccessExpiresAt: null },
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
      data: { role: 'BUYER', adminAccessExpiresAt: null },
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

/**
 * Give a user temporary municipal admin access (e.g. while the primary admin
 * is on leave). Does not replace the municipality's primary admin.
 */
async function assignBackupAdmin(actor, { userId, municipalityId, accessExpiresAt }) {
  const expiresAt = new Date(accessExpiresAt);
  const now = Date.now();
  if (!accessExpiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
    throw new ApiError('Backup admins need an end date in the future', 400);
  }
  if (expiresAt.getTime() - now > MAX_BACKUP_DAYS * 24 * 60 * 60 * 1000) {
    throw new ApiError(`Backup access can last at most ${MAX_BACKUP_DAYS} days`, 400);
  }

  const [user, municipality] = await Promise.all([
    userRepository.findById(userId),
    municipalityRepository.findById(municipalityId),
  ]);
  if (!user || user.deletedAt) throw new ApiError('User not found', 404);
  if (!municipality) throw new ApiError('Municipality not found', 404);
  if (user.role === 'SUPER_ADMIN') throw new ApiError('Super admins already have full access', 400);
  if (municipality.adminId === userId) throw new ApiError('This user is already the primary admin', 400);
  if (user.role === 'MUNICIPAL_ADMIN' && user.municipalityId !== municipalityId) {
    throw new ApiError('This user already administers another municipality', 400);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: 'MUNICIPAL_ADMIN', municipalityId, adminAccessExpiresAt: expiresAt },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      municipalityId: true,
      adminAccessExpiresAt: true,
      municipality: { select: { id: true, name: true, code: true } },
    },
  });

  await auditLogService.record({
    actor,
    action: 'ASSIGN_BACKUP_ADMIN',
    entity: 'User',
    entityId: userId,
    details: { municipalityId, accessExpiresAt: expiresAt.toISOString() },
    municipalityId,
  });

  try {
    await notificationService.createNotification({
      userId,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'Backup admin access granted',
      message: `You can act as a municipal admin for ${municipality.name} until ${expiresAt.toLocaleDateString('en-PH')}.`,
      relatedId: municipalityId,
    });
  } catch (err) {
    console.error('[assignBackupAdmin] notify failed:', err.message);
  }

  return { ...updated, isPrimary: false, isBackup: true };
}

module.exports = {
  listJuniorAdmins,
  assignJuniorAdmin,
  removeJuniorAdmin,
};
