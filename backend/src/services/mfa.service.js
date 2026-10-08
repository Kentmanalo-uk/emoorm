const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const prisma = require('../config/database');
const userRepository = require('../repositories/user.repository');
const { generateMfaToken, verifyMfaToken } = require('../utils/jwt');
const { ApiError } = require('../middleware/errorHandler');
const sessionService = require('./session.service');
const { makeGuard } = require('../utils/attemptGuard');

// A sign-in's code step: five wrong codes spend the step-up token, and a
// token that completed a sign-in is not accepted again. Six digits are
// guessable by a script that may try without limit; this is the limit.
const MFA_TRY_LIMIT = 5;
const codeTries = makeGuard({ limit: MFA_TRY_LIMIT, windowMs: 10 * 60 * 1000 });
const spentTokens = makeGuard({ limit: 1, windowMs: 10 * 60 * 1000 });
const assertStepUsable = (decoded) => {
  const id = decoded?.jti;
  if (!id) return;
  if (spentTokens.lockedFor(id) || codeTries.lockedFor(id)) {
    throw new ApiError('MFA session expired, please sign in again', 401);
  }
};

const ISSUER = 'Emoorm Admin';
const BACKUP_CODE_COUNT = 8;

const isAdminRole = (role) => role === 'SUPER_ADMIN' || role === 'MUNICIPAL_ADMIN';

const hashBackupCode = (code) =>
  crypto.createHash('sha256').update(code.replace(/[^a-z0-9]/gi, '').toLowerCase()).digest('hex');

const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    // 10 hex chars formatted as XXXX-XXXX for readability
    const raw = crypto.randomBytes(5).toString('hex');
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 10)}`);
  }
  return codes;
};

const verifyTotp = (secret, code) =>
  speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: String(code || '').replace(/\s/g, ''),
    window: 1,
  });

/**
 * Begin MFA enrolment for an authenticated user (or a user holding a
 * short-lived mfa-setup token). Generates a fresh TOTP secret and QR code.
 * Does NOT set mfaEnabled — that only flips after completeSetup.
 */
const beginSetup = async (userId, { code } = {}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!user) throw new ApiError('User not found', 404);

  // Re-enrolling an account that already has MFA must prove possession of the
  // current authenticator. Without this, anyone holding a session could
  // silently swap in their own secret and lock the owner out — which is
  // exactly how a stolen password used to become a permanent takeover.
  if (user.mfaEnabled && user.mfaSecret) {
    if (!code || !verifyTotp(user.mfaSecret, code)) {
      throw new ApiError('Enter a code from your current authenticator to set up a new one', 400);
    }
  }

  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${ISSUER} (${user.email})`,
    issuer: ISSUER,
  });

  // The candidate secret is held separately and the live one is left alone.
  // Previously this overwrote mfaSecret and set mfaEnabled to false up front,
  // so merely *starting* setup — or abandoning it — disabled the account's
  // second factor. MFA now stays fully in force until the new authenticator
  // is confirmed by completeSetup().
  await prisma.user.update({
    where: { id: userId },
    data: { mfaPendingSecret: secret.base32 },
  });

  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrDataUrl,
  };
};

/** Verify the first authenticator code, enable MFA, return backup codes. */
const completeSetup = async (userId, code) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, mfaSecret: true, mfaEnabled: true, mfaPendingSecret: true },
  });
  if (!user) throw new ApiError('User not found', 404);

  // Confirm against the candidate secret from beginSetup(), not the live one.
  const candidate = user.mfaPendingSecret;
  if (!candidate) throw new ApiError('MFA setup was not initiated', 400);

  if (!verifyTotp(candidate, code)) {
    throw new ApiError('Invalid authenticator code', 400);
  }

  const backupCodes = generateBackupCodes();
  const hashed = backupCodes.map((c) => hashBackupCode(c));

  // Only now does the new authenticator replace the old one.
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaSecret: candidate,
      mfaPendingSecret: null,
      mfaEnabled: true,
      mfaEnabledAt: new Date(),
      mfaBackupCodes: JSON.stringify(hashed),
      mfaLastVerifiedAt: new Date(),
    },
  });

  return { enabled: true, backupCodes };
};

/** Disable MFA. Requires a current TOTP code to prevent hijack. */
const disable = async (userId, code) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!user) throw new ApiError('User not found', 404);
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new ApiError('MFA is not enabled on this account', 400);
  }
  if (isAdminRole(user.role)) {
    throw new ApiError('MFA is required for admin accounts and cannot be disabled', 403);
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    throw new ApiError('Invalid authenticator code', 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaEnabledAt: null,
      mfaBackupCodes: null,
    },
  });

  return { enabled: false };
};

const regenerateBackupCodes = async (userId, code) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, mfaEnabled: true, mfaSecret: true },
  });
  if (!user) throw new ApiError('User not found', 404);
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new ApiError('Enable MFA first', 400);
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    throw new ApiError('Invalid authenticator code', 400);
  }
  const backupCodes = generateBackupCodes();
  const hashed = backupCodes.map((c) => hashBackupCode(c));
  await prisma.user.update({
    where: { id: userId },
    data: { mfaBackupCodes: JSON.stringify(hashed) },
  });
  return { backupCodes };
};

/**
 * Verify a TOTP or backup code during the login MFA step and issue final tokens.
 * `mfaToken` is a short-lived JWT emitted by /auth/login when MFA is required.
 */
// A six-digit code just accepted for an account is not accepted again while
// it could still be valid (someone who saw it over a shoulder, or a second
// send of the same request). One process: kept in memory.
const recentCodes = new Map(); // userId -> { code, until }
const REUSE_WINDOW_MS = 2 * 60 * 1000;
const codeWasJustUsed = (userId, code) => {
  const now = Date.now();
  for (const [id, entry] of recentCodes) if (entry.until < now) recentCodes.delete(id);
  const entry = recentCodes.get(userId);
  return Boolean(entry && entry.code === code && entry.until >= now);
};

/**
 * A signed-in admin's current authenticator code, asked again before a step
 * that hands out access (adding someone to the admin team). A code just used
 * is not taken twice.
 */
const confirmCode = async (userId, code) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaSecret: true } });
  if (!user?.mfaEnabled || !user.mfaSecret) throw new ApiError('Set up two-factor sign-in first', 403);
  const trimmed = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(trimmed) || codeWasJustUsed(userId, trimmed) || !verifyTotp(user.mfaSecret, trimmed)) {
    throw new ApiError('That code is not right. Enter the 6-digit code from your authenticator app.', 400);
  }
  recentCodes.set(userId, { code: trimmed, until: Date.now() + REUSE_WINDOW_MS });
};

const verifyLogin = async (mfaToken, code) => {
  let decoded;
  try {
    decoded = verifyMfaToken(mfaToken, 'mfa-verify');
  } catch {
    throw new ApiError('MFA session expired, please sign in again', 401);
  }
  assertStepUsable(decoded);

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (user && (user.deletedAt || !user.isActive)) throw new ApiError('Account is not active', 403);
  if (!user) throw new ApiError('User not found', 404);
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new ApiError('MFA is not enabled on this account', 400);
  }

  const trimmed = String(code || '').trim();
  let ok = false;
  let usedBackup = false;

  if (/^\d{6}$/.test(trimmed)) {
    ok = !codeWasJustUsed(user.id, trimmed) && verifyTotp(user.mfaSecret, trimmed);
    if (ok) recentCodes.set(user.id, { code: trimmed, until: Date.now() + REUSE_WINDOW_MS });
  } else {
    // Treat as backup code. It is crossed off only if the list is still the
    // one it was found in, so two requests cannot both spend the same code.
    const hashed = hashBackupCode(trimmed);
    const list = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes) : [];
    const idx = list.indexOf(hashed);
    if (idx !== -1) {
      list.splice(idx, 1);
      const spent = await prisma.user.updateMany({
        where: { id: user.id, mfaBackupCodes: user.mfaBackupCodes },
        data: { mfaBackupCodes: JSON.stringify(list) },
      });
      ok = spent.count === 1;
      usedBackup = ok;
    }
  }

  if (!ok) {
    if (decoded.jti) codeTries.fail(decoded.jti);
    throw new ApiError('Invalid verification code', 401);
  }
  if (decoded.jti) spentTokens.fail(decoded.jti);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaLastVerifiedAt: new Date() },
  });

  const tokens = await sessionService.issue(user);
  // The account as the profile endpoint shows it: an allow-list of columns,
  // never the row minus a few secrets.
  const safe = await userRepository.findById(user.id);
  return { user: safe, ...tokens, usedBackupCode: usedBackup };
};

/**
 * During first-login MFA enforcement for admins, verify the setup token, then
 * enrol via completeSetup, then issue full tokens.
 */
const completeSetupDuringLogin = async (mfaToken, code) => {
  let decoded;
  try {
    decoded = verifyMfaToken(mfaToken, 'mfa-setup');
  } catch {
    throw new ApiError('MFA setup session expired, please sign in again', 401);
  }
  assertStepUsable(decoded);
  let setup;
  try {
    setup = await completeSetup(decoded.id, code);
  } catch (err) {
    if (decoded.jti) codeTries.fail(decoded.jti);
    throw err;
  }
  if (decoded.jti) spentTokens.fail(decoded.jti);
  const user = await userRepository.findById(decoded.id);
  const tokens = await sessionService.issue(user);
  return { user, ...tokens, backupCodes: setup.backupCodes };
};

/** For the login-time setup step: issue a QR based on an mfa-setup token. */
const beginSetupWithMfaToken = async (mfaToken) => {
  let decoded;
  try {
    decoded = verifyMfaToken(mfaToken, 'mfa-setup');
  } catch {
    throw new ApiError('MFA setup session expired, please sign in again', 401);
  }
  return beginSetup(decoded.id);
};

const getStatus = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mfaEnabled: true,
      mfaEnabledAt: true,
      mfaLastVerifiedAt: true,
      mfaBackupCodes: true,
      role: true,
    },
  });
  if (!user) throw new ApiError('User not found', 404);
  const backupCount = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes).length : 0;
  return {
    enabled: user.mfaEnabled,
    enabledAt: user.mfaEnabledAt,
    lastVerifiedAt: user.mfaLastVerifiedAt,
    backupCodesRemaining: backupCount,
    required: isAdminRole(user.role),
  };
};

module.exports = {
  isAdminRole,
  beginSetup,
  completeSetup,
  disable,
  regenerateBackupCodes,
  verifyLogin,
  confirmCode,
  completeSetupDuringLogin,
  beginSetupWithMfaToken,
  getStatus,
  generateMfaToken,
};
