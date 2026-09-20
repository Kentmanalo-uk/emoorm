/**
 * Notification routing and announcement delivery.
 *
 * Two things are being proved here:
 *   1. An announcement actually reaches the inbox it was addressed to. Before
 *      this, every broadcast was written with the schema's default audience
 *      (BUYER), so a "sellers only" or "admins only" announcement was created,
 *      counted as delivered, and never appeared in the feed the recipient opens.
 *   2. Every notification the system can produce resolves to a destination, so
 *      clicking one goes somewhere instead of doing nothing.
 *
 * Run against a live API: `node test-notifications.js` (defaults to :3000).
 */
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');
const notificationService = require('./src/services/notification.service');
const announcementService = require('./src/services/announcement.service');
const { resolveRef, KINDS } = require('./src/utils/notificationTarget');

const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';

const results = [];
let failures = 0;

const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
};

const call = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      connection: 'close',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
};

const stamp = Date.now();
const created = { users: [], stores: [], products: [] };

const makeUser = async (role, municipalityId, extra = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `notif-${role.toLowerCase()}-${stamp}-${created.users.length}@example.test`,
      password: '$2a$10$notarealhashnotarealhashnotarealhashnotarealhashno',
      fullName: `Notif ${role}`,
      role,
      municipalityId,
      isActive: true,
      ...extra,
    },
  });
  created.users.push(user.id);
  return user;
};

(async () => {
  const municipality = await prisma.municipality.findFirst({ where: { isActive: true } });
  if (!municipality) throw new Error('No active municipality to test against');

  // ── Part A: the resolver covers every type the enum can produce ─────────
  //
  // A pure check, so it catches a new NotificationType added without a
  // destination long before anyone clicks one in the UI.
  const ALL_TYPES = [
    'ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED',
    'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'SELLER_APPROVED', 'SELLER_SUSPENDED',
    'REPORT_SUBMITTED', 'REPORT_RESOLVED', 'SYSTEM_ANNOUNCEMENT',
    'STORE_NEW_PRODUCT', 'STORE_PROMOTION', 'STORE_ANNOUNCEMENT',
    'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT',
    'RETURN_RECEIVED', 'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED',
    'SUPPORT_MESSAGE', 'SELLER_APPLICATION_SUBMITTED', 'ADMIN_ALERT',
  ];

  const unresolved = [];
  const badKind = [];
  for (const type of ALL_TYPES) {
    for (const audience of ['BUYER', 'SELLER', 'ADMIN']) {
      const ref = resolveRef({ id: 'notif-id', type, audience, relatedId: 'related-id', data: null });
      if (!ref) {
        unresolved.push(`${type}/${audience}`);
      } else if (!KINDS.includes(ref.kind)) {
        badKind.push(`${type}/${audience} -> ${ref.kind}`);
      }
    }
  }

  // The reporter-side report notice is the one deliberate blank: only admins
  // have a reports queue to open.
  const expectedBlanks = ['REPORT_SUBMITTED/BUYER', 'REPORT_SUBMITTED/SELLER', 'REPORT_RESOLVED/BUYER', 'REPORT_RESOLVED/SELLER'];
  const unexpectedBlanks = unresolved.filter((k) => !expectedBlanks.includes(k));

  check('Every notification type resolves to a destination', unexpectedBlanks.length === 0, unexpectedBlanks.join(', '));
  check('Every resolved kind is a known kind', badKind.length === 0, badKind.join(', '));

  // Spot-checks on the mappings that matter most.
  const expectations = [
    [{ type: 'ORDER_RECEIVED', audience: 'SELLER', relatedId: 'o1' }, 'seller-order', 'o1'],
    [{ type: 'ORDER_CONFIRMED', audience: 'BUYER', relatedId: 'o1' }, 'buyer-order', 'o1'],
    [{ type: 'RETURN_REQUESTED', audience: 'SELLER', relatedId: 'r1' }, 'seller-return', 'r1'],
    [{ type: 'RETURN_REFUNDED', audience: 'BUYER', relatedId: 'r1' }, 'buyer-return', 'r1'],
    [{ type: 'SUPPORT_MESSAGE', audience: 'ADMIN', relatedId: 'c1' }, 'admin-support', 'c1'],
    [{ type: 'SUPPORT_MESSAGE', audience: 'SELLER', relatedId: 'c1' }, 'seller-support', 'c1'],
    [{ type: 'SELLER_APPLICATION_SUBMITTED', audience: 'ADMIN', relatedId: 'u1' }, 'admin-seller-application', 'u1'],
    [{ type: 'PRODUCT_SUSPENDED', audience: 'SELLER', relatedId: 'p1' }, 'seller-product', 'p1'],
    [{ type: 'SYSTEM_ANNOUNCEMENT', audience: 'BUYER', relatedId: null }, 'notification', 'notif-id'],
    [{ type: 'SYSTEM_ANNOUNCEMENT', audience: 'ADMIN', relatedId: null }, 'admin-notification', 'notif-id'],
  ];
  const wrong = expectations.filter(([input, kind, id]) => {
    const ref = resolveRef({ id: 'notif-id', data: null, ...input });
    return !ref || ref.kind !== kind || ref.id !== id;
  }).map(([input, kind]) => `${input.type}/${input.audience} should be ${kind}`);
  check('Key type/audience pairs map to the right destination', wrong.length === 0, wrong.join('; '));

  // An explicit target overrides the type-based guess.
  const explicit = resolveRef({
    id: 'n1', type: 'SYSTEM_ANNOUNCEMENT', audience: 'BUYER', relatedId: 'u9',
    data: { target: { kind: 'buyer-verification' } },
  });
  check('An explicit target wins over the type default', explicit?.kind === 'buyer-verification', explicit?.kind);

  // A forged target from a stray data payload cannot invent a route.
  const forged = resolveRef({
    id: 'n1', type: 'SYSTEM_ANNOUNCEMENT', audience: 'BUYER', relatedId: null,
    data: { target: { kind: 'javascript:alert(1)' } },
  });
  check('An unknown target kind is ignored', forged?.kind === 'notification', forged?.kind);

  // ── Fixtures ────────────────────────────────────────────────────────────
  const buyer = await makeUser('BUYER', municipality.id);
  const otherBuyer = await makeUser('BUYER', municipality.id);
  const seller = await makeUser('SELLER', municipality.id);
  const admin = await makeUser('MUNICIPAL_ADMIN', municipality.id);
  const inactiveSeller = await makeUser('SELLER', municipality.id, { isActive: false });

  const buyerToken = generateTokens(buyer).accessToken;
  const otherBuyerToken = generateTokens(otherBuyer).accessToken;
  const sellerToken = generateTokens(seller).accessToken;
  const adminToken = generateTokens(admin).accessToken;

  const store = await prisma.store.create({
    data: {
      ownerId: seller.id,
      municipalityId: municipality.id,
      name: `Notif Test Store ${stamp}`,
      slug: `notif-test-store-${stamp}`,
      isActive: true,
    },
  });
  created.stores.push(store.id);

  const category = await prisma.category.findFirst({ where: { isActive: true } });
  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      municipalityId: municipality.id,
      categoryId: category?.id,
      name: `Notif Test Product ${stamp}`,
      slug: `notif-test-product-${stamp}`,
      description: 'Fixture for notification target tests.',
      price: 100,
      stock: 5,
      images: [],
      status: 'APPROVED',
    },
  });
  created.products.push(product.id);

  // ── Part B: an announcement lands in the inbox it was addressed to ──────
  const sellersResult = await announcementService.broadcast(admin, {
    title: `Sellers only ${stamp}`,
    message: 'Market day moves to Saturday this week.',
    target: 'sellers',
  });

  const sellerRow = await prisma.notification.findFirst({
    where: { userId: seller.id, title: `Sellers only ${stamp}` },
  });
  check('A sellers-only announcement is delivered', Boolean(sellerRow));
  check(
    'A sellers-only announcement lands in the seller feed',
    sellerRow?.audience === 'SELLER',
    `audience=${sellerRow?.audience}`,
  );
  check('The broadcast reports the audience it used', sellersResult.audience === 'SELLER', sellersResult.audience);

  const inactiveRow = await prisma.notification.findFirst({
    where: { userId: inactiveSeller.id, title: `Sellers only ${stamp}` },
  });
  check('A deactivated account is not counted as delivered', inactiveRow === null);

  const adminsResult = await announcementService.broadcast(admin, {
    title: `Admins only ${stamp}`,
    message: 'Quarterly moderation review on Friday.',
    target: 'admins',
  });
  const adminRow = await prisma.notification.findFirst({
    where: { userId: admin.id, title: `Admins only ${stamp}` },
  });
  check('An admins-only announcement lands in the admin feed', adminRow?.audience === 'ADMIN', `audience=${adminRow?.audience}`);
  check('The admin broadcast reached at least one admin', adminsResult.delivered > 0, String(adminsResult.delivered));

  await announcementService.broadcast(admin, {
    title: `Everyone ${stamp}`,
    message: 'The site will be briefly offline tonight.',
    target: 'all',
  });
  const everyoneRow = await prisma.notification.findFirst({
    where: { userId: buyer.id, title: `Everyone ${stamp}` },
  });
  check('An all-users announcement reaches buyers', everyoneRow?.audience === 'BUYER', `audience=${everyoneRow?.audience}`);

  // Announcement text is rendered in three clients; it is stripped on the way in.
  await announcementService.broadcast(admin, {
    title: `Clean ${stamp} <script>alert(1)</script>`,
    message: 'Safe <img src=x onerror=alert(1)> message body for everyone.',
    target: 'buyers',
  });
  const xssRow = await prisma.notification.findFirst({
    where: { userId: buyer.id, title: { startsWith: `Clean ${stamp}` } },
  });
  check(
    'Announcement markup is stripped before storage',
    Boolean(xssRow) && !/<script|onerror|<img/i.test(`${xssRow.title} ${xssRow.message}`),
    `${xssRow?.title} | ${xssRow?.message}`,
  );

  // A municipal admin cannot address another municipality.
  const otherMunicipality = await prisma.municipality.findFirst({
    where: { isActive: true, id: { not: municipality.id } },
  });
  if (otherMunicipality) {
    let blocked = false;
    try {
      await announcementService.broadcast(admin, {
        title: `Cross border ${stamp}`,
        message: 'Should never be delivered.',
        target: 'all',
        municipalityId: otherMunicipality.id,
      });
    } catch (err) {
      blocked = err.statusCode === 403 || /municipality/i.test(err.message);
    }
    check('A municipal admin cannot broadcast to another municipality', blocked);
  }

  // ── Part C: the API hands each notification its destination ─────────────
  const orderNotif = await notificationService.createNotification({
    userId: seller.id,
    type: 'ORDER_RECEIVED',
    title: 'New Order Received',
    message: 'Fixture order notification.',
    relatedId: 'order-fixture-id',
  });
  check('An order notification defaults to the seller feed', orderNotif.audience === 'SELLER', orderNotif.audience);

  await notificationService.createNotification({
    userId: buyer.id,
    type: 'STORE_NEW_PRODUCT',
    title: 'New product',
    message: 'A store you follow added a product.',
    relatedId: product.id,
  });

  await notificationService.createNotification({
    userId: buyer.id,
    type: 'STORE_ANNOUNCEMENT',
    title: 'Store update',
    message: 'A store you follow posted an update.',
    relatedId: store.id,
  });

  const sellerFeed = await call('/notifications?audience=SELLER&pageSize=50', { token: sellerToken });
  const sellerItems = sellerFeed.body?.data || [];
  const orderItem = sellerItems.find((n) => n.id === orderNotif.id);
  check('The API attaches a target to each notification', sellerItems.every((n) => 'target' in n));
  check(
    'An order notification points at the seller order',
    orderItem?.target?.kind === 'seller-order' && orderItem?.target?.id === 'order-fixture-id',
    JSON.stringify(orderItem?.target),
  );

  const sellerAnnouncement = sellerItems.find((n) => n.title === `Sellers only ${stamp}`);
  check('The seller feed contains the sellers-only announcement', Boolean(sellerAnnouncement));
  check(
    'An announcement opens the notification itself',
    sellerAnnouncement?.target?.kind === 'notification' && sellerAnnouncement?.target?.id === sellerAnnouncement?.id,
    JSON.stringify(sellerAnnouncement?.target),
  );

  const buyerFeed = await call('/notifications?audience=BUYER&pageSize=50', { token: buyerToken });
  const buyerItems = buyerFeed.body?.data || [];

  const productItem = buyerItems.find((n) => n.relatedId === product.id);
  check(
    'A follower notification resolves the product slug',
    productItem?.target?.kind === 'product' && productItem?.target?.slug === product.slug,
    JSON.stringify(productItem?.target),
  );

  const storeItem = buyerItems.find((n) => n.relatedId === store.id);
  check(
    'A store announcement resolves the store slug',
    storeItem?.target?.kind === 'store' && storeItem?.target?.slug === store.slug,
    JSON.stringify(storeItem?.target),
  );

  // A product that has been taken down is not a destination any more.
  await prisma.product.update({ where: { id: product.id }, data: { status: 'SUSPENDED' } });
  const afterSuspend = await call('/notifications?audience=BUYER&pageSize=50', { token: buyerToken });
  const suspendedItem = (afterSuspend.body?.data || []).find((n) => n.relatedId === product.id);
  check(
    'A notification for a removed product has no destination',
    suspendedItem?.target === null,
    JSON.stringify(suspendedItem?.target),
  );
  await prisma.product.update({ where: { id: product.id }, data: { status: 'APPROVED' } });

  // ── Part D: a destination never leaks someone else's notification ───────
  const foreign = await call(`/notifications/${orderNotif.id}`, { token: otherBuyerToken });
  check('Another user cannot open this notification', foreign.status === 403 || foreign.status === 404, String(foreign.status));

  const own = await call(`/notifications/${orderNotif.id}`, { token: sellerToken });
  check('The owner can open it and gets its target', own.status === 200 && own.body?.data?.target?.kind === 'seller-order', String(own.status));

  const foreignRead = await call(`/notifications/${orderNotif.id}/read`, { token: otherBuyerToken, method: 'PUT' });
  check('Another user cannot mark it read', foreignRead.status === 403 || foreignRead.status === 404, String(foreignRead.status));

  // ── Part E: pagination the clients can actually use ─────────────────────
  const paged = await call('/notifications?audience=BUYER&pageSize=1&page=1', { token: buyerToken });
  check('Pagination reports whether more pages exist', typeof paged.body?.pagination?.hasNext === 'boolean');
  check('Page size is honoured', (paged.body?.data || []).length <= 1, String((paged.body?.data || []).length));

  const oversized = await call('/notifications?audience=BUYER&pageSize=100000', { token: buyerToken });
  check('An oversized page size is clamped', (oversized.body?.pagination?.pageSize ?? 0) <= 50, String(oversized.body?.pagination?.pageSize));

  // ── Part F: the admin can see what was sent ─────────────────────────────
  const sentList = await call('/announcements?pageSize=10', { token: adminToken });
  const sentTitles = (sentList.body?.data || []).map((a) => a.title);
  check('An admin can list announcements already sent', sentList.status === 200, String(sentList.status));
  check('The list includes the broadcast just sent', sentTitles.includes(`Sellers only ${stamp}`), sentTitles.slice(0, 3).join(' | '));

  const buyerSees = await call('/announcements', { token: buyerToken });
  check('A buyer cannot list announcements', buyerSees.status === 403, String(buyerSees.status));

  // ── Cleanup ─────────────────────────────────────────────────────────────
  // A broadcast fans out to the real seed accounts too, so the rows it made
  // are cleared by title and timestamp, not just by the fixture users.
  // Every title this suite writes embeds the run stamp, which is what makes
  // the fan-out removable. A created_at window would not: MySQL stores the
  // column without sub-second precision, so rows written in the same second
  // the run started fall just outside it.
  await prisma.notification.deleteMany({ where: { title: { contains: String(stamp) } } });
  const broadcastLogs = await prisma.auditLog.findMany({
    where: { action: 'BROADCAST_ANNOUNCEMENT' },
    select: { id: true, details: true },
  });
  const ours = broadcastLogs.filter((log) =>
    String((log.details && log.details.title) || '').includes(String(stamp)));
  if (ours.length) await prisma.auditLog.deleteMany({ where: { id: { in: ours.map((l) => l.id) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.product.deleteMany({ where: { id: { in: created.products } } });
  await prisma.store.deleteMany({ where: { id: { in: created.stores } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });

  const passed = results.filter((r) => r.passed).length;
  console.log(JSON.stringify({
    success: failures === 0,
    passed,
    failed: failures,
    total: results.length,
    failures: results.filter((r) => !r.passed),
  }, null, 2));

  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('ERROR:', err.stack || err.message);
  try {
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.store.deleteMany({ where: { id: { in: created.stores } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  } catch { /* best effort */ }
  await prisma.$disconnect();
  process.exit(1);
});
