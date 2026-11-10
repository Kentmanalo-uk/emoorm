const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const settings = require('../src/ml/settings');
const runner = require('../src/ml/runner');
const store = require('../src/ml/store');
const safe = require('../src/ml/safe');
const sentiment = require('../src/ml/sentiment');
const anomalies = require('../src/ml/anomalies');
const imageQuality = require('../src/ml/imageQuality');
const purchase = require('../src/ml/purchase');
const sharp = require('../src/lib/sharp');

/*
 * Phases 4 and 5: review sentiment, unusual activity, photo quality,
 * purchase prediction; the pause after failures, version clean-up, response
 * times. Modules are switched on in this process only (the settings row is
 * shared with the other test files running alongside).
 */
const on = new Set();
const realIsOn = settings.isOn;
settings.isOn = async (key) => (key ? on.has(key) : on.size > 0);
const started = new Date();
const keys = ['sentiment', 'anomalies', 'purchasePrediction', 'phase5ci'];

after(async () => {
  settings.isOn = realIsOn;
  await h.prisma.mlAlert.deleteMany({ where: { createdAt: { gte: started } } });
  await h.prisma.mlPrediction.deleteMany({ where: { modelKey: { in: keys }, generatedAt: { gte: started } } });
  await h.prisma.mlModelVersion.deleteMany({ where: { modelKey: { in: keys }, trainedAt: { gte: started } } });
  await h.prisma.mlTrainingRun.deleteMany({ where: { modelKey: { in: keys }, startedAt: { gte: started } } });
  await h.prisma.auditLog.deleteMany({ where: { action: 'ML_FLAG_REVIEWED', createdAt: { gte: started } } });
  await h.cleanup();
});

test('sentiment: the blueprint\'s example, Tagalog, negation, and lukewarm', () => {
  const ex = sentiment.analyze('The banana chips taste great, but the packaging arrived damaged.');
  assert.equal(ex.sentiment, 'mixed');
  assert.deepEqual(ex.aspects, { taste: 'positive', packaging: 'negative' });
  assert.deepEqual(sentiment.analyze('Masarap pero sira ang packaging').aspects, { taste: 'positive', packaging: 'negative' });
  assert.equal(sentiment.analyze('Sobrang sarap! Babalik ako.').sentiment, 'positive');
  const bad = sentiment.analyze('Hindi masarap, walang lasa. Matagal pa dumating.');
  assert.equal(bad.sentiment, 'negative');
  assert.deepEqual(bad.aspects, { taste: 'negative', delivery: 'negative' });
  assert.equal(sentiment.analyze('The fish was not bad at all').sentiment, 'positive');
  assert.equal(sentiment.analyze('Ok lang').sentiment, 'neutral');
  assert.equal(sentiment.agrees(5, 'positive'), true);
  assert.equal(sentiment.agrees(1, 'positive'), false);
  assert.equal(sentiment.agrees(3, 'negative'), null);
});

test('sentiment: a shop\'s summary from its reviews, and the endpoint to read a text', async () => {
  const seller = await h.user('SELLER');
  const shop = await h.shop(seller);
  const p = await h.product(shop);
  const texts = [
    [5, 'Sobrang sarap, babalik ako'], [5, 'Fresh and delicious, thank you'], [4, 'Masarap pero sira ang packaging'],
    [2, 'Matagal dumating at basag ang garapon'], [5, 'Sulit sa presyo, mabait si seller'], [1, 'Bulok na nung dumating, sayang'],
  ];
  for (const [rating, comment] of texts) {
    // eslint-disable-next-line no-await-in-loop
    await h.prisma.review.create({ data: { userId: (await h.user('BUYER')).id, productId: p.id, rating, comment } });
  }
  on.add('sentiment');
  const run = await runner.runModule('sentiment');
  assert.equal(run.status, 'OK', run.error || run.metrics?.reason);
  const res = await h.api('GET', '/ml/insights/mine', { token: h.token(seller) });
  const r = res.body.data.reviews;
  assert.equal(r.status, 'ok');
  assert.equal(r.reviews, 6);
  assert.equal(r.counts.positive, 3);
  assert.ok(r.counts.negative >= 2);
  const packaging = r.complaints.find((c) => c.aspect === 'packaging');
  assert.ok(packaging && packaging.count >= 2);
  assert.ok(packaging.examples.length >= 1);
  assert.ok(r.praise.some((x) => x.aspect === 'taste'));

  const read = await h.api('POST', '/ml/reviews/analyze', { token: h.token(seller), body: { text: 'Mabilis ang delivery pero maliit ang serving' } });
  assert.equal(read.body.data.sentiment, 'mixed');
  assert.deepEqual(read.body.data.aspects, { delivery: 'positive', size: 'negative' });
  // Nothing changed on the reviews themselves.
  assert.equal(await h.prisma.review.count({ where: { productId: p.id, rating: 5 } }), 3);
  on.delete('sentiment');
  assert.equal((await h.api('POST', '/ml/reviews/analyze', { token: h.token(seller), body: { text: 'ok' } })).body.data.status, 'off');
  await h.prisma.review.deleteMany({ where: { productId: p.id } });
});

test('unusual activity: the rules, robust statistics, and nothing below them', () => {
  assert.equal(anomalies.maxWithin(['2026-11-10T00:00:00Z', '2026-11-10T05:00:00Z', '2026-11-11T06:00:00Z'], 24), 2);
  assert.equal(anomalies.median([1, 9, 3]), 3);
  // A far-off value: a big robust z; a usual one: small.
  const usual = [100, 120, 110, 90, 105, 115, 95, 100, 110, 100];
  assert.ok(anomalies.robustZ(2000, usual) > 50);
  assert.ok(Math.abs(anomalies.robustZ(110, usual)) < 2);

  const now = new Date('2026-11-10T12:00:00Z');
  const at = (h0) => new Date(now.getTime() - h0 * 3600e3);
  const order = (id, buyerId, total, hoursAgo, extra = {}) => ({
    id, orderNumber: id, buyerId, storeId: 's1', total, createdAt: at(hoursAgo), buyerCreatedAt: at(24 * 400), storeMunicipalityId: 'm1', ...extra,
  });
  const history = usual.map((total) => ({ storeId: 's1', total }));
  const flags = anomalies.findFlags({
    now,
    orders: [
      ...[1, 2, 3, 4, 5].map((i) => order(`b${i}`, 'busy', 100, i)), // 5 in 5 hours
      order('big', 'calm', 5000, 2),
      order('ok', 'calm2', 120, 3),
    ],
    history: [...history, ...history],
    failures: new Map([['payer', [{ orderId: 'x' }, { orderId: 'y' }]], ['once', [{ orderId: 'z' }]]]),
    noShows: new Map([['ghost', [{ id: 1 }, { id: 2 }, { id: 3 }]]]),
  });
  const types = flags.map((f) => `${f.alertType}:${f.entityId}`).sort();
  assert.deepEqual(types, ['order_burst:busy', 'payment_failures:payer', 'repeat_no_shows:ghost', 'unusual_amount:big']);
  assert.ok(flags.every((f) => f.description && f.dedupeKey && f.score >= 0 && f.score <= 1));
});

test('unusual activity: raised once, seen by the right admins, judged by a person, nothing else touched', async () => {
  const buyer = await h.user('BUYER');
  const shop = await h.shop(await h.user('SELLER'));
  const p = await h.product(shop);
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await h.order(buyer, shop, [{ product: p }], { createdAt: new Date(Date.now() - i * 3600e3) });
  }
  on.add('anomalies');
  const first = await runner.runModule('anomalies');
  assert.equal(first.status, 'OK', first.error);
  await runner.runModule('anomalies');
  const mine = await h.prisma.mlAlert.findMany({ where: { alertType: 'order_burst', entityId: buyer.id } });
  assert.equal(mine.length, 1, 'raised once, however often it runs');
  // Nothing happened to the buyer or the orders.
  assert.equal((await h.prisma.user.findUnique({ where: { id: buyer.id } })).isActive, true);
  assert.equal(await h.prisma.order.count({ where: { buyerId: buyer.id, status: 'PENDING' } }), 6);

  const superAdmin = await h.user('SUPER_ADMIN');
  const townAdmin = await h.user('MUNICIPAL_ADMIN');
  const { municipality } = await h.reference();
  const elsewhere = await h.otherTown(municipality.id);
  const otherAdmin = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: elsewhere.id } } });

  const listOf = async (who) => (await h.api('GET', '/ml/fraud/alerts?pageSize=100&type=order_burst', { token: h.token(who) })).body.data;
  const all = await listOf(superAdmin);
  const row = all.rows.find((a) => a.id === mine[0].id);
  assert.ok(row);
  assert.equal(row.person.id, buyer.id);
  assert.ok(row.orders.length >= 5);
  assert.ok((await listOf(townAdmin)).rows.some((a) => a.id === mine[0].id));
  assert.ok(!(await listOf(otherAdmin)).rows.some((a) => a.id === mine[0].id));
  assert.equal((await h.api('PATCH', `/ml/fraud/alerts/${mine[0].id}`, { token: h.token(otherAdmin), body: { status: 'CLEARED' } })).status, 404);
  assert.equal((await h.api('GET', '/ml/fraud/alerts', { token: h.token(buyer) })).status, 403);

  const judged = await h.api('PATCH', `/ml/fraud/alerts/${mine[0].id}`, { token: h.token(townAdmin), body: { status: 'CLEARED', note: 'A family order for a party' } });
  assert.equal(judged.status, 200);
  const saved = await h.prisma.mlAlert.findUnique({ where: { id: mine[0].id } });
  assert.equal(saved.status, 'CLEARED');
  assert.equal(saved.reviewedById, townAdmin.id);
  assert.ok(saved.resolvedAt);
  assert.equal(saved.details.note, 'A family order for a party');
  assert.ok(await h.eventually(() => h.prisma.auditLog.findFirst({ where: { action: 'ML_FLAG_REVIEWED', entityId: saved.id } })));
  assert.equal((await h.api('PATCH', `/ml/fraud/alerts/${saved.id}`, { token: h.token(townAdmin), body: { status: 'BANNED' } })).status, 400);

  // One order, checked on demand.
  const one = await h.prisma.order.findFirst({ where: { buyerId: buyer.id } });
  const check = await h.api('POST', '/ml/fraud/evaluate', { token: h.token(superAdmin), body: { orderId: one.id } });
  assert.equal(check.status, 200);
  assert.ok(check.body.data.flags.some((f) => f.type === 'order_burst'));
  assert.equal((await h.api('POST', '/ml/fraud/evaluate', { token: h.token(otherAdmin), body: { orderId: one.id } })).status, 404);
  on.delete('anomalies');
});

// A sharp, mid-grey checkerboard; the same blurred; a dark one; a small one.
const checker = async (size = 800) => {
  const cell = 20;
  const raw = Buffer.alloc(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) raw[y * size + x] = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) ? 200 : 60;
  return sharp(raw, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
};

test('photo quality: sharp passes; blurry, dark and small are told what to do', async () => {
  const good = await imageQuality.analyzePhoto({ buffer: await checker() });
  assert.equal(good.verdict, 'good', JSON.stringify(good.checks));
  const blurred = await imageQuality.analyzePhoto({ buffer: await sharp(await checker()).blur(14).png().toBuffer() });
  assert.equal(blurred.checks.find((c) => c.key === 'sharpness').ok, false);
  assert.equal(blurred.verdict, 'poor');
  const dark = await imageQuality.analyzePhoto({ buffer: await sharp(await checker()).linear(0.2, 0).png().toBuffer() });
  assert.equal(dark.checks.find((c) => c.key === 'brightness').ok, false);
  assert.match(dark.checks.find((c) => c.key === 'brightness').hint, /too dark/);
  const small = await imageQuality.analyzePhoto({ buffer: await checker(300) });
  assert.equal(small.checks.find((c) => c.key === 'size').ok, false);
  assert.equal(small.width, 300);
  // Only this server's own uploads are read by address.
  assert.equal(await imageQuality.analyzePhoto({ url: '../../etc/passwd' }), null);
  assert.equal(await imageQuality.analyzePhoto({ url: 'https://example.com/a.jpg' }), null);
});

test('photo quality endpoint: sellers send a photo; off says off; buyers are refused', async () => {
  const seller = await h.user('SELLER');
  const send = async (who) => {
    const fd = new FormData();
    fd.append('image', new Blob([await checker()], { type: 'image/png' }), 'p.png');
    const res = await fetch(`${await h.startApp()}/ml/images/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${h.token(who)}` }, body: fd });
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await send(seller)).body.data.status, 'off');
  on.add('imageQuality');
  const res = await send(seller);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.verdict, 'good');
  assert.equal((await send(await h.user('BUYER'))).status, 403);
  on.delete('imageQuality');
});

test('purchase prediction: learns from separable data, AUC is right, and waits for enough purchases', async () => {
  assert.equal(purchase.auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(purchase.auc([1, 1], [1, 1]), null);
  // Buyers who ordered in a category before buy there again.
  const X = [];
  const y = [];
  for (let i = 0; i < 400; i += 1) {
    const cat = i % 2 ? 3 : 0;
    X.push(purchase.row({
      catOrders: cat, shopOrders: 0, rebuy: false, popularity: 5, price: 100, usualPrice: 100, sameTown: false,
    }));
    y.push(i % 2);
  }
  const model = purchase.fit(X, y);
  assert.ok(purchase.predict(model, X[1]) > 0.8);
  assert.ok(purchase.predict(model, X[0]) < 0.2);

  on.add('purchasePrediction');
  const saved = purchase.LIMITS.minPositives;
  purchase.LIMITS.minPositives = 1e9;
  try {
    const run = await runner.runModule('purchasePrediction');
    assert.equal(run.status, 'SKIPPED');
    assert.match(run.metrics.reason, /needs/);
  } finally {
    purchase.LIMITS.minPositives = saved;
  }
  const buyer = await h.user('BUYER');
  const p = await h.product(await h.shop(await h.user('SELLER')));
  const res = await h.api('GET', `/ml/purchase-probability/${p.id}`, { token: h.token(buyer) });
  assert.equal(res.status, 200);
  assert.ok(['insufficient', 'ok'].includes(res.body.data.status));
  assert.equal((await h.api('GET', `/ml/purchase-probability/${p.id}`, { token: h.token(await h.user('SELLER')) })).status, 403);
  on.delete('purchasePrediction');
});

test('phase 5: a scheduled job rests after 3 failures (by hand still runs); old versions are cleared; times are kept', async () => {
  const key = 'sentiment';
  const failing = async () => { throw new Error('ci failure'); };
  on.add(key);
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runner.runModule(key, { job: failing });
    ids.push(r.id);
    assert.equal(r.status, 'FAILED');
  }
  assert.equal(await runner.pausedAfterFailures(key), true);
  const resting = await runner.runModule(key);
  assert.equal(resting.status, 'SKIPPED');
  assert.match(resting.reason, /paused after 3/);
  // By hand: it runs.
  const manual = await runner.runModule(key, { trigger: 'MANUAL', job: async () => ({}) });
  assert.equal(manual.status, 'OK');
  assert.equal(await runner.pausedAfterFailures(key), false);
  on.delete(key);

  // Versions: the one in use and the newest 10 others stay.
  const made = [];
  for (let i = 0; i < 14; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    made.push(await store.createVersion('phase5ci', { algorithm: 'ci' }));
  }
  await store.activateVersion('phase5ci', made[0].version);
  const purged = await store.purgeOld();
  assert.ok(purged.versions >= 3);
  const left = await h.prisma.mlModelVersion.findMany({ where: { modelKey: 'phase5ci' } });
  assert.equal(left.length, 11);
  assert.ok(left.some((v) => v.status === 'ACTIVE' && v.version === made[0].version));

  // Response times and fall-backs, kept per step.
  await safe.guard('ci-step', async () => 1);
  await safe.guard('ci-step', async () => { throw new Error('x'); });
  const s = safe.stats().find((x) => x.label === 'ci-step');
  assert.equal(s.calls, 2);
  assert.equal(s.fallbacks, 1);
  assert.ok(s.p95 >= 0);
  const health = await fetch(`${(await h.startApp()).replace(/\/api$/, '')}/health`).then((r) => r.json());
  assert.ok(health.ml && Array.isArray(health.ml.steps));
});
