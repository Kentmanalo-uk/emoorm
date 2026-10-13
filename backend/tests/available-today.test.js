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

// ── Several days at once (POST /today/batch, repeat with dates) ──────────

const { manilaDay, addDays, manilaAt } = require('../src/utils/availability');

const day = (n) => addDays(manilaDay(Date.now()), n);
// A Manila day and time of day as an ISO string.
const manila = (d, hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(manilaAt(d, hh * 60 + mm)).toISOString();
};
const iso = (v) => new Date(v).toISOString();
const batch = (seller, body) => h.api('POST', '/today/batch', { token: h.token(seller), body });
const windowsOf = (productId) => h.prisma.productAvailability.findMany({ where: { productId }, orderBy: { ordersOpenAt: 'asc' } });

test('batch: one item on several days, the same times and quantity each day, followers told once', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const follower = await h.user('BUYER');
  await h.prisma.storeFollow.create({ data: { buyerId: follower.id, storeId: store.id } });
  const dates = [day(3), day(1), day(2), day(1)]; // any order, repeats ignored

  const res = await batch(seller, { productId: item.id, quantity: 6, mode: 'READY_NOW', dates, open: '10:00', close: '14:00' });
  assert.equal(res.status, 201, res.body?.message);
  const { windows } = res.body.data;
  assert.equal(windows.length, 3);
  windows.forEach((w, i) => {
    assert.equal(w.status, 'SCHEDULED');
    assert.equal(w.quantity, 6);
    assert.equal(iso(w.ordersOpenAt), manila(day(i + 1), '10:00'));
    assert.equal(iso(w.ordersCloseAt), manila(day(i + 1), '14:00'));
    // Ready while orders are open, as a single post is.
    assert.equal(iso(w.readyFrom), iso(w.ordersOpenAt));
    assert.equal(iso(w.readyUntil), iso(w.ordersCloseAt));
  });
  assert.equal((await windowsOf(item.id)).length, 3);
  assert.equal(await stockOf(item.id), 0, 'nothing on sale until the first day');

  const notices = await h.prisma.notification.findMany({ where: { userId: follower.id, type: 'STORE_PROMOTION' } });
  assert.equal(notices.length, 1, 'one notice for the whole post');
  assert.match(notices[0].message, /3 days, starting tomorrow/);

  // "Starting now" works for today, and opens at once.
  const soon = await todayItem(store);
  const close = new Date(Date.now() + 2 * HOUR + 8 * HOUR).toISOString().slice(11, 16); // Manila clock, 2h from now
  const now = await batch(seller, { productId: soon.id, quantity: 4, dates: [day(0)], open: 'now', close });
  assert.equal(now.status, 201, now.body?.message);
  assert.equal(now.body.data.windows[0].status, 'LIVE');
  assert.equal(await stockOf(soon.id), 4);
  const late = await batch(seller, { productId: soon.id, quantity: 4, dates: [day(1)], open: 'now', close: '14:00' });
  assert.equal(late.status, 400);
});

test('batch: one bad day stops the whole post, and says which day', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const taken = await publish(seller, { productId: item.id, quantity: 2, ordersOpenAt: manila(day(2), '11:00'), ordersCloseAt: manila(day(2), '12:00') });
  assert.equal(taken.status, 201, taken.body?.message);

  const res = await batch(seller, { productId: item.id, quantity: 5, dates: [day(1), day(2), day(3)], open: '10:00', close: '14:00' });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}: /, 'the message starts with the day');
  assert.equal((await windowsOf(item.id)).length, 1, 'no day of the batch was posted');

  const past = await batch(seller, { productId: item.id, quantity: 5, dates: [day(-1), day(4)], open: '10:00', close: '14:00' });
  assert.equal(past.status, 400);
  assert.match(past.body.message, /passed/);
  const noTime = await batch(seller, { productId: item.id, quantity: 5, dates: [day(4)], open: '10:00' });
  assert.equal(noTime.status, 400);
  assert.match(noTime.body.message, /Orders close/);
  assert.equal((await batch(seller, { productId: item.id, quantity: 0, dates: [day(4)], open: '10:00', close: '14:00' })).status, 400);
  assert.equal((await windowsOf(item.id)).length, 1);
});

test('batch: days up to 30 days ahead, not further', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const far = await batch(seller, { productId: item.id, quantity: 1, dates: [day(5), day(30)], open: '08:00', close: '09:00' });
  assert.equal(far.status, 400);
  assert.match(far.body.message, /30 days/);
  assert.equal((await windowsOf(item.id)).length, 0);

  const last = await batch(seller, { productId: item.id, quantity: 1, dates: [day(29)], open: '23:30', close: '23:45' });
  assert.equal(last.status, 201, last.body?.message);
  const many = Array.from({ length: 32 }, (_, i) => day(i % 30));
  assert.equal((await batch(seller, { productId: item.id, quantity: 1, dates: many, open: '08:00', close: '09:00' })).status, 400);
});

test('batch: orders that close before they open close the next day', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const res = await batch(seller, { productId: item.id, quantity: 3, dates: [day(1), day(2)], open: '22:00', close: '02:00' });
  assert.equal(res.status, 201, res.body?.message);
  const [first, second] = res.body.data.windows;
  assert.equal(iso(first.ordersOpenAt), manila(day(1), '22:00'));
  assert.equal(iso(first.ordersCloseAt), manila(day(2), '02:00'));
  assert.equal(iso(second.ordersCloseAt), manila(day(3), '02:00'));
  assert.equal(new Date(first.ordersCloseAt) - new Date(first.ordersOpenAt), 4 * HOUR);
});

test('batch: a pre-order ready the next day; it needs a ready time', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const base = { productId: item.id, quantity: 10, mode: 'PRE_ORDER', dates: [day(1), day(2)], open: '18:00', close: '21:00' };

  const none = await batch(seller, base);
  assert.equal(none.status, 400);
  assert.match(none.body.message, /ready/);

  const sameDay = await batch(seller, { ...base, readyFrom: '19:00', readyUntil: '22:00' });
  assert.equal(sameDay.status, 400, 'a same-day pre-order is ready after orders close');

  const res = await batch(seller, { ...base, readyFrom: '06:00', readyUntil: '10:00', readyNextDay: true });
  assert.equal(res.status, 201, res.body?.message);
  res.body.data.windows.forEach((w, i) => {
    assert.equal(w.mode, 'PRE_ORDER');
    assert.equal(iso(w.readyFrom), manila(day(i + 2), '06:00'));
    assert.equal(iso(w.readyUntil), manila(day(i + 2), '10:00'));
  });
});

test('post again on several days: the same times of day, all or none', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const token = h.token(seller);
  const first = (await publish(seller, {
    productId: item.id, quantity: 4, ordersOpenAt: manila(day(1), '07:30'), ordersCloseAt: manila(day(1), '11:00'), readyUntil: manila(day(1), '12:00'),
  })).body.data;
  assert.equal((await h.api('POST', `/today/${first.id}/end`, { token })).body.data.status, 'CANCELLED');

  const res = await h.api('POST', `/today/${first.id}/repeat`, { token, body: { dates: [day(3), day(2)], quantity: 9 } });
  assert.equal(res.status, 201, res.body?.message);
  const { windows } = res.body.data;
  assert.equal(windows.length, 2);
  windows.forEach((w, i) => {
    assert.equal(w.quantity, 9);
    assert.equal(iso(w.ordersOpenAt), manila(day(i + 2), '07:30'));
    assert.equal(iso(w.ordersCloseAt), manila(day(i + 2), '11:00'));
    assert.equal(iso(w.readyUntil), manila(day(i + 2), '12:00'));
  });

  // Day 3 is taken now: posting again on days 3 and 4 posts neither.
  const clash = await h.api('POST', `/today/${first.id}/repeat`, { token, body: { dates: [day(4), day(3)] } });
  assert.equal(clash.status, 409);
  assert.equal((await h.prisma.productAvailability.count({ where: { productId: item.id, status: 'SCHEDULED' } })), 2);
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

// ── Editing a post (PATCH /today/:id) ────────────────────────────────────

const edit = (seller, id, body) => h.api('PATCH', `/today/${id}`, { token: h.token(seller), body });

test('edit: a scheduled post changes its kind, cooking time and how many', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const [post] = (await batch(seller, { productId: item.id, quantity: 4, mode: 'READY_NOW', dates: [day(2)], open: '10:00', close: '14:00' })).body.data.windows;

  const res = await edit(seller, post.id, {
    mode: 'MADE_TO_ORDER', prepMinutes: 30, quantity: 9, date: day(2), open: '11:00', close: '15:00', note: 'Fresh',
  });
  assert.equal(res.status, 200, res.body?.message);
  const w = res.body.data;
  assert.equal(w.status, 'SCHEDULED');
  assert.equal(w.mode, 'MADE_TO_ORDER');
  assert.equal(w.prepMinutes, 30);
  assert.equal(w.quantity, 9);
  assert.equal(w.note, 'Fresh');
  assert.equal(iso(w.ordersOpenAt), manila(day(2), '11:00'));
  assert.equal(iso(w.ordersCloseAt), manila(day(2), '15:00'));
  assert.equal(iso(w.readyFrom), manila(day(2), '11:30'), 'ready once cooked');
  assert.equal(iso(w.readyUntil), manila(day(2), '15:00'));

  // And on to "order ahead", ready the next morning.
  const ahead = await edit(seller, post.id, {
    mode: 'PRE_ORDER', prepMinutes: null, close: '15:00', readyFrom: '07:00', readyUntil: '10:00', readyNextDay: true,
  });
  assert.equal(ahead.status, 200, ahead.body?.message);
  assert.equal(ahead.body.data.mode, 'PRE_ORDER');
  assert.equal(ahead.body.data.prepMinutes, null);
  assert.equal(iso(ahead.body.data.readyFrom), manila(day(3), '07:00'));
});

test('edit: a scheduled post moves to another day; a live post with no orders moved later waits again', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const [post] = (await batch(seller, { productId: item.id, quantity: 3, dates: [day(1)], open: '08:00', close: '12:00' })).body.data.windows;

  const moved = await edit(seller, post.id, { date: day(4), open: '09:00', close: '13:00' });
  assert.equal(moved.status, 200, moved.body?.message);
  assert.equal(iso(moved.body.data.ordersOpenAt), manila(day(4), '09:00'));
  assert.equal(iso(moved.body.data.ordersCloseAt), manila(day(4), '13:00'));
  assert.equal((await edit(seller, post.id, { date: day(31), open: '09:00', close: '13:00' })).status, 400);

  const other = await todayItem(store);
  const live = (await publish(seller, { productId: other.id, quantity: 5, ordersCloseAt: at(2 * HOUR) })).body.data;
  assert.equal(await stockOf(other.id), 5);
  const later = await edit(seller, live.id, { date: day(2), open: '10:00', close: '14:00' });
  assert.equal(later.status, 200, later.body?.message);
  assert.equal(later.body.data.status, 'SCHEDULED');
  assert.equal(await stockOf(other.id), 0, 'nothing on sale until its new day');
});

test('edit: the product of a live post with no orders changes, and the stock moves with it', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const first = await todayItem(store);
  const second = await todayItem(store);
  const live = (await publish(seller, { productId: first.id, quantity: 6, ordersCloseAt: at(2 * HOUR) })).body.data;
  assert.equal(await stockOf(first.id), 6);

  const res = await edit(seller, live.id, { productId: second.id, quantity: 8 });
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.status, 'LIVE');
  assert.equal(res.body.data.productId, second.id);
  assert.equal(res.body.data.remaining, 8);
  assert.equal(await stockOf(first.id), 0);
  assert.equal(await stockOf(second.id), 8);

  // Not to a product of another shop, nor a regular one.
  const foreign = await todayItem(await readyShop(await h.user('SELLER')));
  assert.equal((await edit(seller, live.id, { productId: foreign.id })).status, 404);
  assert.equal((await edit(seller, live.id, { productId: (await h.product(store)).id })).status, 400);
});

test('edit: once buyers ordered a post, its product, kind and day stay; how many, times and note can change', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const other = await todayItem(store);
  const live = (await publish(seller, { productId: item.id, quantity: 5, ordersCloseAt: at(2 * HOUR) })).body.data;
  const buyer = await h.user('BUYER');
  assert.equal((await order(buyer, store, [{ productId: item.id, quantity: 2 }])).status, 201);

  const product = await edit(seller, live.id, { productId: other.id });
  assert.equal(product.status, 400);
  assert.match(product.body.message, /already ordered this post, so the item can't change/);
  const kind = await edit(seller, live.id, { mode: 'PRE_ORDER' });
  assert.equal(kind.status, 400);
  assert.match(kind.body.message, /kind can't change/);
  assert.equal((await edit(seller, live.id, { date: day(2), open: '10:00', close: '14:00' })).status, 400);
  assert.equal((await edit(seller, live.id, { quantity: 1 })).status, 400, 'not below what was ordered');
  assert.equal(await stockOf(item.id), 3, 'nothing changed');

  const close = new Date(Date.now() + 3 * HOUR + 8 * HOUR).toISOString().slice(11, 16); // Manila clock, 3h from now
  const ok = await edit(seller, live.id, { quantity: 7, close, note: 'Last batch' });
  assert.equal(ok.status, 200, ok.body?.message);
  assert.equal(ok.body.data.quantity, 7);
  assert.equal(ok.body.data.remaining, 5, '7 less the 2 ordered');
  assert.equal(await stockOf(item.id), 5);
  assert.equal(iso(ok.body.data.ordersOpenAt), iso(live.ordersOpenAt), 'orders opened when they did');
  assert.equal(ok.body.data.note, 'Last batch');
  assert.equal((await edit(seller, live.id, { ordersCloseAt: at(-HOUR) })).status, 400, 'not closed in the past');
});

test('edit: an overlap on the new product or the new day stops the change', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await todayItem(store);
  const other = await todayItem(store);
  const [post] = (await batch(seller, { productId: item.id, quantity: 3, dates: [day(1)], open: '10:00', close: '14:00' })).body.data.windows;
  await batch(seller, { productId: other.id, quantity: 3, dates: [day(1)], open: '12:00', close: '16:00' });
  await batch(seller, { productId: item.id, quantity: 3, dates: [day(3)], open: '09:00', close: '18:00' });

  const product = await edit(seller, post.id, { productId: other.id });
  assert.equal(product.status, 409);
  assert.match(product.body.message, /already has a post at that time/);
  const sameDay = await edit(seller, post.id, { date: day(3), open: '10:00', close: '14:00' });
  assert.equal(sameDay.status, 409);
  const after = await h.prisma.productAvailability.findUnique({ where: { id: post.id } });
  assert.equal(after.productId, item.id);
  assert.equal(iso(after.ordersOpenAt), manila(day(1), '10:00'));
});
