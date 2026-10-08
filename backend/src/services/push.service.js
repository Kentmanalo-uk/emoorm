const crypto = require('crypto');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Browser push notifications (Chrome, Edge, Firefox, and the site installed
 * as an app). Each notification the app creates is also sent to the
 * person's subscribed browsers, so it shows even with the site closed.
 *
 * Needs VAPID keys in the environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT = mailto:…); make them once with `npx web-push
 * generate-vapid-keys`. Without them push is off and nothing else changes.
 * The Android app's web view cannot receive these; it would need Firebase.
 */

let webpush = null;
const enabled = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const client = () => {
  if (!enabled()) return null;
  if (!webpush) {
    webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@emoorm.shop',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }
  return webpush;
};

const hashOf = (endpoint) => `web:${crypto.createHash('sha256').update(endpoint).digest('hex')}`;

const config = () => ({ enabled: enabled(), publicKey: enabled() ? process.env.VAPID_PUBLIC_KEY : null });

// Only the browsers' own push services. Without this list the server would
// send a signed request to any address someone saved, so a subscription could
// point it at an internal service or a stranger's site.
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const MAX_SUBSCRIPTIONS = 10;

const allowedEndpoint = (endpoint) => {
  if (typeof endpoint !== 'string' || endpoint.length > 2000) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (PUSH_HOSTS.has(host) || host.endsWith('.notify.windows.com')) return true;
  // A local push server, for the tests and development only.
  return process.env.NODE_ENV !== 'production' && LOCAL_HOSTS.has(host);
};

/** Save a browser's push subscription for this account. */
const subscribe = async (userId, subscription) => {
  if (!enabled()) throw new ApiError('Push notifications are not set up', 503);
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (!allowedEndpoint(endpoint)
    || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string'
    || keys.p256dh.length > 200 || keys.auth.length > 200) {
    throw new ApiError('Invalid push subscription', 400);
  }
  const token = hashOf(endpoint);
  const existing = await prisma.pushToken.findUnique({ where: { token }, select: { id: true, userId: true } });
  if (existing && existing.userId !== userId) {
    // One endpoint is one browser. Someone else signed in on it and asked for
    // notices there, so the previous account stops getting them on that
    // screen: its row goes and a fresh one is made for the new account.
    await prisma.pushToken.deleteMany({ where: { id: existing.id } });
  }
  if (!existing || existing.userId !== userId) {
    // Keep at most ten browsers per account; the oldest makes way.
    const mine = await prisma.pushToken.findMany({
      where: { userId, platform: 'web' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const extra = mine.length - (MAX_SUBSCRIPTIONS - 1);
    if (extra > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: mine.slice(0, extra).map((r) => r.id) } } });
    }
  }
  await prisma.pushToken.upsert({
    where: { token },
    update: { userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, platform: 'web' },
    create: { token, userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, platform: 'web' },
  });
  return { subscribed: true };
};

const unsubscribe = async (userId, endpoint) => {
  if (typeof endpoint !== 'string') throw new ApiError('endpoint is required', 400);
  await prisma.pushToken.deleteMany({ where: { token: hashOf(endpoint), userId } });
  return { subscribed: false };
};

/**
 * Send one notification to a person's browsers. Never throws; a browser that
 * unsubscribed (404/410) is forgotten.
 * @param {{ id, title, message }} notice
 */
const sendToUser = async (userId, notice) => {
  const push = client();
  if (!push || !userId) return 0;
  const subs = await prisma.pushToken.findMany({ where: { userId, platform: 'web', endpoint: { not: null } } });
  if (!subs.length) return 0;
  const payload = JSON.stringify({
    title: notice.title || 'Emoorm',
    body: notice.message || '',
    url: notice.id ? `/notifications/${notice.id}` : '/notifications',
    tag: notice.id || undefined,
  });
  let sent = 0;
  const sendOne = async (s) => {
    // A row saved before the host list existed is dropped, not sent to.
    if (!allowedEndpoint(s.endpoint)) {
      await prisma.pushToken.delete({ where: { id: s.id } }).catch(() => {});
      return;
    }
    try {
      // A push service that hangs must not hold the request open for long.
      await push.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { timeout: 5000, TTL: 3600 });
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await prisma.pushToken.delete({ where: { id: s.id } }).catch(() => {});
      } else {
        console.error('[push] send failed:', err.statusCode || err.message);
      }
    }
  };
  // A few at a time rather than every browser at once, so one busy account
  // cannot open dozens of outgoing connections together.
  const queue = [...subs];
  const worker = async () => {
    while (queue.length) await sendOne(queue.shift());
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return sent;
};

module.exports = { config, subscribe, unsubscribe, sendToUser, enabled };
