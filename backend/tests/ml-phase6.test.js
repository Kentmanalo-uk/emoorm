const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const settings = require('../src/ml/settings');
const categories = require('../src/ml/categories');
const why = require('../src/ml/why');

/*
 * Moormy blueprint phase 6, built on the ML engine: category suggestions for
 * a new listing (module 11) and "why" lines on recommendations. The switch is
 * stubbed in this process only (the settings row is shared with other files).
 */
const on = new Set();
const realIsOn = settings.isOn;
settings.isOn = async (key) => (key ? on.has(key) : on.size > 0);

after(async () => {
  settings.isOn = realIsOn;
  await h.cleanup();
});

// A made-up site: enough listings to learn from, in four categories.
const catalogue = () => {
  const rows = [];
  const add = (categoryId, names, description) => names.forEach((name, i) => rows.push({
    id: `${categoryId}-${i}`, categoryId, name, description,
  }));
  add('seafood', ['Fresh Tilapia', 'Bangus Milkfish', 'Tilapia 1kg', 'Shrimp Hipon', 'Squid Pusit', 'Fresh Galunggong', 'Lapu-lapu Fish', 'Tahong Mussels'], 'Caught this morning, cleaned on request.');
  add('crafts', ['Woven Bag', 'Buri Hat', 'Rattan Basket', 'Hand-woven Mat', 'Bamboo Fan', 'Woven Placemat', 'Abaca Tote Bag', 'Native Bag'], 'Hand-woven by local weavers.');
  add('drinks', ['Calamansi Juice', 'Buko Juice', 'Mango Shake', 'Ginger Tea Salabat', 'Tablea Chocolate Drink', 'Lemongrass Tea', 'Pineapple Juice', 'Coffee Barako'], 'A cold drink, best served chilled.');
  add('sweets', ['Ube Halaya', 'Bibingka', 'Suman sa Lihiya', 'Kutsinta', 'Puto Cheese', 'Sapin-sapin', 'Leche Flan', 'Biko'], 'Kakanin made fresh every morning.');
  return rows;
};
const learned = categories.learnFrom(catalogue());
const best = (name, description) => categories.rank(learned, categories.weightsOf(name, description));

test('category suggestions: learned from the listings already in each category', () => {
  assert.equal(best('Tilapia fresh catch')[0]?.id, 'seafood');
  assert.equal(best('Woven rattan bag')[0]?.id, 'crafts');
  assert.equal(best('Calamansi juice 1 liter')[0]?.id, 'drinks');
  assert.equal(best('Kakanin bilao', 'Assorted puto and kutsinta')[0]?.id, 'sweets');
  const top = best('Fresh tilapia')[0];
  assert.ok(top.confidence > 0.5 && top.confidence <= 1);
  assert.ok(top.listings >= 2);
});

test('category suggestions: nothing rather than a guess', () => {
  // No word the site knows.
  assert.deepEqual(best('xyzzy qwerty'), []);
  // Only a describing word known ("native"), the thing itself ("chicken") never listed.
  assert.deepEqual(best('Native chicken'), []);
  assert.deepEqual(best(''), []);
  // Copies of one listing are one piece of evidence: four "Native Bag"s in a
  // made-up category do not outvote the rest.
  const copies = categories.learnFrom([
    ...catalogue(),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `copy-${i}`, categoryId: 'veg', name: 'Native Tomatoes', description: '' })),
  ]);
  const r = categories.rank(copies, categories.weightsOf('Native tomatoes'));
  assert.ok(!r.some((c) => c.id === 'veg'), 'one listing name, even copied, is not a pattern');
  // Too few listings on the whole site: nothing to learn from yet.
  assert.deepEqual(categories.rank(categories.learnFrom(catalogue().slice(0, 10)), categories.weightsOf('Tilapia')), []);
});

test('category suggestions over the API: sellers only, empty while the module is off', async () => {
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const url = '/ml/categories/suggest?name=Fresh%20tilapia';
  assert.equal((await h.api('GET', url)).status, 401);
  assert.equal((await h.api('GET', url, { token: h.token(buyer) })).status, 403);
  const off = await h.api('GET', url, { token: h.token(seller) });
  assert.equal(off.status, 200);
  assert.deepEqual(off.body.data, { suggestions: [], source: 'none' });
  on.add('categories');
  const res = await h.api('GET', url, { token: h.token(seller) });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.suggestions));
  for (const s of res.body.data.suggestions) assert.ok(s.id && s.name && s.confidence > 0);
  assert.deepEqual((await h.api('GET', '/ml/categories/suggest?name=', { token: h.token(seller) })).body.data.suggestions, []);
  on.delete('categories');
});

test('why lines: short, true reasons from the two cards', () => {
  const source = {
    name: 'Wild Honey 500ml', price: 300, salePrice: null, categoryId: 'c1', municipalityId: 'm1',
  };
  const card = (extra) => ({
    name: 'Honey', price: 300, categoryId: 'c1', category: { id: 'c1', name: 'Processed Foods' }, municipalityId: 'm2', municipality: { id: 'm2', name: 'Naujan' }, ...extra,
  });
  assert.deepEqual(why.similarWhy(source, card({ name: 'Raw Honey Jar' })), ['Also honey', 'Similar price']);
  assert.deepEqual(why.similarWhy(source, card({ name: 'Coco Jam', price: 150 })), ['Also in Processed Foods', 'Lower price']);
  // A sale price counts as the price.
  assert.deepEqual(why.similarWhy(source, card({ name: 'Coco Jam', price: 400, salePrice: 200 })), ['Also in Processed Foods', 'Lower price']);
  // Describing words and sizes are not reasons; the town is, when there is room.
  assert.deepEqual(why.similarWhy(source, card({
    name: 'Wild Tea 500ml', categoryId: 'c9', category: { id: 'c9', name: 'Drinks' }, price: 2000, municipalityId: 'm1', municipality: { id: 'm1', name: 'Calapan City' },
  })), ['Also from Calapan City']);
  assert.ok(why.similarWhy(source, card({ name: 'Honey' })).length <= 2);
});

test('why lines come with the similar items answer', async () => {
  const seller = await h.user('SELLER');
  const shop = await h.shop(seller);
  const a = await h.product(shop, { name: `Calamansi Juice ${h.RUN}`, price: 100 });
  await h.product(shop, { name: `Calamansi Concentrate ${h.RUN}`, price: 80 });
  const res = await h.api('GET', `/ml/recommendations/similar/${a.id}?limit=6`);
  assert.equal(res.status, 200);
  for (const p of res.body.data.products) {
    assert.ok(Array.isArray(p.why), 'each similar product says why');
    assert.ok(p.why.length <= 2);
  }
});
