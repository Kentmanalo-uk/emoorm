// A short time budget, so the overrun test is quick (read when the engine loads).
process.env.ML_JOB_BUDGET_MS = '2000';

const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const appSettings = require('../src/services/appSetting.service');
const mlSettings = require('../src/ml/settings');
const counters = require('../src/ml/counters');
const runner = require('../src/ml/runner');
const store = require('../src/ml/store');
const { guard } = require('../src/ml/safe');
const { MODULES, isBuilt } = require('../src/ml/modules');

// The engine's switches live on the one shared settings row: put back as found.
let storedBefore;
const runIds = [];
const productIds = [];
const versionIds = [];
before(async () => {
  storedBefore = (await h.prisma.appSetting.findUnique({ where: { id: 'global' }, select: { mlSettings: true } }))?.mlSettings ?? null;
});
after(async () => {
  await h.prisma.appSetting.updateMany({ where: { id: 'global' }, data: { mlSettings: storedBefore ?? null } });
  await h.prisma.mlEventCount.deleteMany({ where: { productId: { in: productIds } } });
  await h.prisma.mlTrainingRun.deleteMany({ where: { id: { in: runIds } } });
  await h.prisma.mlModelVersion.deleteMany({ where: { id: { in: versionIds } } });
  await h.prisma.mlPrediction.deleteMany({ where: { entityId: { startsWith: `ci-${h.RUN}` } } });
  await h.prisma.mlAlert.deleteMany({ where: { dedupeKey: { startsWith: `ci-${h.RUN}` } } });
  await h.cleanup();
});

const setEngine = (enabled) => appSettings.update({ mlSettings: { enabled } });

test('the engine and every module start off, and a module not built yet cannot be switched on', async () => {
  const fresh = mlSettings.read(null);
  assert.equal(fresh.enabled, false);
  assert.equal(Object.keys(fresh.modules).length, 10);
  assert.ok(Object.values(fresh.modules).every((on) => on === false));
  // Junk reads as off.
  assert.equal(mlSettings.read({ enabled: 'yes', modules: { search: 1 } }).enabled, false);

  assert.throws(() => mlSettings.merge(null, { enabled: 'on' }), /true or false/);
  assert.throws(() => mlSettings.merge(null, { colour: true }), /not a setting/);
  assert.throws(() => mlSettings.merge(null, { modules: { teleport: true } }), /not a module/);
  // A module not built yet refuses to switch on; a built one may.
  for (const m of MODULES) {
    if (isBuilt(m.key)) assert.equal(mlSettings.merge(null, { modules: { [m.key]: true } }).modules[m.key], true);
    else assert.throws(() => mlSettings.merge(null, { modules: { [m.key]: true } }), /not available yet/);
  }
  assert.deepEqual(MODULES.filter((m) => isBuilt(m.key)).map((m) => m.key), ['recommendations', 'forecasting', 'search', 'segmentation', 'inventory', 'bundles']);
  // Off is always allowed.
  assert.equal(mlSettings.merge(null, { modules: { search: false } }).modules.search, false);
});

test('only a super admin changes the switches, and everyone can read them', async () => {
  const seller = await h.user('SELLER');
  const admin = await h.user('SUPER_ADMIN');
  const denied = await h.api('PUT', '/app-settings', { token: h.token(seller), body: { mlSettings: { enabled: true } } });
  assert.equal(denied.status, 403);

  const ok = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { mlSettings: { enabled: true } } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.mlSettings.enabled, true);
  const bad = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { mlSettings: { modules: { sentiment: true } } } });
  assert.equal(bad.status, 400);

  const pub = await h.api('GET', '/app-settings');
  assert.equal(pub.body.data.mlSettings.enabled, true);
  assert.equal(pub.body.data.mlSettings.modules.bundles, false);
  await setEngine(false);
});

test('the ML admin API is for super admins only', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const townAdmin = await h.user('MUNICIPAL_ADMIN');
  const admin = await h.user('SUPER_ADMIN');
  assert.equal((await h.api('GET', '/ml/status')).status, 401);
  for (const who of [buyer, seller, townAdmin]) {
    assert.equal((await h.api('GET', '/ml/status', { token: h.token(who) })).status, 403);
    assert.equal((await h.api('POST', '/ml/modules/housekeeping/run', { token: h.token(who) })).status, 403);
  }
  const res = await h.api('GET', '/ml/status', { token: h.token(admin) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.modules.length, 10);
  assert.ok(res.body.data.modules.every((m) => m.on === false));
  assert.deepEqual(res.body.data.modules.filter((m) => m.built).map((m) => m.key), ['recommendations', 'forecasting', 'search', 'segmentation', 'inventory', 'bundles']);
  assert.ok('cart_add' in res.body.data.week.events);

  // A module that is not built cannot be run; an unknown one is not found.
  assert.equal((await h.api('POST', '/ml/modules/sentiment/run', { token: h.token(admin) })).status, 409);
  assert.equal((await h.api('POST', '/ml/modules/nothing/run', { token: h.token(admin) })).status, 404);
  assert.equal((await h.api('GET', '/ml/models/x1/versions', { token: h.token(admin) })).status, 404);
});

test('cart and wishlist totals: counted only while the engine is on, and checkout is not a removal', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const a = await h.product(store);
  const b = await h.product(store);
  productIds.push(a.id, b.id);
  const token = h.token(buyer);
  const countOf = async (event, productId) => (await h.prisma.mlEventCount.aggregate({
    where: { eventType: event, productId }, _sum: { count: true },
  }))._sum.count || 0;

  // Off: nothing is counted.
  await setEngine(false);
  await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: a.id, quantity: 1 }] } });
  await new Promise((r) => setTimeout(r, 100));
  await counters.flush();
  assert.equal(await countOf('cart_add', a.id), 0);
  await h.api('PUT', '/me/cart', { token, body: { items: [] } });

  // On: in and out are counted, once per change.
  await setEngine(true);
  await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 2 }] } });
  // The same list again (another device syncing) changes nothing.
  await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 3 }] } });
  await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: a.id, quantity: 1 }] } });
  // a is ordered, then the cart is emptied: a was bought, not taken out.
  await h.order(buyer, store, [{ product: a }]);
  await h.api('PUT', '/me/cart', { token, body: { items: [] } });
  await h.api('PUT', '/me/wishlist', { token, body: { productIds: [a.id, b.id] } });
  await h.api('PUT', '/me/wishlist', { token, body: { productIds: [a.id] } });

  const flushed = await h.eventually(async () => {
    await counters.flush();
    return (await countOf('favorite_remove', b.id)) === 1;
  });
  assert.ok(flushed, 'the counts were written');
  assert.equal(await countOf('cart_add', a.id), 1);
  assert.equal(await countOf('cart_add', b.id), 1);
  assert.equal(await countOf('cart_remove', b.id), 1);
  assert.equal(await countOf('cart_remove', a.id), 0);
  assert.equal(await countOf('favorite_add', a.id), 1);
  assert.equal(await countOf('favorite_add', b.id), 1);
  assert.equal(await countOf('favorite_remove', b.id), 1);
  // No buyer is stored anywhere in the totals.
  const row = await h.prisma.mlEventCount.findFirst({ where: { productId: a.id } });
  assert.deepEqual(Object.keys(row).sort(), ['count', 'day', 'eventType', 'productId']);
  await setEngine(false);
});

test('the cart still saves when the engine cannot count', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const a = await h.product(store);
  productIds.push(a.id);
  await setEngine(true);
  const realFlush = counters.flush;
  // Writing the counts fails: the buyer never sees it.
  const realExec = h.prisma.$executeRaw;
  try {
    const res = await h.api('PUT', '/me/cart', { token: h.token(buyer), body: { items: [{ productId: a.id, quantity: 1 }] } });
    assert.equal(res.status, 200);
    h.prisma.$executeRaw = () => Promise.reject(new Error('database gone'));
    const out = await realFlush();
    assert.equal(out.written, 0);
  } finally {
    h.prisma.$executeRaw = realExec;
    await setEngine(false);
  }
  const cart = await h.api('GET', '/me/cart', { token: h.token(buyer) });
  assert.equal(cart.body.data.length, 1);
});

test('runs are recorded: done, failed with a short reason, past their budget, and one at a time', async () => {
  const ok = await runner.runModule('housekeeping', {
    trigger: 'MANUAL',
    job: async (ctx) => {
      assert.ok(ctx.timeLeft() > 0 && ctx.timeLeft() <= 2000);
      return { rowsRead: 3, rowsWritten: 2, metrics: { mae: 1.5 } };
    },
  });
  runIds.push(ok.id);
  assert.equal(ok.status, 'OK');
  const saved = await h.prisma.mlTrainingRun.findUnique({ where: { id: ok.id } });
  assert.equal(saved.status, 'OK');
  assert.equal(saved.trigger, 'MANUAL');
  assert.equal(saved.rowsWritten, 2);
  assert.equal(saved.metrics.mae, 1.5);
  assert.ok(saved.durationMs >= 0 && saved.completedAt);

  const failed = await runner.runModule('housekeeping', { job: async () => { throw new Error('no rows to learn from'); } });
  runIds.push(failed.id);
  assert.equal(failed.status, 'FAILED');
  assert.equal((await h.prisma.mlTrainingRun.findUnique({ where: { id: failed.id } })).errorSummary, 'no rows to learn from');

  // A job that ignores its budget: recorded as TIMED_OUT, and the next run
  // waits until it has really stopped.
  let aborted = false;
  const slow = await runner.runModule('housekeeping', {
    job: (ctx) => new Promise((resolve) => {
      ctx.signal.addEventListener('abort', () => { aborted = true; setTimeout(resolve, 200); });
    }),
  });
  runIds.push(slow.id);
  assert.equal(slow.status, 'TIMED_OUT');
  assert.ok(aborted);
  const meanwhile = await runner.runModule('housekeeping', { job: async () => ({}) });
  assert.equal(meanwhile.status, 'SKIPPED');
  await new Promise((r) => setTimeout(r, 300));
  const after = await runner.runModule('housekeeping', { job: async () => ({}) });
  runIds.push(after.id);
  assert.equal(after.status, 'OK');

  // A module that is not built, or is off, does not run at all.
  assert.equal((await runner.runModule('forecasting')).status, 'SKIPPED');
});

test('the daily tidy-up writes waiting counts and removes stale results', async () => {
  const id = `ci-${h.RUN}-stale`;
  await h.prisma.mlPrediction.create({
    data: {
      modelKey: 'bundles', modelVersion: 1, predictionType: 'ci', entityType: 'product', entityId: id, value: { x: 1 }, expiresAt: new Date(Date.now() - 1000),
    },
  });
  const res = await runner.runModule('housekeeping', { job: runner.housekeeping });
  runIds.push(res.id);
  assert.equal(res.status, 'OK');
  assert.equal(await h.prisma.mlPrediction.count({ where: { entityId: id } }), 0);
});

test('stored results: replaced whole, read back, and stale ones are not served', async () => {
  const one = `ci-${h.RUN}-p1`;
  const two = `ci-${h.RUN}-p2`;
  const type = `ci${h.RUN}`.slice(0, 40);
  const n = await store.replacePredictions('bundles', type, 3, [
    { entityType: 'product', entityId: one, value: { with: [two], lift: 2.4 } },
    { entityType: 'product', entityId: two, value: { with: [one], lift: 2.4 } },
  ], 60 * 1000);
  assert.equal(n, 2);
  const got = await store.getPrediction('bundles', type, 'product', one);
  assert.equal(got.modelVersion, 3);
  assert.equal(got.value.lift, 2.4);
  // Another kind of result finds nothing.
  assert.equal(await store.getPrediction('bundles', 'other', 'product', one), null);
  const many = await store.getPredictions('bundles', type, 'product', [one, two, 'nope']);
  assert.equal(many.size, 2);
  // A second run replaces the first entirely.
  await store.replacePredictions('bundles', type, 4, [{ entityType: 'product', entityId: one, value: { with: [] } }], 60 * 1000);
  const again = await store.getPredictions('bundles', type, 'product', [one, two]);
  assert.equal(again.size, 1);
  assert.equal((await store.getPrediction('bundles', type, 'product', one)).modelVersion, 4);
  // Stale: not served.
  await h.prisma.mlPrediction.updateMany({ where: { entityId: one }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal(await store.getPrediction('bundles', type, 'product', one), null);
});

test('model versions: a new one waits, activating retires the old, and rolling back works through the API', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const key = 'sentiment';
  const before = await h.prisma.mlModelVersion.findMany({ where: { modelKey: key }, select: { id: true } });
  const v1 = await store.createVersion(key, { algorithm: 'lexicon', params: { words: 10 }, metrics: { accuracy: 0.7 } });
  const v2 = await store.createVersion(key, { algorithm: 'lexicon', params: { words: 20 }, metrics: { accuracy: 0.8 } });
  versionIds.push(v1.id, v2.id);
  assert.equal(v2.version, v1.version + 1);
  assert.equal(v1.status, 'CANDIDATE');

  await store.activateVersion(key, v2.version);
  assert.equal((await store.getActiveVersion(key)).version, v2.version);

  const res = await h.api('POST', `/ml/models/${key}/versions/${v1.version}/activate`, { token: h.token(admin) });
  assert.equal(res.status, 200);
  const rows = await h.prisma.mlModelVersion.findMany({ where: { id: { in: [v1.id, v2.id] } } });
  assert.equal(rows.find((r) => r.id === v1.id).status, 'ACTIVE');
  assert.equal(rows.find((r) => r.id === v2.id).status, 'RETIRED');
  assert.equal((await store.getActiveVersion(key)).version, v1.version);
  // Only one in use.
  assert.equal(await h.prisma.mlModelVersion.count({ where: { modelKey: key, status: 'ACTIVE' } }), 1);
  const logged = await h.eventually(() => h.prisma.auditLog.findFirst({ where: { action: 'ML_MODEL_ACTIVATED', entityId: v1.id } }));
  assert.ok(logged);
  await h.prisma.auditLog.deleteMany({ where: { action: 'ML_MODEL_ACTIVATED', entityId: { in: [v1.id, v2.id] } } });

  assert.equal((await h.api('POST', `/ml/models/${key}/versions/999999/activate`, { token: h.token(admin) })).status, 404);
  assert.equal((await h.api('POST', `/ml/models/${key}/versions/zero/activate`, { token: h.token(admin) })).status, 400);
  assert.equal(before.length + 2, await h.prisma.mlModelVersion.count({ where: { modelKey: key } }));
});

test('an alert is raised once per thing', async () => {
  const alert = {
    alertType: 'ci_check', entityType: 'order', entityId: `ci-${h.RUN}-o1`, dedupeKey: `ci-${h.RUN}-o1`, description: 'Looks unusual',
  };
  assert.ok(await store.raiseAlert(alert));
  assert.equal(await store.raiseAlert(alert), null);
  assert.equal(await h.prisma.mlAlert.count({ where: { dedupeKey: alert.dedupeKey } }), 1);
});

test('guard: an ML step that fails or is too slow hands back the fallback', async () => {
  assert.equal(await guard('ci', async () => 'ok', 'fallback'), 'ok');
  assert.equal(await guard('ci', async () => { throw new Error('boom'); }, 'fallback'), 'fallback');
  assert.equal(await guard('ci', () => new Promise((r) => setTimeout(() => r('late'), 300)), 'fallback', 50), 'fallback');
  assert.deepEqual(await guard('ci', async () => undefined, []), []);
});
