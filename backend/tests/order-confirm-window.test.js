// How long a new order waits for its shop before it cancels itself.
//
// Two days unless a super admin says otherwise, and the sweep that frees the
// stock must follow whatever they set -- which is the whole point of moving
// the number out of the environment. The tests that matter here are the last
// two: that an order one side of the line is cancelled and one the other side
// is left alone, measured against a window that was changed at run time.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const appSettingService = require('../src/services/appSetting.service');
const orderService = require('../src/services/order.service');
const { windowLabel } = require('../src/utils/orderWindow');

// Every test here changes a global setting, so it is put back afterwards.
after(async () => {
  await appSettingService.update({ orderConfirmHours: 48 }).catch(() => {});
  await h.cleanup();
});

const setWindow = (hours) => appSettingService.update({ orderConfirmHours: hours });

/** A new order of this shop, placed `hoursAgo` hours ago. */
async function pendingOrder(buyer, store, product, hoursAgo) {
  const order = await h.order(buyer, store, [{ product }], { status: 'PENDING', paymentStatus: 'PENDING' });
  // The backdated row, not the one just made: the deadline is counted from
  // when the order was placed, so a test comparing against it needs the
  // moment the database now holds.
  return h.prisma.order.update({
    where: { id: order.id },
    data: { createdAt: new Date(Date.now() - hoursAgo * 3600 * 1000) },
  });
}

const statusOf = async (id) => (await h.prisma.order.findUnique({ where: { id }, select: { status: true } }))?.status;

test('a window of hours is said in the words a person would use', () => {
  // The reason this exists: "cancelled after 48 hours" makes a buyer count.
  assert.equal(windowLabel(48), '2 days');
  assert.equal(windowLabel(24), '1 day');
  assert.equal(windowLabel(168), '7 days');
  // Not a whole number of days, so hours it is.
  assert.equal(windowLabel(36), '36 hours');
  assert.equal(windowLabel(1), '1 hour');
});

test('two days unless a super admin changes it', async () => {
  await setWindow(48);
  assert.equal(await appSettingService.getOrderConfirmHours(), 48);

  const admin = await h.user('SUPER_ADMIN');
  const changed = await h.api('PUT', '/app-settings', {
    token: h.token(admin),
    body: { orderConfirmHours: 72 },
  });
  assert.equal(changed.status, 200);
  assert.equal(await appSettingService.getOrderConfirmHours(), 72, 'the change is in force at once');
});

test('only a super admin may change it, and only to something sensible', async () => {
  await setWindow(48);
  const seller = await h.user('SELLER');

  const theirs = await h.api('PUT', '/app-settings', {
    token: h.token(seller),
    body: { orderConfirmHours: 1 },
  });
  assert.equal(theirs.status, 403, 'a seller cannot set the rule for everyone');

  const admin = await h.user('SUPER_ADMIN');
  for (const bad of [0, -5, 24 * 15, 2.5, 'two days']) {
    const res = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { orderConfirmHours: bad } });
    assert.equal(res.status, 400, `${JSON.stringify(bad)} is refused`);
  }
  assert.equal(await appSettingService.getOrderConfirmHours(), 48, 'nothing bad got through');
});

test('the sweep cancels by the window in force, not by a constant', async () => {
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const store = await h.shop(seller);
  const product = await h.product(store);

  // Placed 30 hours ago: inside two days, so it stands.
  await setWindow(48);
  const order = await pendingOrder(buyer, store, product, 30);
  await orderService.expirePendingOrders();
  assert.equal(await statusOf(order.id), 'PENDING', 'two days has not passed');

  // The super admin shortens the window to one day. The same order is now
  // past it, and the next sweep cancels it.
  await setWindow(24);
  await orderService.expirePendingOrders();
  assert.equal(await statusOf(order.id), 'CANCELLED', 'one day has passed');
});

test('a longer window keeps an order a shorter one would have cancelled', async () => {
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const store = await h.shop(seller);
  const product = await h.product(store);

  // Placed three days ago, with the window set to a week.
  await setWindow(24 * 7);
  const order = await pendingOrder(buyer, store, product, 72);
  await orderService.expirePendingOrders();
  assert.equal(await statusOf(order.id), 'PENDING', 'a week has not passed');

  // And the countdown the apps show agrees with the rule.
  const seen = await h.api('GET', '/orders/my/orders', { token: h.token(buyer) });
  const mine = (seen.body.data || []).find((o) => o.id === order.id);
  assert.ok(mine, 'the buyer can see the order');
  assert.equal(mine.deadline?.kind, 'confirm');
  const days = (new Date(mine.deadline.at) - new Date(order.createdAt)) / 86400000;
  assert.ok(Math.abs(days - 7) < 0.01, `the countdown runs a week, not two days (got ${days})`);
});
