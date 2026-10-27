const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const orderRepository = require('../src/repositories/order.repository');
const productRepository = require('../src/repositories/product.repository');
const reviewRepository = require('../src/repositories/review.repository');
const storeRepository = require('../src/repositories/store.repository');
const stats = require('../src/repositories/productStats.repository');

after(() => h.cleanup());

const row = (id) => h.prisma.product.findUnique({ where: { id }, select: { soldCount: true, ratingAvg: true, reviewCount: true } });

test('an order handed over adds to its products\' sold counts; one still open does not', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const open = await h.order(buyer, store, [{ product: item, quantity: 5 }], { status: 'CONFIRMED' });
  const ready = await h.order(buyer, store, [{ product: item, quantity: 3 }], { status: 'READY_FOR_PICKUP' });
  await orderRepository.updateStatus(open.id, 'READY_FOR_PICKUP', 'CONFIRMED');
  assert.equal((await row(item.id)).soldCount, 0, 'not handed over yet');
  await orderRepository.updateStatus(ready.id, 'PICKED_UP', 'READY_FOR_PICKUP');
  assert.equal((await row(item.id)).soldCount, 3);
  await orderRepository.updateStatus(ready.id, 'COMPLETED', 'PICKED_UP');
  assert.equal((await row(item.id)).soldCount, 3, 'completing a picked-up order counts it once');

  // Lists and the product page read it from the row, under the old names.
  const found = await productRepository.findById(item.id);
  assert.equal(found.soldCount, 3);
  assert.equal('ratingAvg' in found, false);
  assert.equal('searchText' in found, false, 'the search column is never read out');
});

test('a review written, edited or removed moves the product\'s rating', async () => {
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const one = await reviewRepository.createReview({ userId: (await h.user('BUYER')).id, productId: item.id, rating: 5 });
  await reviewRepository.createReview({ userId: (await h.user('BUYER')).id, productId: item.id, rating: 2 });
  assert.deepEqual(await row(item.id), { soldCount: 0, ratingAvg: 3.5, reviewCount: 2 });
  await reviewRepository.updateReview(one.id, { rating: 4 });
  assert.equal((await row(item.id)).ratingAvg, 3);
  await reviewRepository.softDeleteReview(one.id);
  assert.deepEqual(await row(item.id), { soldCount: 0, ratingAvg: 2, reviewCount: 1 });
  const [listed] = (await productRepository.findAll({ storeId: store.id })).products;
  assert.equal(listed.averageRating, 2);
  assert.equal(listed.reviewCount, 1);
});

test('search finds a product by its shop\'s new name, and by its category', async () => {
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const word = `zorvex${h.RUN}`;
  await storeRepository.updateStore(store.id, { name: `The ${word} Stall` });
  const byShop = await productRepository.findAll({ storeId: store.id, search: word, noCorrection: true });
  assert.deepEqual(byShop.products.map((p) => p.id), [item.id]);
  const { category } = await h.reference();
  const byCategory = await productRepository.findAll({ storeId: store.id, search: category.name, noCorrection: true });
  assert.deepEqual(byCategory.products.map((p) => p.id), [item.id]);
  // Words in no field find nothing.
  assert.equal((await productRepository.findAll({ storeId: store.id, search: `nothing${h.RUN}`, noCorrection: true })).total, 0);
});

test('"top sales" sorts by units handed over', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const low = await h.product(store);
  const high = await h.product(store);
  const none = await h.product(store);
  await h.order(buyer, store, [{ product: low, quantity: 1 }, { product: high, quantity: 6 }], { status: 'COMPLETED' });
  await stats.refreshStats([low.id, high.id]);
  const sorted = await productRepository.findAll({ storeId: store.id, sortBy: 'orderCount', sortOrder: 'desc' });
  assert.deepEqual(sorted.products.map((p) => p.id), [high.id, low.id, none.id]);
});

test('the hourly check puts right a figure another path left wrong', async () => {
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  await h.prisma.$executeRaw`UPDATE products SET sold_count = 99, search_text = 'stale' WHERE id = ${item.id}`;
  const fixed = await stats.reconcileAll();
  assert.ok(fixed.figures >= 1 && fixed.search >= 1);
  assert.equal((await row(item.id)).soldCount, 0);
  const [{ text }] = await h.prisma.$queryRaw`SELECT search_text AS text FROM products WHERE id = ${item.id}`;
  assert.match(text, new RegExp(store.name));
});
