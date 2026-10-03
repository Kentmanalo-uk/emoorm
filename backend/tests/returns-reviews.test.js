const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { returnWindowDays } = require('../src/utils/returnPolicy');

after(h.cleanup);

test('return windows come from the product policy', () => {
  assert.equal(returnWindowDays('No returns or refunds accepted unless the item is incorrect or damaged on arrival.'), 3);
  assert.equal(returnWindowDays('For perishable goods, report incorrect or damaged items on delivery with photo proof.'), 2);
  assert.equal(returnWindowDays('Returns within 14 days for any reason.'), 14);
  assert.equal(returnWindowDays({ text: 'Anything', days: 5 }), 5);
  assert.equal(returnWindowDays(null), 7);
});

test('a "No returns" item cannot be returned after 3 days', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item, snapshot: { text: 'No returns or refunds accepted unless the item is incorrect or damaged on arrival.', days: 3 } }], { status: 'COMPLETED', completedAt: h.daysAgo(5) });
  const res = await h.api('POST', '/returns', { token: h.token(buyer), body: { orderId: o.id, reason: 'DAMAGED', items: [{ orderItemId: o.items[0].id, quantity: 1 }] } });
  assert.equal(res.status, 400);
});

test('two return requests at once cannot return more than was bought', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const o = await h.order(buyer, store, [{ product: item, quantity: 1 }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const body = { orderId: o.id, reason: 'OTHER', items: [{ orderItemId: o.items[0].id, quantity: 1 }] };
  const results = await Promise.all([1, 2].map(() => h.api('POST', '/returns', { token: h.token(buyer), body })));
  assert.equal(results.filter((r) => r.status === 201 || r.status === 200).length, 1);
});

test('a double-tapped review is saved once', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const send = () => {
    const fd = new FormData();
    fd.append('productId', item.id);
    fd.append('rating', '5');
    fd.append('comment', 'Great');
    return h.startApp().then((base) => fetch(`${base}/reviews`, { method: 'POST', headers: { Authorization: `Bearer ${h.token(buyer)}` }, body: fd }));
  };
  await Promise.all([send(), send()]);
  const count = await h.prisma.review.count({ where: { userId: buyer.id, productId: item.id, deletedAt: null } });
  assert.equal(count, 1);
});
