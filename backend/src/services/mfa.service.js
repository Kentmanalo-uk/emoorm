const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const prisma = require('../config/database');
const userRepository = require('../repositories/user.repository');
const { generateTokens, generateMfaToken, verifyMfaToken } = require('../utils/jwt');
const { ApiError } = require('../middleware/errorHandler');

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
const verifyLogin = async (mfaToken, code) => {
  let decoded;
  try {
    decoded = verifyMfaToken(mfaToken, 'mfa-verify');
  } catch {
    throw new ApiError('MFA session expired, please sign in again', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) throw new ApiError('User not found', 404);
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new ApiError('MFA is not enabled on this account', 400);
  }

  const trimmed = String(code || '').trim();
  let ok = false;
  let usedBackup = false;

  if (/^\d{6}$/.test(trimmed)) {
    ok = verifyTotp(user.mfaSecret, trimmed);
  } else {
    // Treat as backup code
    const hashed = hashBackupCode(trimmed);
    const list = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes) : [];
    const idx = list.indexOf(hashed);
    if (idx !== -1) {
      list.splice(idx, 1);
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: JSON.stringify(list) },
      });
      ok = true;
      usedBackup = true;
    }
  }

  if (!ok) throw new ApiError('Invalid verification code', 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaLastVerifiedAt: new Date() },
  });

  const tokens = generateTokens(user);
  const { password, mfaSecret, mfaBackupCodes, ...safe } = user;
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
  const setup = await completeSetup(decoded.id, code);
  const user = await userRepository.findById(decoded.id);
  const tokens = generateTokens(user);
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
  completeSetupDuringLogin,
  beginSetupWithMfaToken,
  getStatus,
  generateMfaToken,
};
