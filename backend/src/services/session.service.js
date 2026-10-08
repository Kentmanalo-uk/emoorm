const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Signed-in sessions the server can end.
 *
 * An access token is short-lived and checked only by its signature. The
 * refresh token that renews it carries a `jti`, and that id is a row here.
 * Renewing retires the row and writes the next one (rotation), signing out
 * revokes it, and "sign out everywhere" ends every session of the account.
 *
 * A retired refresh token presented again is the sign of a copied token
 * (the copy and the owner cannot both be the current one), so the whole
 * family is revoked and every session of the account is ended, the owner's
 * included: they sign in again, the thief does not.
 *
 * Refresh tokens issued before this existed carry no `jti`. They are renewed
 * once into a tracked session and die of old age otherwise, so nobody is
 * signed out by the deploy.
 */

const newId = () => crypto.randomBytes(16).toString('hex');

const expiryOf = (token) => {
  const exp = jwt.decode(token)?.exp;
  return new Date(exp ? exp * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000);
};

/**
 * A new session for an account: the token pair, with its refresh token on
 * record. `meta` (userAgent, ipAddress) is kept for a devices list.
 */
const issue = async (user, meta = {}, familyId = null) => {
  const jti = newId();
  const tokens = generateTokens(user, { jti });
  await prisma.refreshSession.create({
    data: {
      id: jti,
      userId: user.id,
      familyId: familyId || jti,
      expiresAt: expiryOf(tokens.refreshToken),
      userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
      ipAddress: meta.ipAddress ? String(meta.ipAddress).slice(0, 100) : null,
    },
  });
  return tokens;
};

/** Every session of the account ends; current access tokens die with them. */
const revokeAll = async (userId) => {
  await prisma.$transaction([
    prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
  ]);
};

/**
 * Renew: the refresh token's row must be current. Returns the next pair.
 * The caller has already verified the account (active, token version, role).
 */
const rotate = async (decoded, user, meta = {}) => {
  if (!decoded.jti) return issue(user, meta);
  const row = await prisma.refreshSession.findUnique({ where: { id: decoded.jti } });
  if (!row || row.userId !== user.id) throw new ApiError('Session expired', 401);
  if (row.revokedAt) {
    // Retired by a renewal, and used again: the renewal's holder and this
    // caller cannot both be the owner, so a copy is in play. A token that
    // was signed out (never replaced) is only a device forgetting its own
    // session; refusing it is enough.
    if (row.replacedBy) await revokeAll(user.id).catch(() => {});
    throw new ApiError('Session expired', 401);
  }
  if (row.expiresAt.getTime() < Date.now()) throw new ApiError('Session expired', 401);
  const tokens = await issue(user, meta, row.familyId);
  const next = jwt.decode(tokens.refreshToken)?.jti || null;
  await prisma.refreshSession.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedBy: next },
  });
  return tokens;
};

/**
 * Sign out of this device: the refresh token stops renewing. Silent when the
 * token is already invalid or untracked; the caller is leaving either way.
 */
const revoke = async (refreshToken, userId) => {
  if (!refreshToken) return false;
  let decoded;
  try {
    decoded = verifyRefreshToken(String(refreshToken));
  } catch {
    return false;
  }
  if (!decoded.jti || decoded.id !== userId) return false;
  const done = await prisma.refreshSession.updateMany({
    where: { id: decoded.jti, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return done.count > 0;
};

/** Rows past their expiry (and long-revoked ones) are of no further use. */
const purgeExpired = async () => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const gone = await prisma.refreshSession.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: weekAgo } }] },
  });
  return gone.count;
};

module.exports = { issue, rotate, revoke, revokeAll, purgeExpired };
