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

/** Save (or move to this account) a browser's push subscription. */
const subscribe = async (userId, subscription) => {
  if (!enabled()) throw new ApiError('Push notifications are not set up', 503);
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2000
    || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    throw new ApiError('Invalid push subscription', 400);
  }
  const token = hashOf(endpoint);
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
  await Promise.all(subs.map(async (s) => {
    try {
      await push.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 24 * 3600 });
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await prisma.pushToken.delete({ where: { id: s.id } }).catch(() => {});
      } else {
        console.error('[push] send failed:', err.statusCode || err.message);
      }
    }
  }));
  return sent;
};

module.exports = { config, subscribe, unsubscribe, sendToUser, enabled };
