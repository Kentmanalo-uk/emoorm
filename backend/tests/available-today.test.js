const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const availabilityService = require('../src/services/availability.service');
const appSettingService = require('../src/services/appSetting.service');

after(h.cleanup);

const HOUR = 3600e3;
const at = (ms) => new Date(Date.now() + ms).toISOString();

const readyShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 7', acceptsCod: true },
});
const todayItem = (store, extra = {}) => h.product(store, { listingKind: 'TODAY', stock: 0, ...extra });
const publish = (seller, body) => h.api('POST', '/today', { token: h.token(seller), body });
const order = (buyer, store, items, extra = {}) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items, ...extra },
});
const stockOf = async (id) => (await h.prisma.product.findUnique({ where: { id }, select: { stock: true } })).stock;
const listedIds = async (path) => ((await h.api('GET', path)).body.data || []).map((p) => p.id);

test('publishing a window puts the product on sale now, with its quantity as stock', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);

  // Between windows it waits in the seller's catalogue, off the public lists.
  assert.ok(!(await listedIds(`/products?storeId=${store.id}`)).includes(item.id));

  const res = await publish(seller, { productId: item.id, quantity: 5, ordersCloseAt: at(3 * HOUR), prepMinutes: 15 });
  assert.equal(res.status, 201, res.body?.message);
  assert.equal(res.body.data.status, 'LIVE');
  assert.equal(res.body.data.remaining, 5);
  assert.equal(await stockOf(item.id), 5);

  const list = await h.api('GET', `/today?near=${store.municipalityId}`);
  assert.ok(list.body.data.items.some((w) => w.id === res.body.data.id));
  const products = (await h.api('GET', `/products?storeId=${store.id}`)).body.data;
  const shown = products.find((p) => p.id === item.id);
  assert.equal(shown?.availability?.id, res.body.data.id);
  assert.ok((await listedIds(`/products?storeId=${store.id}&today=1`)).includes(item.id));
});

test('publishing checks the product, the times and overlaps', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const regular = await h.product(store);
  const item = await todayItem(store);
  const other = await todayItem(await readyShop(await h.user('SELLER')));

  assert.equal((await publish(seller, { productId: regular.id, quantity: 3, ordersCloseAt: at(HOUR) })).status, 400);
  assert.equal((await publish(seller, { productId: other.id, quantity: 3, ordersCloseAt: at(HOUR) })).status, 404);
  assert.equal((await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(-HOUR) })).status, 400);
  assert.equal((await publish(seller, { productId: item.id, quantity: 0, ordersCloseAt: at(HOUR) })).status, 400);
  assert.equal((await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(HOUR), readyUntil: at(HOUR / 2) })).status, 400);
  assert.equal((await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(2 * HOUR) })).status, 201);
  assert.equal((await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(3 * HOUR) })).status, 409);
});

test('orders sell the window down to sold out; a cancellation during it returns the stock', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const window = (await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(2 * HOUR) })).body.data;
  const buyer = await h.user('BUYER');

  const first = await order(buyer, store, [{ productId: item.id, quantity: 2 }]);
  assert.equal(first.status, 201, first.body?.message);
  const saved = await h.prisma.order.findUnique({ where: { id: first.body.data.id }, include: { items: true } });
  assert.equal(saved.items[0].availabilityId, window.id);
  assert.ok(saved.respondBy, 'a Today order gets a confirm-by time');
  assert.equal(saved.etaFrom.toISOString(), new Date(window.readyFrom).toISOString());
  assert.equal(await stockOf(item.id), 1);
  assert.equal((await h.prisma.productAvailability.findUnique({ where: { id: window.id } })).soldCount, 2);

  assert.equal((await order(buyer, store, [{ productId: item.id, quantity: 2 }])).status, 400);

  const cancelled = await h.api('POST', `/orders/${first.body.data.id}/cancel`, { token: h.token(buyer), body: { reason: 'Changed my mind' } });
  assert.equal(cancelled.status, 200, cancelled.body?.message);
  assert.equal(await stockOf(item.id), 3);
  assert.equal((await h.prisma.productAvailability.findUnique({ where: { id: window.id } })).soldCount, 0);
});

test('checkout: Today items alone, as the window allows, never by courier', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const regular = await h.product(store);
  const item = await todayItem(store);
  const pickupOnly = await todayItem(store);
  await publish(seller, { productId: item.id, quantity: 5, ordersCloseAt: at(2 * HOUR) });
  await publish(seller, { productId: pickupOnly.id, quantity: 5, ordersCloseAt: at(2 * HOUR), fulfillment: 'PICKUP' });
  const buyer = await h.user('BUYER');

  const mixed = await order(buyer, store, [{ productId: item.id, quantity: 1 }, { productId: regular.id, quantity: 1 }]);
  assert.equal(mixed.status, 400);
  assert.match(mixed.body.message, /on their own/);

  // A window can't offer what the shop doesn't: this shop is pickup only.
  const delivery = await publish(seller, { productId: (await todayItem(store)).id, quantity: 2, ordersCloseAt: at(HOUR), fulfillment: 'DELIVERY' });
  assert.equal(delivery.status, 400);

  const together = await order(buyer, store, [{ productId: item.id, quantity: 1 }, { productId: pickupOnly.id, quantity: 1 }]);
  assert.equal(together.status, 201, together.body?.message);
});

test('the clock opens scheduled windows and ends finished ones (stock to 0, nothing returned after)', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const later = await todayItem(store);
  const now = await todayItem(store);

  const scheduled = (await publish(seller, { productId: later.id, quantity: 4, ordersOpenAt: at(HOUR), ordersCloseAt: at(3 * HOUR) })).body.data;
  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(await stockOf(later.id), 0);

  const live = (await publish(seller, { productId: now.id, quantity: 4, ordersCloseAt: at(HOUR) })).body.data;
  const buyer = await h.user('BUYER');
  const placed = await order(buyer, store, [{ productId: now.id, quantity: 1 }]);
  assert.equal(placed.status, 201, placed.body?.message);

  // Time passes: the first window's time comes, the second's ordering ends.
  await h.prisma.productAvailability.update({ where: { id: scheduled.id }, data: { ordersOpenAt: at(-60e3), readyFrom: at(-60e3) } });
  await h.prisma.productAvailability.update({ where: { id: live.id }, data: { ordersCloseAt: at(-60e3) } });
  await availabilityService.runClock();

  assert.equal((await h.prisma.productAvailability.findUnique({ where: { id: scheduled.id } })).status, 'LIVE');
  assert.equal(await stockOf(later.id), 4);
  assert.equal((await h.prisma.productAvailability.findUnique({ where: { id: live.id } })).status, 'ENDED');
  assert.equal(await stockOf(now.id), 0);
  assert.ok(!(await listedIds(`/products?storeId=${store.id}`)).includes(now.id));

  // The batch is over: cancelling now returns nothing to sell.
  const cancelled = await h.api('POST', `/orders/${placed.body.data.id}/cancel`, { token: h.token(buyer), body: { reason: 'Too late' } });
  assert.equal(cancelled.status, 200, cancelled.body?.message);
  assert.equal(await stockOf(now.id), 0);
});

test('a Today order the shop does not confirm in time is cancelled', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(2 * HOUR) });
  const buyer = await h.user('BUYER');
  const placed = await order(buyer, store, [{ productId: item.id, quantity: 1 }]);
  await h.prisma.order.update({ where: { id: placed.body.data.id }, data: { respondBy: at(-60e3) } });

  await availabilityService.expireTodayOrders();
  const after = await h.prisma.order.findUnique({ where: { id: placed.body.data.id } });
  assert.equal(after.status, 'CANCELLED');
  assert.equal(after.cancelReason, 'EXPIRED');
  assert.equal(await stockOf(item.id), 3);
});

test('quantity changes, ending early and publishing again on another day', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const token = h.token(seller);
  const window = (await publish(seller, { productId: item.id, quantity: 3, ordersCloseAt: at(2 * HOUR) })).body.data;

  const more = await h.api('POST', `/today/${window.id}/quantity`, { token, body: { delta: 2 } });
  assert.equal(more.status, 200, more.body?.message);
  assert.equal(await stockOf(item.id), 5);
  assert.equal((await h.api('POST', `/today/${window.id}/quantity`, { token, body: { delta: -9 } })).status, 400);

  const ended = await h.api('POST', `/today/${window.id}/end`, { token });
  assert.equal(ended.body.data.status, 'ENDED');
  assert.equal(await stockOf(item.id), 0);

  const again = await h.api('POST', `/today/${window.id}/repeat`, { token, body: {} });
  assert.equal(again.status, 201, again.body?.message);
  assert.equal(again.body.data.status, 'SCHEDULED');
  const shift = new Date(again.body.data.ordersCloseAt) - new Date(window.ordersCloseAt);
  assert.ok(Math.abs(shift - 24 * HOUR) < 60e3 || shift > 0, 'tomorrow, at the same time of day');

  const mine = await h.api('GET', '/today/mine', { token });
  assert.ok(mine.body.data.windows.some((w) => w.id === again.body.data.id));
});

test('Today products keep no manual stock and no stock per option', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const token = h.token(seller);
  const item = await todayItem(store);
  assert.equal((await h.api('POST', `/products/${item.id}/stock`, { token, body: { delta: 5 } })).status, 400);

  const regular = await h.product(store, { stock: 9 });
  const switched = await h.api('PUT', `/products/${regular.id}`, { token, body: { listingKind: 'TODAY' } });
  assert.equal(switched.status, 200, switched.body?.message);
  assert.equal(await stockOf(regular.id), 0);

  const stocked = await h.product(store, { variations: [{ name: 'Size', options: ['S', 'L'], stocks: { S: 2, L: 3 } }], stock: 5 });
  assert.equal((await h.api('PUT', `/products/${stocked.id}`, { token, body: { listingKind: 'TODAY' } })).status, 400);
});

test('switching the feature off hides the list and stops publishing', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  await appSettingService.update({ availableTodayEnabled: false });
  try {
    assert.equal((await h.api('GET', '/today')).body.data.enabled, false);
    assert.equal((await publish(seller, { productId: item.id, quantity: 2, ordersCloseAt: at(HOUR) })).status, 403);
  } finally {
    await appSettingService.update({ availableTodayEnabled: true });
  }
});
