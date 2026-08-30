const crypto = require('crypto');
const qrcode = require('qrcode');
const prisma = require('../config/database');
const { generateTokens } = require('../utils/jwt');
const { ApiError } = require('../middleware/errorHandler');

// Sessions are intentionally very short-lived and single-use.
const SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutes
const QR_PREFIX = 'EMOORM-QR-LOGIN:';

/** Turn a raw User-Agent string into a short "Browser on OS" label for display. */
const parseDeviceLabel = (userAgent) => {
  const ua = String(userAgent || '');

  let browser = 'Unknown browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua)) browser = 'Safari';

  let os = 'Unknown device';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os = 'Mac';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
};

const isExpired = (session) => session.expiresAt.getTime() < Date.now();

/** Best-effort cleanup of long-stale rows. Never throws. */
const cleanupExpired = async () => {
  try {
    await prisma.qrLoginSession.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 60 * 1000) } },
    });
  } catch {
    // ignore — cleanup is opportunistic only
  }
};

/**
 * Web (public): start a brand new QR login session. Returns a QR image
 * (data URL) generated server-side, the opaque token and its expiry.
 */
const createSession = async ({ userAgent, ipAddress }) => {
  cleanupExpired();

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.qrLoginSession.create({
    data: {
      token,
      status: 'PENDING',
      deviceLabel: parseDeviceLabel(userAgent),
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null,
      expiresAt,
    },
  });

  const qrDataUrl = await qrcode.toDataURL(`${QR_PREFIX}${token}`);

  return { token, qrDataUrl, expiresAt };
};

/**
 * Web (public, polled every couple seconds): report the current status.
 * Access/refresh tokens are delivered exactly once — the row is deleted
 * the moment they're read, so a stolen response can never be replayed.
 */
const getStatus = async (token) => {
  const session = await prisma.qrLoginSession.findUnique({ where: { token } });
  if (!session) return { status: 'EXPIRED' };

  if (isExpired(session) && session.status !== 'APPROVED') {
    await prisma.qrLoginSession.delete({ where: { token } }).catch(() => { });
    return { status: 'EXPIRED' };
  }

  if (session.status === 'APPROVED') {
    const user = session.userId ? await prisma.user.findUnique({ where: { id: session.userId } }) : null;
    // Single-shot delivery: consume the row now so it can never be polled again.
    await prisma.qrLoginSession.delete({ where: { token } }).catch(() => { });

    if (!user || !session.accessToken || !session.refreshToken) {
      return { status: 'EXPIRED' };
    }

    const { password, mfaSecret, mfaBackupCodes, passwordResetToken, ...safe } = user;
    return {
      status: 'APPROVED',
      user: safe,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  if (session.status === 'REJECTED') {
    await prisma.qrLoginSession.delete({ where: { token } }).catch(() => { });
    return { status: 'REJECTED' };
  }

  return { status: session.status, expiresAt: session.expiresAt };
};

/**
 * Mobile (authenticated): scan the QR and bind it to the logged-in user.
 * Returns the web device info so the app can show an approval screen.
 */
const scanSession = async (rawValue, userId) => {
  const token = String(rawValue || '').replace(QR_PREFIX, '').trim();
  if (!token) throw new ApiError('Invalid QR code', 400);

  const session = await prisma.qrLoginSession.findUnique({ where: { token } });
  if (!session || isExpired(session)) {
    throw new ApiError('This QR code is invalid or has expired', 410);
  }
  if (session.status !== 'PENDING') {
    throw new ApiError('This QR code has already been used', 409);
  }

  const updated = await prisma.qrLoginSession.update({
    where: { token },
    data: { status: 'SCANNED', userId, scannedAt: new Date() },
  });

  return {
    token,
    deviceLabel: updated.deviceLabel,
    ipAddress: updated.ipAddress,
    requestedAt: updated.createdAt,
    expiresAt: updated.expiresAt,
  };
};

/** Mobile (authenticated): approve or reject a session that this user scanned. */
const approveSession = async (token, userId, approve) => {
  const session = await prisma.qrLoginSession.findUnique({ where: { token } });
  if (!session || isExpired(session)) {
    throw new ApiError('This QR code is invalid or has expired', 410);
  }
  if (session.status !== 'SCANNED' || session.userId !== userId) {
    throw new ApiError('This QR code was not scanned by you', 403);
  }

  if (!approve) {
    await prisma.qrLoginSession.update({ where: { token }, data: { status: 'REJECTED' } });
    return { status: 'REJECTED' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError('User not found', 404);

  const tokens = generateTokens(user);

  await prisma.qrLoginSession.update({
    where: { token },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });

  return { status: 'APPROVED' };
};

module.exports = {
  createSession,
  getStatus,
  scanSession,
  approveSession,
};
