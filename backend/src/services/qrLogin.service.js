const crypto = require('crypto');
const qrcode = require('qrcode');
const prisma = require('../config/database');
const userRepository = require('../repositories/user.repository');
const sessionService = require('./session.service');
const mfaService = require('./mfa.service');
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

// An approved code is collected by the browser within this long of the
// approval, or not at all.
const APPROVED_GRACE_MS = 60 * 1000;

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
 *
 * The session's tokens are minted here, at the moment the browser collects
 * them, and the row is deleted first, so they exist exactly once and are
 * never kept anywhere. An approval nobody collected within a minute lapses.
 */
const getStatus = async (token) => {
  const session = await prisma.qrLoginSession.findUnique({ where: { token } });
  if (!session) return { status: 'EXPIRED' };

  const lapsed = session.status === 'APPROVED'
    ? !session.approvedAt || session.approvedAt.getTime() + APPROVED_GRACE_MS < Date.now()
    : isExpired(session);
  if (lapsed) {
    await prisma.qrLoginSession.delete({ where: { token } }).catch(() => { });
    return { status: 'EXPIRED' };
  }

  if (session.status === 'APPROVED') {
    // Single-shot delivery: whoever deletes the row is the one browser that
    // gets the session; a second poll of the same code finds nothing.
    const claimed = await prisma.qrLoginSession.deleteMany({ where: { token, status: 'APPROVED' } });
    if (claimed.count !== 1 || !session.userId) return { status: 'EXPIRED' };

    const user = await userRepository.findById(session.userId);
    if (!user || !user.isActive || user.deletedAt) return { status: 'EXPIRED' };

    const tokens = await sessionService.issue(user, { userAgent: session.userAgent, ipAddress: session.ipAddress });
    return { status: 'APPROVED', user, ...tokens };
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
  // Only a code nobody has scanned yet, decided in one statement so two
  // phones scanning at once cannot both claim it.
  const claimed = await prisma.qrLoginSession.updateMany({
    where: { token, status: 'PENDING' },
    data: { status: 'SCANNED', userId, scannedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new ApiError('This QR code has already been used', 409);
  }

  return {
    token,
    deviceLabel: session.deviceLabel,
    ipAddress: session.ipAddress,
    requestedAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
};

/**
 * Mobile (authenticated): approve or reject a session that this user scanned.
 *
 * Approving opens a new full session on another device from a phone that
 * only holds an access token, so it is held to the same bar as a sign-in:
 * admins cannot sign in this way at all (their sign-in is password plus
 * authenticator, on the device itself), and anyone who turned on two-factor
 * enters their current code here.
 */
const approveSession = async (token, userId, approve, { code } = {}) => {
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, mfaEnabled: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) throw new ApiError('User not found', 404);
  if (user.role === 'SUPER_ADMIN' || user.role === 'MUNICIPAL_ADMIN') {
    await prisma.qrLoginSession.update({ where: { token }, data: { status: 'REJECTED' } }).catch(() => { });
    throw new ApiError('Admin accounts sign in with their password and authenticator, not by QR code', 403);
  }
  if (user.mfaEnabled) {
    if (!code) throw new ApiError('Enter the 6-digit code from your authenticator app to approve this sign-in', 400);
    await mfaService.confirmCode(userId, code);
  }

  const approved = await prisma.qrLoginSession.updateMany({
    where: { token, status: 'SCANNED', userId },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });
  if (approved.count !== 1) throw new ApiError('This QR code has already been used', 409);

  return { status: 'APPROVED' };
};

module.exports = {
  createSession,
  getStatus,
  scanSession,
  approveSession,
};
