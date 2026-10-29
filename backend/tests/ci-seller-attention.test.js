const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const countOf = (items, key) => items.find((item) => item.key === key)?.count;

// The Seller Center's badges and "Needs your action" row come from one
// request (GET /stores/my/attention): payments to check, orders to pack,
// unanswered questions and recent reviews without a reply, besides the
// older queues.
test('seller attention counts payments, packing, questions and reviews', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');

  // Payments to check: a proof waiting (open order). A cancelled one isn't.
  await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED', paymentMethod: 'GCASH', paymentStatus: 'PENDING_VERIFICATION' });
  await h.order(buyer, store, [{ product: item }], { status: 'CANCELLED', paymentMethod: 'GCASH', paymentStatus: 'PENDING_VERIFICATION' });
  // To pack: confirmed cash on delivery, and one already being packed. A
  // confirmed QR order still unpaid is not packed yet.
  await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED', paymentMethod: 'COD' });
  await h.order(buyer, store, [{ product: item }], { status: 'TO_SHIP', paymentMethod: 'COD' });
  await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED', paymentMethod: 'QRPH', paymentStatus: 'PENDING' });

  // Questions: one open, one answered, one hidden.
  await h.prisma.productQuestion.createMany({
    data: [
      { productId: item.id, storeId: store.id, askerId: buyer.id, question: 'ci: available?' },
      { productId: item.id, storeId: store.id, askerId: buyer.id, question: 'ci: fresh?', answer: 'Yes', answeredAt: new Date() },
      { productId: item.id, storeId: store.id, askerId: buyer.id, question: 'ci: spam', isHidden: true },
    ],
  });
  // Reviews: a new one to reply to, one replied, and one from long ago.
  await h.prisma.review.createMany({
    data: [
      { userId: buyer.id, productId: item.id, rating: 5, comment: 'ci new' },
      { userId: buyer.id, productId: item.id, rating: 4, comment: 'ci replied', sellerReply: 'Salamat po', sellerRepliedAt: new Date() },
      { userId: buyer.id, productId: item.id, rating: 3, comment: 'ci old', createdAt: h.daysAgo(60) },
    ],
  });

  const res = await h.api('GET', '/stores/my/attention', { token: h.token(seller) });
  assert.equal(res.status, 200, res.body?.message);
  const items = res.body.data;
  assert.equal(countOf(items, 'paymentsToCheck'), 1);
  assert.equal(countOf(items, 'ordersToPack'), 2);
  assert.equal(countOf(items, 'unansweredQuestions'), 1);
  assert.equal(countOf(items, 'unrepliedReviews'), 1);
  // Each queue has its own link, so badges keyed by link never merge two.
  const links = items.map((entry) => entry.link);
  assert.equal(new Set(links).size, links.length);
  assert.equal(items.find((entry) => entry.key === 'paymentsToCheck').link, '/seller/orders?status=payment');
  assert.equal(items.find((entry) => entry.key === 'unansweredQuestions').link, '/seller/questions');
});

test('a seller without a shop gets every queue, empty', async () => {
  const seller = await h.user('SELLER');
  const res = await h.api('GET', '/stores/my/attention', { token: h.token(seller) });
  assert.equal(res.status, 200, res.body?.message);
  for (const key of ['paymentsToCheck', 'ordersToPack', 'unansweredQuestions', 'unrepliedReviews']) {
    assert.equal(countOf(res.body.data, key), 0, key);
  }
});

// The Orders page searches by order number, the buyer's name or a product.
test('a shop searches its orders by buyer and product name', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const fish = await h.product(store, { name: `Ci Tilapia ${h.RUN}` });
  const rice = await h.product(store, { name: `Ci Dinorado ${h.RUN}` });
  const ana = await h.user('BUYER', { fullName: `Ci Anabelle ${h.RUN}` });
  const ben = await h.user('BUYER');
  const forAna = await h.order(ana, store, [{ product: rice }]);
  const forBen = await h.order(ben, store, [{ product: fish }]);
  // Another shop's order for the same buyer stays out of this shop's list.
  const otherSeller = await h.user('SELLER');
  const otherStore = await h.shop(otherSeller);
  const otherItem = await h.product(otherStore);
  await h.order(ana, otherStore, [{ product: otherItem }]);

  const search = async (q) => {
    const res = await h.api('GET', `/orders/store/orders?search=${encodeURIComponent(q)}`, { token: h.token(seller) });
    assert.equal(res.status, 200, res.body?.message);
    return res.body.data.map((o) => o.id).sort();
  };
  assert.deepEqual(await search(`Anabelle ${h.RUN}`), [forAna.id]);
  assert.deepEqual(await search(`Tilapia ${h.RUN}`), [forBen.id]);
  assert.deepEqual(await search(forBen.orderNumber), [forBen.id]);
  assert.deepEqual(await search(`nothing-${h.RUN}`), []);

  // Buyers still look their own orders up by number only.
  const mine = await h.api('GET', `/orders/my/orders?search=${encodeURIComponent(`Dinorado ${h.RUN}`)}`, { token: h.token(ana) });
  assert.equal(mine.status, 200, mine.body?.message);
  assert.equal(mine.body.data.length, 0);
});

// Offers are for livestock: the shop says whether it sells animals.
test('my store says whether the shop sells livestock', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.product(store);
  const before = await h.api('GET', '/stores/my/store', { token: h.token(seller) });
  assert.equal(before.status, 200, before.body?.message);
  assert.equal(before.body.data.sellsLivestock, false);

  await h.product(store, { productType: 'LIVESTOCK' });
  const after = await h.api('GET', '/stores/my/store', { token: h.token(seller) });
  assert.equal(after.body.data.sellsLivestock, true);
});
