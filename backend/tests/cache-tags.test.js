const { test } = require('node:test');
const assert = require('node:assert/strict');
// First: it blanks the Redis settings before the cache loads.
const h = require('./helpers');
const cache = require('../src/lib/cache');
const { cached, invalidate, TAGS, productTagsOf } = require('../src/lib/cachePolicy');

// The lists below are keyed by a stamp so they never meet another test's.
const stamp = `${Date.now()}-${Math.random()}`;
const product = (id) => ({ id, slug: `p-${id}`, price: 10, store: { id: 's1', slug: 'shop' } });

test('a cached answer is tagged with the products it holds', () => {
  const tags = productTagsOf({ products: [product('a'), product('b')], pagination: { page: 1 } });
  assert.deepEqual(tags.sort(), [TAGS.product('a'), TAGS.product('b')]);
  // The shop inside a product (id + slug, no price or images) is not a product.
  assert.equal(productTagsOf(product('c')).length, 1);
  assert.deepEqual(productTagsOf({ items: [] }), []);
});

test('a stock change clears only the lists holding that product', async () => {
  let loads = 0;
  const load = (ids) => async () => { loads += 1; return { products: ids.map(product) }; };
  const withA = { q: `a-${stamp}` };
  const withoutA = { q: `b-${stamp}` };
  await cached.productList(withA, load(['a1', 'a2']));
  await cached.productList(withoutA, load(['b1']));
  assert.equal(loads, 2);
  // Served from the cache now.
  await cached.productList(withA, load(['a1', 'a2']));
  await cached.productList(withoutA, load(['b1']));
  assert.equal(loads, 2);

  // What invalidateProductIds sends for a1 (its own tags, not the catalogue's).
  await invalidate([TAGS.product('a1'), TAGS.product('p-a1'), TAGS.store('s1')]);
  await cached.productList(withA, load(['a1', 'a2']));
  assert.equal(loads, 3, 'the list with a1 reloads');
  await cached.productList(withoutA, load(['b1']));
  assert.equal(loads, 3, 'the other list is still cached');

  // A seller's edit still clears every list.
  await invalidate([TAGS.products]);
  await cached.productList(withoutA, load(['b1']));
  assert.equal(loads, 4);
});

test('repository stock invalidation sends no catalogue-wide tag', async () => {
  const sent = [];
  const original = cache.invalidateTags;
  cache.invalidateTags = async (tags) => { sent.push(...tags); return 0; };
  try {
    const seller = await h.user('SELLER');
    const store = await h.shop(seller);
    const item = await h.product(store);
    await require('../src/repositories/product.repository').invalidateProductIds([item.id]);
    assert.ok(sent.includes(TAGS.product(item.id)));
    assert.ok(sent.includes(TAGS.store(store.id)));
    assert.ok(sent.includes(TAGS.store(store.slug)));
    assert.equal(sent.includes(TAGS.products), false);
    assert.equal(sent.includes(TAGS.stores), false);
  } finally {
    cache.invalidateTags = original;
    await h.cleanup();
  }
});
