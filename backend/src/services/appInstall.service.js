const prisma = require('../config/database');
const { dayKey } = require('../utils/manilaTime');

/**
 * The Android app (apk/) and who uses it.
 *
 * The app is the live website in a WebView whose user agent ends in
 * "EmoormApp/<version>". When the site runs inside it, it reports the phone's
 * install id (made on the phone at first launch) once per launch and again
 * when someone signs in, so each install row knows its version, phone and the
 * last account used on it. APK downloads from the /app page are counted per
 * version and day.
 */

const INSTALL_ID = /^[A-Za-z0-9-]{16,64}$/;
const REPEAT_MS = 10 * 60 * 1000;
const MAX_REMEMBERED = 20000;
const seen = new Map();

/** Version, Android release and phone model from the app's user agent. */
const parseAgent = (ua = '') => {
  const agent = String(ua);
  const version = /\bEmoormApp\/(\d[\d.]{0,18})/.exec(agent)?.[1] || null;
  const android = /\bAndroid (\d+(?:\.\d+){0,2})/.exec(agent)?.[1] || null;
  // "(Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv)" → "SM-A135F"
  const model = /\bAndroid [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/.exec(agent)?.[1]?.trim() || null;
  return { version, android, device: model && model !== 'K' ? model.slice(0, 120) : null };
};

// One write per install and account every ten minutes is plenty.
const fresh = (key, now) => {
  const last = seen.get(key);
  if (last && now - last < REPEAT_MS) return false;
  if (seen.size >= MAX_REMEMBERED) seen.clear();
  seen.set(key, now);
  return true;
};

/**
 * Records that the app is in use on a phone.
 * @param {{ installId: string, userAgent: string, userId?: string, launch?: boolean }} ping
 * @returns {Promise<boolean>} whether it was recorded (false outside the app)
 */
const recordPing = async ({ installId, userAgent, userId = null, launch = false }) => {
  if (typeof installId !== 'string' || !INSTALL_ID.test(installId)) return false;
  const { version, android, device } = parseAgent(userAgent);
  if (!version) return false;
  const now = Date.now();
  if (!fresh(`${installId}:${userId || ''}:${launch ? 'L' : ''}`, now)) return false;
  await prisma.appInstall.upsert({
    where: { id: installId },
    create: { id: installId, version, android, device, userId },
    update: {
      version,
      android,
      device,
      lastSeenAt: new Date(now),
      ...(userId ? { userId } : {}),
      ...(launch ? { opens: { increment: 1 } } : {}),
    },
  });
  return true;
};

// Who downloaded what today: a phone that downloads again (a retry, a second
// tap) counts once a day per version.
const downloadedToday = new Map();

/** Counts one APK download, for the version in its file name, once a day per phone. */
const recordDownload = async (fileName, ip = '') => {
  const version = /(\d+\.\d+(?:\.\d+)?)\.apk$/i.exec(String(fileName))?.[1] || 'unknown';
  const day = dayKey(new Date());
  const key = `${day}|${version}|${ip}`;
  if (ip && downloadedToday.has(key)) return false;
  if (ip) {
    downloadedToday.set(key, true);
    while (downloadedToday.size > MAX_REMEMBERED) downloadedToday.delete(downloadedToday.keys().next().value);
  }
  publicCount = null;
  await prisma.$executeRaw`
    INSERT INTO app_downloads (version, day, downloads) VALUES (${version}, ${day}, 1)
    ON DUPLICATE KEY UPDATE downloads = downloads + 1`;
  return true;
};

/**
 * The download count everyone sees on the /app page, rounded the way app
 * stores do ("100+"). Below 10 there is nothing to show yet. Kept for ten
 * minutes; a new download starts it afresh.
 */
const BUCKETS = [1e6, 5e5, 1e5, 5e4, 1e4, 5e3, 1e3, 500, 100, 50, 10];
let publicCount = null;
const downloadsLabel = (total) => {
  const step = BUCKETS.find((b) => total >= b);
  if (!step) return null;
  return `${step >= 1e6 ? `${step / 1e6}M` : step >= 1e3 ? `${step / 1e3}K` : step}+`;
};
const getPublicDownloads = async () => {
  if (publicCount && publicCount.at > Date.now() - 10 * 60 * 1000) return publicCount.value;
  const sum = await prisma.appDownload.aggregate({ _sum: { downloads: true } });
  const total = sum._sum.downloads || 0;
  const value = { label: downloadsLabel(total) };
  publicCount = { value, at: Date.now() };
  return value;
};

const DAY = 24 * 60 * 60 * 1000;

const compareVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
};

/** Downloads, installs per version, and the signed-in people using the app. */
const getStats = async () => {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since7 = new Date(now - 7 * DAY);
  const [downloads, installs, people] = await Promise.all([
    prisma.appDownload.findMany(),
    prisma.appInstall.findMany({ select: { version: true, firstSeenAt: true, lastSeenAt: true, userId: true } }),
    prisma.appInstall.findMany({
      where: { userId: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
      select: {
        id: true, version: true, device: true, android: true, opens: true, firstSeenAt: true, lastSeenAt: true,
        user: { select: { id: true, fullName: true, email: true, role: true, municipality: { select: { name: true } } } },
      },
    }),
  ]);

  const monthStart = dayKey(since30);
  const byVersion = new Map();
  const row = (v) => {
    if (!byVersion.has(v)) byVersion.set(v, { version: v, downloads: 0, installs: 0, active30: 0 });
    return byVersion.get(v);
  };
  let downloadsTotal = 0;
  let downloads30 = 0;
  for (const d of downloads) {
    downloadsTotal += d.downloads;
    if (dayKey(d.day) >= monthStart) downloads30 += d.downloads;
    row(d.version).downloads += d.downloads;
  }
  let active7 = 0;
  let active30 = 0;
  let new30 = 0;
  const users = new Set();
  for (const i of installs) {
    const r = row(i.version);
    r.installs += 1;
    if (i.lastSeenAt >= since30) { r.active30 += 1; active30 += 1; }
    if (i.lastSeenAt >= since7) active7 += 1;
    if (i.firstSeenAt >= since30) new30 += 1;
    if (i.userId) users.add(i.userId);
  }

  return {
    downloads: { total: downloadsTotal, last30: downloads30 },
    installs: { total: installs.length, active7, active30, new30, signedInPeople: users.size },
    versions: [...byVersion.values()].sort((a, b) => compareVersions(a.version, b.version)),
    people: people.map((p) => ({
      installId: p.id,
      version: p.version,
      device: p.device,
      android: p.android,
      opens: p.opens,
      firstSeenAt: p.firstSeenAt,
      lastSeenAt: p.lastSeenAt,
      user: p.user ? {
        id: p.user.id, fullName: p.user.fullName, email: p.user.email, role: p.user.role, municipality: p.user.municipality?.name || null,
      } : null,
    })),
  };
};

module.exports = {
  recordPing, recordDownload, getStats, getPublicDownloads, downloadsLabel, parseAgent,
};
