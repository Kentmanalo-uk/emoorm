const prisma = require('../config/database');
const appSettingService = require('./appSetting.service');
const auditLogService = require('./auditLog.service');
const notificationService = require('./notification.service');
const mfaService = require('./mfa.service');
const { sendAdminTeamEmail } = require('../utils/email');
const { ApiError } = require('../middleware/errorHandler');

/**
 * A town's admin team, run by the town's own admins.
 *
 * The team is every municipal admin of the town: the primary admin (the
 * super admin's pick, Municipality.adminId), the admins the team added, and
 * backups whose access ends on a date. Any permanent admin on the team may
 * add another; a backup may not. Adding asks for the adder's authenticator
 * code, and the team is capped (AppSetting.adminTeamMax, the primary admin
 * included).
 *
 * Removing: the primary admin (and the super admin) may remove anyone but the
 * primary admin; another admin only those they added. Only the super admin
 * changes the primary admin (Admin management).
 */

const MAX_BACKUP_DAYS = 90;
const ONLINE_MS = 5 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const MEMBER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  profilePhoto: true,
  isActive: true,
  mfaEnabled: true,
  lastActiveAt: true,
  adminAccessExpiresAt: true,
  adminAddedById: true,
  adminAddedBy: { select: { id: true, fullName: true } },
  createdAt: true,
};

/** The town a request is about: the admin's own, or the one a super admin names. */
const townOf = async (actor, municipalityId) => {
  const id = actor.role === 'SUPER_ADMIN' ? municipalityId : actor.municipalityId;
  if (!id) throw new ApiError(actor.role === 'SUPER_ADMIN' ? 'Choose a municipality' : 'No municipality is assigned to you', 400);
  const town = await prisma.municipality.findUnique({ where: { id }, select: { id: true, name: true, adminId: true } });
  if (!town) throw new ApiError('Municipality not found', 404);
  return town;
};

/** The town's admins now (a backup whose time is up is no longer one). */
const membersOf = (townId) => prisma.user.findMany({
  where: {
    role: 'MUNICIPAL_ADMIN',
    municipalityId: townId,
    deletedAt: null,
    OR: [{ adminAccessExpiresAt: null }, { adminAccessExpiresAt: { gt: new Date() } }],
  },
  select: MEMBER_SELECT,
  orderBy: { createdAt: 'asc' },
});

const kindOf = (member, town) => {
  if (member.id === town.adminId) return 'PRIMARY';
  return member.adminAccessExpiresAt ? 'BACKUP' : 'ADMIN';
};

/** Whether actor may add admins to this town. */
const canAdd = (actor, town) => actor.role === 'SUPER_ADMIN'
  || (actor.role === 'MUNICIPAL_ADMIN' && actor.municipalityId === town.id && !actor.adminAccessExpiresAt);

/** Whether actor may remove (or extend) this member. */
const canManage = (actor, member, town) => {
  if (member.id === town.adminId || member.id === actor.id) return false;
  if (actor.role === 'SUPER_ADMIN' || actor.id === town.adminId) return true;
  return member.adminAddedById === actor.id && canAdd(actor, town);
};

/** The actor's own admin record: whether they are a backup. */
const withAccess = async (actor) => {
  if (actor.role !== 'MUNICIPAL_ADMIN') return actor;
  const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { adminAccessExpiresAt: true } });
  return { ...actor, adminAccessExpiresAt: me?.adminAccessExpiresAt || null };
};

const present = (member, town, actor, now) => ({
  id: member.id,
  fullName: member.fullName,
  email: member.email,
  profilePhoto: member.profilePhoto,
  kind: kindOf(member, town),
  accessExpiresAt: member.adminAccessExpiresAt,
  addedBy: member.adminAddedBy,
  isActive: member.isActive,
  mfaEnabled: member.mfaEnabled,
  lastActiveAt: member.lastActiveAt,
  online: Boolean(member.lastActiveAt && now - member.lastActiveAt.getTime() < ONLINE_MS),
  isYou: member.id === actor.id,
  canRemove: canManage(actor, member, town),
});

const teamMax = async () => {
  const settings = await appSettingService.get();
  return Number(settings.adminTeamMax) || 5;
};

/** The team, as the page shows it. */
const list = async (actorIn, { municipalityId } = {}) => {
  const actor = await withAccess(actorIn);
  const town = await townOf(actor, municipalityId);
  const [members, max] = await Promise.all([membersOf(town.id), teamMax()]);
  const now = Date.now();
  const kindRank = { PRIMARY: 0, ADMIN: 1, BACKUP: 2 };
  return {
    municipality: { id: town.id, name: town.name },
    max,
    canAdd: canAdd(actor, town) && members.length < max,
    canAddAtAll: canAdd(actor, town),
    members: members
      .map((m) => present(m, town, actor, now))
      .sort((a, b) => kindRank[a.kind] - kindRank[b.kind]),
  };
};

/** Why this account can't join this town's team, or null. */
const refusal = (user, town) => {
  if (!user.isVerified) return "This account hasn't confirmed its email yet.";
  if (!user.isActive) return 'This account is suspended.';
  if (user.role === 'SUPER_ADMIN') return 'Super admins already have full access.';
  if (user.role === 'SELLER') return "This account runs a shop. A shop owner can't also be an admin.";
  if (user.role === 'MUNICIPAL_ADMIN') {
    return user.municipalityId === town.id ? 'Already on the team.' : 'This account is an admin of another town.';
  }
  return null;
};

const findByEmail = (email) => prisma.user.findFirst({
  where: { email: String(email || '').trim().toLowerCase(), deletedAt: null },
  select: {
    id: true, fullName: true, email: true, profilePhoto: true, role: true, municipalityId: true, isVerified: true, isActive: true,
  },
});

/** Finds the account to add, by its exact email. */
const lookup = async (actorIn, { email, municipalityId } = {}) => {
  const actor = await withAccess(actorIn);
  const town = await townOf(actor, municipalityId);
  if (!canAdd(actor, town)) throw new ApiError("Backup admins can't add admins", 403);
  if (!/^\S+@\S+\.\S+$/.test(String(email || '').trim())) throw new ApiError('Enter an email address', 400);
  const user = await findByEmail(email);
  if (!user) throw new ApiError('No Emoorm account uses this email. Ask them to sign up first.', 404);
  return {
    user: { id: user.id, fullName: user.fullName, email: user.email, profilePhoto: user.profilePhoto },
    reason: refusal(user, town),
  };
};

const endDate = (value) => {
  const at = new Date(value);
  if (!value || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
    throw new ApiError('Backup admins need an end date in the future', 400);
  }
  if (at.getTime() - Date.now() > MAX_BACKUP_DAYS * DAY) {
    throw new ApiError(`Backup access can last at most ${MAX_BACKUP_DAYS} days`, 400);
  }
  return at;
};

/** Adds an account to the team, after the adder's authenticator code. */
const add = async (actorIn, {
  email, kind = 'ADMIN', accessExpiresAt, code, municipalityId,
} = {}, req = null) => {
  const actor = await withAccess(actorIn);
  const town = await townOf(actor, municipalityId);
  if (!canAdd(actor, town)) throw new ApiError("Backup admins can't add admins", 403);
  if (!['ADMIN', 'BACKUP'].includes(kind)) throw new ApiError('kind must be ADMIN or BACKUP', 400);
  const until = kind === 'BACKUP' ? endDate(accessExpiresAt) : null;

  const user = await findByEmail(email);
  if (!user) throw new ApiError('No Emoorm account uses this email. Ask them to sign up first.', 404);
  const why = refusal(user, town);
  if (why) throw new ApiError(why, 400);

  const [members, max] = await Promise.all([membersOf(town.id), teamMax()]);
  if (members.length >= max) throw new ApiError(`The team is full (${max} admins). Remove someone first.`, 400);

  await mfaService.confirmCode(actor.id, code);

  // Only a buyer account becomes an admin, and only once (two adds at once).
  const changed = await prisma.user.updateMany({
    where: { id: user.id, role: 'BUYER', deletedAt: null },
    data: {
      role: 'MUNICIPAL_ADMIN',
      municipalityId: town.id,
      adminAccessExpiresAt: until,
      adminAddedById: actor.id,
    },
  });
  if (!changed.count) throw new ApiError('This account changed meanwhile. Look it up again.', 409);

  await auditLogService.record({
    actor,
    action: kind === 'BACKUP' ? 'ASSIGN_BACKUP_ADMIN' : 'ADD_TEAM_ADMIN',
    entity: 'User',
    entityId: user.id,
    details: { municipalityId: town.id, ...(until ? { accessExpiresAt: until.toISOString() } : {}) },
    municipalityId: town.id,
    req,
  });

  const untilText = until ? until.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  notificationService.createNotification({
    userId: user.id,
    type: 'SYSTEM_ANNOUNCEMENT',
    title: `You're now an admin for ${town.name}`,
    message: `${actor.fullName || 'An admin'} added you to the admin team${untilText ? ` until ${untilText}` : ''}. Sign in again to start.`,
    relatedId: town.id,
    audience: 'ADMIN',
    target: { kind: 'admin-dashboard' },
  }).catch((err) => console.error('[adminTeam] notify failed:', err.message));
  Promise.resolve()
    .then(() => sendAdminTeamEmail({ user, town: town.name, addedBy: actor.fullName || 'An admin', until: untilText }))
    .catch((err) => console.error('[adminTeam] email failed:', err.message));

  const member = await prisma.user.findUnique({ where: { id: user.id }, select: MEMBER_SELECT });
  return present(member, town, actor, Date.now());
};

const memberFor = async (actor, town, id) => {
  const member = await prisma.user.findFirst({
    where: { id, role: 'MUNICIPAL_ADMIN', municipalityId: town.id, deletedAt: null },
    select: MEMBER_SELECT,
  });
  if (!member) throw new ApiError('Not on this team', 404);
  if (!canManage(actor, member, town)) {
    throw new ApiError(member.id === town.adminId
      ? 'Only the super admin can change the primary admin.'
      : 'Only the primary admin, or whoever added them, can change this admin.', 403);
  }
  return member;
};

/** Takes an admin off the team: back to an ordinary account. */
const remove = async (actorIn, id, { municipalityId } = {}, req = null) => {
  const actor = await withAccess(actorIn);
  const town = await townOf(actor, municipalityId);
  const member = await memberFor(actor, town, id);
  await prisma.user.update({
    where: { id: member.id },
    data: { role: 'BUYER', adminAccessExpiresAt: null, adminAddedById: null },
  });
  await auditLogService.record({
    actor, action: 'REMOVE_TEAM_ADMIN', entity: 'User', entityId: member.id, details: { municipalityId: town.id }, municipalityId: town.id, req,
  });
  notificationService.createNotification({
    userId: member.id,
    type: 'SYSTEM_ANNOUNCEMENT',
    title: 'Admin access ended',
    message: `You are no longer on the admin team for ${town.name}.`,
    relatedId: town.id,
    audience: 'BUYER',
  }).catch((err) => console.error('[adminTeam] notify failed:', err.message));
  return { id: member.id };
};

/** Moves a backup admin's end date. */
const extend = async (actorIn, id, { accessExpiresAt, municipalityId } = {}, req = null) => {
  const actor = await withAccess(actorIn);
  const town = await townOf(actor, municipalityId);
  const member = await memberFor(actor, town, id);
  if (!member.adminAccessExpiresAt) throw new ApiError('Only a backup admin has an end date', 400);
  const until = endDate(accessExpiresAt);
  const updated = await prisma.user.update({ where: { id: member.id }, data: { adminAccessExpiresAt: until }, select: MEMBER_SELECT });
  await auditLogService.record({
    actor, action: 'EXTEND_BACKUP_ADMIN', entity: 'User', entityId: member.id, details: { accessExpiresAt: until.toISOString() }, municipalityId: town.id, req,
  });
  return present(updated, town, actor, Date.now());
};

module.exports = {
  list, lookup, add, remove, extend, membersOf, ONLINE_MS,
};
