const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

// A shop that takes pickup orders paid in cash.
const readyShop = async (seller) => {
  const store = await h.shop(seller);
  return h.prisma.store.update({ where: { id: store.id }, data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Market stall 4', acceptsCod: true } });
};

const pickupOrder = (store, item) => ({
  storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567',
  items: [{ productId: item.id, quantity: 1 }],
});

test('the seller sets hours, preparation days and away mode, checked', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const token = h.token(seller);
  const bad = await h.api('PUT', `/stores/${store.id}`, { token, body: { openingHours: { mon: [['17:00', '08:00']] } } });
  assert.equal(bad.status, 400);
  assert.equal((await h.api('PUT', `/stores/${store.id}`, { token, body: { prepDays: 99 } })).status, 400);
  const ok = await h.api('PUT', `/stores/${store.id}`, {
    token,
    body: { openingHours: { mon: [['08:00', '17:00']], sun: [] }, prepDays: 2, vacationUntil: h.daysAgo(-5).toISOString(), vacationNote: 'Harvest week' },
  });
  assert.equal(ok.status, 200);
  const saved = await h.prisma.store.findUnique({ where: { id: store.id }, select: { openingHours: true, prepDays: true, vacationUntil: true, vacationNote: true } });
  assert.deepEqual(saved.openingHours, { mon: [['08:00', '17:00']], sun: [] });
  assert.equal(saved.prepDays, 2);
  assert.equal(saved.vacationNote, 'Harvest week');
  assert.ok(saved.vacationUntil > new Date());
});

test('an away shop shows its date on the product page and refuses orders until then', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  await h.prisma.store.update({ where: { id: store.id }, data: { vacationUntil: h.daysAgo(-3) } });
  const page = await h.api('GET', `/products/${item.id}`);
  assert.ok(page.body.data.store.vacationUntil);
  const refused = await h.api('POST', '/orders', { token: h.token(buyer), body: pickupOrder(store, item) });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /away until/);
  // Back: ending away mode lets orders through again.
  await h.api('PUT', `/stores/${store.id}`, { token: h.token(seller), body: { vacationUntil: null } });
  const placed = await h.api('POST', '/orders', { token: h.token(buyer), body: pickupOrder(store, item) });
  assert.equal(placed.status, 201, placed.body?.message);
});

test('a new order carries when to expect it, from the shop\'s preparation days', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  await h.prisma.store.update({ where: { id: store.id }, data: { prepDays: 3, openingHours: null } });
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const placed = await h.api('POST', '/orders', { token: h.token(buyer), body: pickupOrder(store, item) });
  assert.equal(placed.status, 201);
  const { etaFrom, etaTo } = await h.prisma.order.findUnique({ where: { id: placed.body.data.id }, select: { etaFrom: true, etaTo: true } });
  const days = Math.round((etaFrom - Date.now()) / 86400e3);
  assert.ok(days >= 2 && days <= 3, `ready in ${days} days`);
  assert.equal(etaFrom.getTime(), etaTo.getTime());
  const mine = await h.api('GET', '/orders/my/orders', { token: h.token(buyer) });
  assert.ok(mine.body.data.find((o) => o.id === placed.body.data.id).etaFrom);
});

test('shop pictures and colours are checked; a shop being deleted stays hidden', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const token = h.token(seller);
  const put = (body) => h.api('PUT', `/stores/${store.id}`, { token, body });
  assert.equal((await put({ logo: 'https://tracker.example/pixel.gif' })).status, 400);
  assert.equal((await put({ paymentQrImage: '/uploads/../secret.png' })).status, 400);
  assert.equal((await put({ primaryColor: 'red; background:url(x)' })).status, 400);
  assert.equal((await put({ logo: '/uploads/ci-logo.webp', primaryColor: '#1a7f37', secondaryColor: null })).status, 200);
  assert.equal((await put({ coverImage: '' })).status, 200);

  await h.prisma.store.update({ where: { id: store.id }, data: { isActive: false, deletionRequestedAt: new Date() } });
  assert.equal((await put({ isActive: true })).status, 200);
  const saved = await h.prisma.store.findUnique({ where: { id: store.id }, select: { logo: true, primaryColor: true, coverImage: true, isActive: true } });
  assert.deepEqual(saved, { logo: '/uploads/ci-logo.webp', primaryColor: '#1a7f37', coverImage: null, isActive: false });
});
