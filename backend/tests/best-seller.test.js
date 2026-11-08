// Best seller: the product a shop has sold the most of carries
// storeBestSeller in lists and on its page; ties all count; a shop that has
// sold nothing has none.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const prisma = require('../src/config/database');
const { clearBestSellerCache } = require('../src/services/bestSeller.service');

after(() => h.cleanup());

async function shopWithSales(counts) {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const items = [];
  for (const sold of counts) {
    const item = await h.product(store);
    await prisma.product.update({ where: { id: item.id }, data: { soldCount: sold } });
    items.push(item);
  }
  return { store, items };
}

const flagsIn = async (store) => {
  clearBestSellerCache();
  const res = await h.api('GET', `/products?storeId=${store.id}&pageSize=50`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return new Map(res.body.data.map((p) => [p.id, p.storeBestSeller]));
};

test("a shop's most sold product is its best seller, and only that one", async () => {
  const { store, items: [top, mid, none] } = await shopWithSales([7, 3, 0]);
  const flags = await flagsIn(store);
  assert.equal(flags.get(top.id), true);
  assert.equal(flags.get(mid.id), false);
  assert.equal(flags.get(none.id), false);

  // The product page says so too.
  const page = await h.api('GET', `/products/${top.id}`);
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.equal(page.body.data.storeBestSeller, true);
});

test('a tie marks each of the top products', async () => {
  const { store, items: [a, b, c] } = await shopWithSales([4, 4, 1]);
  const flags = await flagsIn(store);
  assert.equal(flags.get(a.id), true);
  assert.equal(flags.get(b.id), true);
  assert.equal(flags.get(c.id), false);
});

test('a shop that has sold nothing has no best seller', async () => {
  const { store, items } = await shopWithSales([0, 0]);
  const flags = await flagsIn(store);
  for (const item of items) assert.equal(flags.get(item.id), false);
});
