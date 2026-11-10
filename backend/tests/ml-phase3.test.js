const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const settings = require('../src/ml/settings');
const runner = require('../src/ml/runner');
const forecasting = require('../src/ml/forecasting');
const inventory = require('../src/ml/inventory');
const segmentation = require('../src/ml/segmentation');
const performance = require('../src/ml/performance');

/*
 * Phase 3: forecasting, stock risk, buyer groups, viewed but not bought. The
 * modules are switched on in this process only (the settings row is shared
 * with the other test files running alongside).
 */
const on = new Set();
const realIsOn = settings.isOn;
settings.isOn = async (key) => (key ? on.has(key) : on.size > 0);
const started = new Date();
const keys = ['forecasting', 'inventory', 'segmentation'];

after(async () => {
  settings.isOn = realIsOn;
  await h.prisma.mlPrediction.deleteMany({ where: { modelKey: { in: keys }, generatedAt: { gte: started } } });
  await h.prisma.mlModelVersion.deleteMany({ where: { modelKey: { in: keys }, trainedAt: { gte: started } } });
  await h.prisma.mlTrainingRun.deleteMany({ where: { modelKey: { in: keys }, startedAt: { gte: started } } });
  await h.cleanup();
});

const weeksOf = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('forecast: nothing below the minimum, an early estimate before 10 weeks, a validated one after', () => {
  // 3 weeks of history: not enough, and it says what it needs.
  const few = forecasting.forecastSeries([...weeksOf(23, () => 0), 2, 3, 2], 20);
  assert.equal(few.status, 'insufficient');
  assert.deepEqual(few.needs, { weeks: 6, units: 6 });

  // 7 weeks of 5 a week: the 4-week average, marked early, no 90 days.
  const early = forecasting.forecastSeries([...weeksOf(19, () => 0), ...weeksOf(7, () => 5)], 48);
  assert.equal(early.status, 'early');
  assert.equal(early.method, 'ma4');
  assert.equal(early.next7.units, 5);
  assert.equal(early.next30.units, Math.round((5 * 30) / 7 * 10) / 10);
  assert.equal(early.next90, null);
  assert.equal(early.validation, null);

  // 12 steady weeks: exact, no error, prepare = the week's need.
  const steady = forecasting.forecastSeries([...weeksOf(14, () => 0), ...weeksOf(12, () => 10)], 83);
  assert.equal(steady.status, 'ok');
  assert.equal(steady.next7.units, 10);
  assert.equal(steady.validation.mae, 0);
  assert.equal(steady.prepare, 10);
  assert.equal(steady.trend, 'steady');

  // 16 rising weeks: a trend method beats or ties the naive baseline, and it says rising.
  const rising = forecasting.forecastSeries([...weeksOf(10, () => 0), ...weeksOf(16, (i) => 2 + i)], 111);
  assert.equal(rising.status, 'ok');
  assert.equal(rising.trend, 'rising');
  assert.ok(rising.validation.mae <= rising.baseline.mae);
  assert.ok(rising.next7.units > 15, `expected more than last week's 17ish, got ${rising.next7.units}`);
  assert.ok(rising.next7.low <= rising.next7.units && rising.next7.units <= rising.next7.high);

  // Half a year behind it: a 90-day forecast too.
  const long = forecasting.forecastSeries(weeksOf(26, () => 4), 200);
  assert.ok(long.next90);
  assert.equal(long.next90.units, Math.round((4 * 90) / 7 * 10) / 10);
});

test('forecast errors: MAE, RMSE, and MAPE only over weeks that sold', () => {
  const e = forecasting.errors([2, 4, 6], [4, 4, 0]);
  assert.equal(Math.round(e.mae * 1000) / 1000, 2.667);
  assert.equal(Math.round(e.rmse * 1000) / 1000, 3.651);
  assert.equal(e.mape, 0.25); // only the two weeks that sold: (|2-4|/4 + |4-4|/4) / 2
  assert.equal(forecasting.errors([1], [0]).mape, null);
});

test('stock risk: the blueprint\'s example, out of stock, and no sales', () => {
  // 40 jars, 5 a day: 8 days, if sales stay as they are.
  const jam = inventory.outlook({ stock: 40, lowStockThreshold: 5 }, { recent: 5, forecast: null }, new Date('2026-11-10T02:00:00Z'));
  assert.equal(jam.daysLeft, 8);
  assert.equal(jam.runsOutOn, '2026-11-18');
  assert.equal(jam.risk, 'MEDIUM');
  assert.equal(jam.restock, 110); // 30 days at 5, less the 40 on hand
  assert.equal(jam.basis, 'recent');

  // The forecast's rate is used when there is one.
  const forecast = inventory.outlook({ stock: 12 }, { recent: 0.1, forecast: 2 });
  assert.equal(forecast.basis, 'forecast');
  assert.equal(forecast.daysLeft, 6);
  assert.equal(forecast.risk, 'HIGH');

  assert.equal(inventory.outlook({ stock: 0 }, { recent: 1, forecast: null }).risk, 'OUT');
  const idle = inventory.outlook({ stock: 9 }, { recent: 0, forecast: null });
  assert.equal(idle.risk, 'NO_SALES');
  assert.equal(idle.daysLeft, null);
  assert.equal(idle.restock, 0);
});

test('buyer groups: the RFM rules, and nothing for a shop with under 5 buyers', () => {
  assert.equal(segmentation.groupBuyers(weeksOf(4, () => ({
    recencyDays: 5, firstDays: 5, frequency: 1, monetary: 100,
  }))), null);
  const g = segmentation.groupBuyers([
    { recencyDays: 200, firstDays: 300, frequency: 4, monetary: 900 }, // inactive
    { recencyDays: 10, firstDays: 10, frequency: 1, monetary: 100 }, // new
    { recencyDays: 20, firstDays: 200, frequency: 5, monetary: 800 }, // frequent
    { recencyDays: 50, firstDays: 120, frequency: 2, monetary: 300 }, // returning
    { recencyDays: 70, firstDays: 70, frequency: 1, monetary: 150 }, // occasional
  ]);
  assert.deepEqual(g.groups, {
    new: 1, frequent: 1, high_value: 0, returning: 1, occasional: 1, inactive: 1,
  });
  assert.equal(g.buyers, 5);
  assert.equal(g.repeatRate, 0.6);
  assert.equal(g.avgOrders, 2.6);
  // With 8+ buyers, the top quarter's spenders are high value.
  const eight = segmentation.groupBuyers(weeksOf(8, (i) => ({
    recencyDays: 40, firstDays: 100, frequency: 1, monetary: (i + 1) * 100,
  })));
  assert.equal(eight.groups.high_value, 2);
});

test('viewed but not bought: flags by the shop\'s own rate, and waits for enough views', () => {
  assert.equal(performance.flag([{ id: 'a', views: 30, orders: 0 }]).status, 'insufficient');
  const r = performance.flag([
    { id: 'seen', views: 40, orders: 0 },
    { id: 'fine', views: 40, orders: 8 },
    { id: 'weak', views: 60, orders: 1 },
    { id: 'quiet', views: 5, orders: 0 },
  ]);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.flagged.map((x) => x.id), ['weak', 'seen']);
});

test('a seller\'s insights: forecast, stock risk and buyer groups from real orders, their shop only', async () => {
  const seller = await h.user('SELLER');
  const shop = await h.shop(seller);
  const steady = await h.product(shop, { name: `Ci Steady ${h.RUN}`, stock: 40, price: 50 });
  const busy = await h.product(shop, { name: `Ci Busy ${h.RUN}`, stock: 5, price: 80 });
  const day = 24 * 60 * 60 * 1000;
  // steady: 2 a week for 12 weeks, from 6 different buyers.
  const buyers = [];
  for (let i = 0; i < 6; i += 1) buyers.push(await h.user('BUYER')); // eslint-disable-line no-await-in-loop
  for (let w = 0; w < 12; w += 1) {
    // eslint-disable-next-line no-await-in-loop
    await h.order(buyers[w % 6], shop, [{ product: steady, quantity: 2 }], {
      status: 'COMPLETED', createdAt: new Date(Date.now() - (w * 7 + 1) * day),
    });
  }
  // busy: 7 a week for the last 2 weeks only (too little history to forecast).
  for (let w = 0; w < 2; w += 1) {
    // eslint-disable-next-line no-await-in-loop
    await h.order(buyers[w], shop, [{ product: busy, quantity: 7 }], {
      status: 'COMPLETED', createdAt: new Date(Date.now() - (w * 7 + 2) * day),
    });
  }

  // Everything off: each part says so.
  const off = await h.api('GET', '/ml/insights/mine', { token: h.token(seller) });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.forecast.status, 'off');
  assert.equal(off.body.data.stock.status, 'off');
  assert.equal(off.body.data.buyers.status, 'off');

  for (const k of keys) on.add(k);
  for (const k of keys) {
    // eslint-disable-next-line no-await-in-loop
    const run = await runner.runModule(k);
    assert.equal(run.status, 'OK', `${k}: ${run.error || run.metrics?.reason}`); // eslint-disable-line
  }

  const res = await h.api('GET', '/ml/insights/mine', { token: h.token(seller) });
  const data = res.body.data;
  assert.equal(data.forecast.status, 'ok');
  const f = data.forecast.products.find((p) => p.id === steady.id);
  assert.equal(f.next7.units, 2);
  assert.equal(f.trend, 'steady');
  assert.ok(!data.forecast.products.some((p) => p.id === busy.id), 'two weeks is not enough to forecast');
  assert.equal(data.forecast.withoutForecast, 1);
  assert.equal(data.forecast.sales7.amount, 100); // 2 a week at ₱50

  // busy runs out first: 5 left, 14 sold in 28 days = 0.5 a day -> 10 days.
  assert.equal(data.stock.products[0].id, busy.id);
  assert.equal(data.stock.products[0].daysLeft, 10);
  assert.equal(data.stock.products[0].risk, 'MEDIUM');
  const s = data.stock.products.find((p) => p.id === steady.id);
  assert.equal(s.basis, 'forecast');
  assert.equal(s.daysLeft, 140); // 40 at 2 a week

  assert.equal(data.buyers.status, 'ok');
  assert.equal(data.buyers.buyers, 6);
  assert.equal(Object.values(data.buyers.groups).reduce((a, b) => a + b, 0), 6);
  assert.equal(data.buyers.months.length, 6);
  // No buyer is named anywhere in the answer.
  const text = JSON.stringify(data);
  for (const b of buyers) assert.ok(!text.includes(b.id) && !text.includes(b.email));

  // One product, for its owner only.
  const one = await h.api('GET', `/ml/forecast/products/${steady.id}`, { token: h.token(seller) });
  assert.equal(one.body.data.forecast.next7.units, 2);
  const otherSeller = await h.user('SELLER');
  await h.shop(otherSeller);
  assert.equal((await h.api('GET', `/ml/forecast/products/${steady.id}`, { token: h.token(otherSeller) })).status, 404);
  const others = await h.api('GET', '/ml/insights/mine', { token: h.token(otherSeller) });
  assert.ok(!JSON.stringify(others.body.data).includes(steady.id));
  assert.equal((await h.api('GET', '/ml/insights/mine', { token: h.token(await h.user('BUYER')) })).status, 403);
  for (const k of keys) on.delete(k);
});

test('a module that fails takes only its own part with it', async () => {
  const seller = await h.user('SELLER');
  await h.shop(seller);
  on.add('forecasting');
  on.add('inventory');
  const real = forecasting.forecastsFor;
  forecasting.forecastsFor = async () => { throw new Error('database gone'); };
  try {
    const res = await h.api('GET', '/ml/insights/mine', { token: h.token(seller) });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.forecast.status, 'unavailable');
    assert.notEqual(res.body.data.stock.status, 'unavailable');
  } finally {
    forecasting.forecastsFor = real;
    on.delete('forecasting');
    on.delete('inventory');
  }
});
