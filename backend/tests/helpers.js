/**
 * Shared set-up for the API tests (node --test tests/).
 *
 * The tests run the real app in this process on a free port, against the
 * database in DATABASE_URL (CI: an empty MySQL with every migration applied;
 * locally: point it at a scratch database, never the live one). Everything a
 * test makes is named "ci-…" and removed afterwards.
 *
 * No email, AI or Redis traffic: those keys are blanked before the app loads
 * (dotenv never overrides a variable that is already set, even to '').
 */
for (const key of ['RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'HF_TOKEN', 'CACHE_REDIS_URL', 'REDIS_URL', 'SENTRY_DSN']) {
  process.env[key] = '';
}
require('dotenv').config();
// Only ever a scratch database: its name must say so (emoorm_ci, emoorm_test…).
const dbName = (process.env.DATABASE_URL || '').split('?')[0].split('/').pop() || '';
if (!/(^|_|-)(ci|test)($|_|-)/i.test(dbName)) {
  console.error(`Refusing to run the tests against "${dbName || 'no database'}". Set DATABASE_URL to a scratch database whose name contains "test" or "ci".`);
  process.exit(1);
}
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.IDENTITY_VERIFICATION_REQUIRED = 'false';
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';
// The runner reads each test file's stdout; the app's request log there can
// garble its messages. Errors still go to stderr. TEST_VERBOSE=1 keeps it.
if (!process.env.TEST_VERBOSE) console.log = () => {};

const bcrypt = require('bcryptjs');
const prisma = require('../src/config/database');
const { generateTokens } = require('../src/utils/jwt');
const { withDeadlockRetry } = require('../src/lib/dbRetry');

const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let seq = 0;
const made = { users: [], stores: [], products: [], orders: [], conversations: [] };

let server = null;
let base = null;

/** Start the app once per test file; returns the API base URL. */
async function startApp() {
  if (base) return base;
  const app = require('../src/app');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
  return base;
}

/**
 * A town and a category. A fresh CI database has none, so one of each is made
 * under a fixed code and kept: the test files run in parallel and share them.
 */
async function ensure(model, where, data) {
  const found = await prisma[model].findFirst({ where, select: { id: true, name: true } });
  if (found) return found;
  try {
    return await prisma[model].create({ data, select: { id: true, name: true } });
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    return prisma[model].findFirst({ where, select: { id: true, name: true } });
  }
}

async function reference() {
  const municipality = (await prisma.municipality.findFirst({ select: { id: true, name: true } }))
    || await ensure('municipality', { code: 'CI-TOWN' }, { name: 'Ci Town', code: 'CI-TOWN' });
  const category = (await prisma.category.findFirst({ select: { id: true, name: true } }))
    || await ensure('category', { slug: 'ci-category' }, { name: 'Ci Category', slug: 'ci-category' });
  return { municipality, category };
}

/** A second town, for the tests about other towns. */
async function otherTown(than) {
  const other = await prisma.municipality.findFirst({ where: { id: { not: than } }, select: { id: true, name: true } });
  return other || ensure('municipality', { code: 'CI-TOWN-B' }, { name: 'Ci Town B', code: 'CI-TOWN-B' });
}

const HASH = bcrypt.hashSync('Testing#123', 4);

async function user(role = 'BUYER', extra = {}) {
  const { municipality } = await reference();
  seq += 1;
  const u = await withDeadlockRetry(() => prisma.user.create({
    data: {
      email: `ci-${role.toLowerCase()}-${RUN}-${seq}@example.test`,
      password: HASH,
      fullName: `Ci ${role} ${seq}`,
      role,
      isVerified: true,
      municipality: { connect: { id: municipality.id } },
      ...extra,
    },
  }));
  made.users.push(u.id);
  return u;
}

const token = (u) => generateTokens(u).accessToken;

async function shop(owner) {
  const { municipality } = await reference();
  seq += 1;
  const s = await withDeadlockRetry(() => prisma.store.create({ data: { name: `Ci Shop ${RUN} ${seq}`, slug: `ci-shop-${RUN}-${seq}`, ownerId: owner.id, municipalityId: municipality.id, sellerGuides: { all: true } } }));
  made.stores.push(s.id);
  return s;
}

async function product(store, extra = {}) {
  const { category } = await reference();
  seq += 1;
  const p = await withDeadlockRetry(() => prisma.product.create({ data: { name: `Ci Product ${RUN} ${seq}`, slug: `ci-product-${RUN}-${seq}`, description: 'A product made by the tests.', price: 100, stock: 20, storeId: store.id, categoryId: category.id, municipalityId: store.municipalityId, status: 'APPROVED', images: [], ...extra } }));
  made.products.push(p.id);
  return p;
}

async function order(buyer, store, items, fields = {}) {
  seq += 1;
  const subtotal = items.reduce((sum, i) => sum + 100 * (i.quantity || 1), 0);
  const o = await withDeadlockRetry(() => prisma.order.create({
    data: {
      orderNumber: `CI-${RUN}-${seq}`,
      buyerId: buyer.id,
      storeId: store.id,
      subtotal,
      total: subtotal,
      deliveryAddress: 'Pickup',
      contactNumber: '09171234567',
      fulfillmentMethod: 'PICKUP',
      status: 'PENDING',
      ...fields,
      items: { create: items.map((i) => ({ productId: i.product.id, productName: i.product.name, price: 100, quantity: i.quantity || 1, subtotal: 100 * (i.quantity || 1), returnPolicySnapshot: i.snapshot ?? undefined })) },
    },
    include: { items: true },
  }));
  made.orders.push(o.id);
  return o;
}

/** fetch against the app: { status, body }. */
async function api(method, path, { token: bearer, body, headers = {} } = {}) {
  const url = `${await startApp()}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}

const daysAgo = (d) => new Date(Date.now() - d * 86400e3);

/** Remove everything the tests made, then stop the app and the database client. */
async function cleanup() {
  // Test files run side by side; their deletes can deadlock each other.
  const step = (run) => withDeadlockRetry(run, 6);
  const orderIds = (await step(() => prisma.order.findMany({ where: { OR: [{ id: { in: made.orders } }, { storeId: { in: made.stores } }, { buyerId: { in: made.users } }] }, select: { id: true } }))).map((o) => o.id);
  await step(() => prisma.message.deleteMany({ where: { conversation: { OR: [{ storeId: { in: made.stores } }, { buyerId: { in: made.users } }] } } }));
  await step(() => prisma.conversation.deleteMany({ where: { OR: [{ storeId: { in: made.stores } }, { buyerId: { in: made.users } }] } }));
  await step(() => prisma.returnRequestItem.deleteMany({ where: { returnRequest: { orderId: { in: orderIds } } } }));
  await step(() => prisma.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } }));
  await step(() => prisma.review.deleteMany({ where: { OR: [{ productId: { in: made.products } }, { userId: { in: made.users } }] } }));
  await step(() => prisma.cartItem.deleteMany({ where: { OR: [{ productId: { in: made.products } }, { userId: { in: made.users } }] } }));
  await step(() => prisma.wishlistItem.deleteMany({ where: { OR: [{ productId: { in: made.products } }, { userId: { in: made.users } }] } }));
  await step(() => prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } }));
  await step(() => prisma.voucherRedemption.deleteMany({ where: { orderId: { in: orderIds } } }));
  await step(() => prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }));
  await step(() => prisma.order.deleteMany({ where: { id: { in: orderIds } } }));
  // Products of the tests' shops too: some are made through the API.
  await step(() => prisma.inventoryMovement.deleteMany({ where: { OR: [{ productId: { in: made.products } }, { product: { storeId: { in: made.stores } } }] } }));
  await step(() => prisma.productAvailability.deleteMany({ where: { OR: [{ productId: { in: made.products } }, { storeId: { in: made.stores } }] } }));
  await step(() => prisma.product.deleteMany({ where: { OR: [{ id: { in: made.products } }, { storeId: { in: made.stores } }] } }));
  await step(() => prisma.store.deleteMany({ where: { OR: [{ id: { in: made.stores } }, { ownerId: { in: made.users } }] } }));
  // Notices sent in the background (a low-stock alert after an order) can
  // land between these deletes; try again shortly when one does.
  for (let attempt = 1; ; attempt += 1) {
    await prisma.notification.deleteMany({ where: { userId: { in: made.users } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: made.users } } });
    try {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
      break;
    } catch (err) {
      if (attempt >= 5 || err.code !== 'P2003') throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await step(() => prisma.$disconnect());
}

module.exports = { prisma, startApp, reference, otherTown, user, token, shop, product, order, api, daysAgo, cleanup, RUN };
