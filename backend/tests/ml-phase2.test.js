const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const settings = require('../src/ml/settings');
const runner = require('../src/ml/runner');
const text = require('../src/ml/text');
const recommendations = require('../src/ml/recommendations');
const bundles = require('../src/ml/bundles');
const search = require('../src/ml/search');

/*
 * Phase 2: similar products, trending, For You, bought together, semantic
 * search. The modules are switched on in this process only (the settings row
 * is shared with the other test files running alongside).
 */
const on = new Set();
const realIsOn = settings.isOn;
settings.isOn = async (key) => (key ? on.has(key) : on.size > 0);
const started = new Date();
const tag = `qz${h.RUN}`;

let seller;
let shop;
let A; let B; let C; let D; let E;
before(async () => {
  seller = await h.user('SELLER');
  shop = await h.shop(seller);
  A = await h.product(shop, { name: `Mango Jam ${tag}`, description: 'Sweet preserve made from ripe carabao mangoes.', price: 150 });
  B = await h.product(shop, { name: `Mangga Preserves ${tag}`, description: 'Fruit preserve of ripe mangga, in a jar.', price: 140 });
  C = await h.product(shop, { name: `Dried Fish ${tag}`, description: 'Salted dried fish from the coast.', price: 300 });
  D = await h.product(shop, { name: `Ube Halaya ${tag}`, description: 'Purple yam spread, a Mindoro favourite.', price: 120 });
  E = await h.product(shop, { name: `Coco Vinegar ${tag}`, description: 'Native coconut vinegar.', price: 90 });
  search.forget();
});

after(async () => {
  settings.isOn = realIsOn;
  const keys = ['recommendations', 'bundles', 'search'];
  await h.prisma.mlPrediction.deleteMany({ where: { modelKey: { in: keys }, generatedAt: { gte: started } } });
  await h.prisma.mlModelVersion.deleteMany({ where: { modelKey: { in: keys }, trainedAt: { gte: started } } });
  await h.prisma.mlTrainingRun.deleteMany({ where: { modelKey: { in: keys }, startedAt: { gte: started } } });
  await h.prisma.productView.deleteMany({ where: { productId: { in: [A, B, C, D, E].map((p) => p.id) } } });
  await h.cleanup();
});

test('words: one spelling for synonyms and plurals; a query also means what its words suggest', () => {
  assert.deepEqual(text.tokens('Mangoes and MANGGA, the jars'), ['mangga', 'mangga', 'jar']);
  const q = text.readQuery('affordable local pasalubong');
  assert.equal(q.cheap, true);
  assert.equal(q.weights.get('pasalubong'), 1);
  assert.equal(q.weights.get('gift'), 0.5);
  assert.ok(!q.weights.has('local'), '"local" says nothing here when other words do');
  assert.ok(!q.weights.has('affordable'));
});

test('similar products: by their words first, then category, price and town; a few per shop at most', () => {
  const p = (id, name, extra = {}) => ({
    id, name, description: '', categoryId: 'c1', storeId: 's1', municipalityId: 'm1', price: 100, ...extra,
  });
  const catalog = [
    p('jam', 'Mango Jam', { description: 'sweet ripe mango preserve' }),
    p('pres', 'Mangga Preserves', { description: 'ripe mangga preserve in a jar' }),
    p('fish', 'Dried Fish', { description: 'salted dried fish' }),
    p('chips', 'Banana Chips', { categoryId: 'c2', storeId: 's2', price: 400 }),
  ];
  const { lists } = recommendations.similarLists(catalog);
  assert.equal(lists.get('jam')[0][0], 'pres');
  assert.ok(lists.get('jam').findIndex(([id]) => id === 'pres') < lists.get('jam').findIndex(([id]) => id === 'fish'));
  // Another category, far price, no shared words: not similar at all.
  assert.ok(!lists.get('jam').some(([id]) => id === 'chips'));
  assert.equal(recommendations.priceCloseness(100, 100), 1);
  assert.equal(recommendations.priceCloseness(100, 400), 0);

  // At most 4 from one shop.
  const many = Array.from({ length: 8 }, (_, i) => p(`x${i}`, `Mango Jam Jar ${i}`, { storeId: 'one' }));
  const capped = recommendations.similarLists([p('seed', 'Mango Jam', { storeId: 'two' }), ...many]).lists.get('seed');
  assert.equal(capped.length, 4);
});

test('bought together: support, confidence and lift from baskets, nothing below the minimums', () => {
  const baskets = [
    new Set(['a', 'b']), new Set(['a', 'b']), new Set(['a', 'c']), new Set(['d']), new Set(['e']),
  ];
  const { rules, pairs } = bundles.mine(baskets, { ...bundles.LIMITS, minBaskets: 1 });
  const ab = rules.get('a').find((r) => r.id === 'b');
  assert.equal(ab.pairs, 2);
  assert.equal(ab.support, 0.4); // 2 of 5 baskets
  assert.equal(ab.confidence, 0.667); // 2 of the 3 with a
  assert.equal(ab.lift, 1.667); // 0.667 / (2/5)
  assert.equal(rules.get('b').find((r) => r.id === 'a').confidence, 1); // every basket with b had a
  // a and c together once: a coincidence, not a rule.
  assert.ok(!rules.get('a').some((r) => r.id === 'c'));
  assert.equal(pairs.length, 1);
  // Together no more often than by chance: no rule.
  const flat = bundles.mine([new Set(['a', 'b']), new Set(['a', 'b'])], { ...bundles.LIMITS, minBaskets: 1 });
  assert.equal(flat.pairs.length, 0);
});

test('similar items on the product page: from the engine when on, the category when off', async () => {
  // Off: the category, as before.
  const off = await h.api('GET', `/ml/recommendations/similar/${A.id}`);
  assert.equal(off.status, 200);
  assert.equal(off.body.data.source, 'category');
  assert.ok(!off.body.data.products.some((p) => p.id === A.id));

  on.add('recommendations');
  const run = await runner.runModule('recommendations');
  assert.equal(run.status, 'OK', run.error || run.reason);
  const saved = await h.prisma.mlTrainingRun.findUnique({ where: { id: run.id } });
  assert.ok(saved.metrics.coverage > 0);
  assert.equal((await h.prisma.mlModelVersion.findFirst({ where: { modelKey: 'recommendations', status: 'ACTIVE' } })).version, run.modelVersion);

  const res = await h.api('GET', `/ml/recommendations/similar/${A.id}?limit=6`);
  assert.equal(res.body.data.source, 'ml');
  const ids = res.body.data.products.map((p) => p.id);
  assert.ok(ids.includes(B.id));
  assert.ok(ids.indexOf(B.id) < (ids.includes(C.id) ? ids.indexOf(C.id) : Infinity), 'the other mango preserve first');
  // Public cards, as the lists show them.
  assert.ok(res.body.data.products[0].store);

  assert.equal((await h.api('GET', '/ml/recommendations/similar/not a product')).status, 404);
  const gone = await h.api('GET', '/ml/recommendations/similar/00000000-0000-0000-0000-000000000000');
  assert.deepEqual(gone.body.data.products, []);
  on.delete('recommendations');
});

test('trending: real engagement over two weeks, growth counting; nothing shown without enough', async () => {
  const day = require('../src/utils/manilaTime').dayKey(new Date());
  for (const [p, views] of [[C, 60], [D, 40], [E, 25]]) {
    // eslint-disable-next-line no-await-in-loop
    await h.prisma.$executeRaw`INSERT INTO product_views (product_id, day, views) VALUES (${p.id}, ${day}, ${views})
      ON DUPLICATE KEY UPDATE views = ${views}`;
  }
  on.add('recommendations');
  const run = await runner.runModule('recommendations');
  assert.equal(run.status, 'OK', run.error || run.reason);
  const res = await h.api('GET', '/ml/recommendations/trending?limit=30');
  const ids = res.body.data.products.map((p) => p.id);
  assert.ok(ids.includes(C.id) && ids.includes(D.id) && ids.includes(E.id));
  assert.ok(ids.indexOf(C.id) < ids.indexOf(D.id) && ids.indexOf(D.id) < ids.indexOf(E.id));
  on.delete('recommendations');
  // Off: no row.
  assert.deepEqual((await h.api('GET', '/ml/recommendations/trending?limit=29')).body.data.products, []);

  // Too few products with enough engagement: no list at all.
  const few = await recommendations.trendingList([{ id: `${tag}-none` }]);
  assert.deepEqual(few.list, []);
});

test('For You: products alike what a buyer ordered rank higher with the engine on', async () => {
  const buyer = await h.user('BUYER');
  await h.order(buyer, shop, [{ product: A }], { status: 'COMPLETED' });
  on.add('recommendations');
  await runner.runModule('recommendations');
  const res = await h.api('GET', '/products/for-you?pageSize=100', { token: h.token(buyer) });
  assert.equal(res.status, 200);
  const ids = res.body.data.map((p) => p.id);
  assert.ok(ids.includes(B.id));
  assert.ok(ids.indexOf(B.id) < ids.indexOf(C.id), 'the preserve like the jam they bought comes before the fish');
  on.delete('recommendations');
});

test('bought together and bundle ideas: from completed orders, only the seller\'s own pairs', async () => {
  const saved = { ...bundles.LIMITS };
  bundles.LIMITS.minBaskets = 1;
  try {
    // Two buyers bought A with B, one A with C, one D alone.
    for (const items of [[A, B], [A, B], [A, C], [D]]) {
      // eslint-disable-next-line no-await-in-loop
      await h.order(await h.user('BUYER'), shop, items.map((product) => ({ product })), { status: 'COMPLETED' });
    }
    on.add('bundles');
    const run = await runner.runModule('bundles');
    assert.equal(run.status, 'OK', run.error || run.reason);

    const together = await h.api('GET', `/ml/bundles/products/${A.id}`);
    assert.deepEqual(together.body.data.products.map((p) => p.id), [B.id]);
    assert.ok(together.body.data.products[0].bundle.lift > 1);

    const cart = await h.api('GET', `/ml/bundles/cart?ids=${A.id}`);
    assert.deepEqual(cart.body.data.products.map((p) => p.id), [B.id]);
    // Already in the cart: not suggested again.
    assert.deepEqual((await h.api('GET', `/ml/bundles/cart?ids=${A.id},${B.id}`)).body.data.products.map((p) => p.id).filter((id) => [A.id, B.id].includes(id)), []);

    const mine = await h.api('GET', '/ml/bundles/mine', { token: h.token(seller) });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.on, true);
    const idea = mine.body.data.ideas.find((i) => i.products.some((p) => p.id === A.id));
    assert.deepEqual(idea.products.map((p) => p.id).sort(), [A.id, B.id].sort());
    assert.equal(idea.orders, 2);
    assert.ok(mine.body.data.ordersWithTwoOrMore >= 3);

    // Another seller sees none of these; a buyer is not let in.
    const other = await h.api('GET', '/ml/bundles/mine', { token: h.token(await h.user('SELLER')) });
    assert.equal(other.status, 404); // no shop
    const otherShopOwner = await h.user('SELLER');
    await h.shop(otherShopOwner);
    assert.deepEqual((await h.api('GET', '/ml/bundles/mine', { token: h.token(otherShopOwner) })).body.data.ideas, []);
    assert.equal((await h.api('GET', '/ml/bundles/mine', { token: h.token(await h.user('BUYER')) })).status, 403);

    // Off: no row, and the seller is told it is off.
    on.delete('bundles');
    assert.deepEqual((await h.api('GET', `/ml/bundles/products/${A.id}?limit=5`)).body.data.products, []);
    const offMine = await h.api('GET', '/ml/bundles/mine', { token: h.token(seller) });
    assert.equal(offMine.body.data.on, false);
    assert.deepEqual(offMine.body.data.ideas, []);
  } finally {
    Object.assign(bundles.LIMITS, saved);
  }
});

test('bundles wait for enough baskets', async () => {
  on.add('bundles');
  const saved = bundles.LIMITS.minBaskets;
  bundles.LIMITS.minBaskets = 1e9;
  try {
    const run = await runner.runModule('bundles');
    assert.equal(run.status, 'SKIPPED');
    assert.match(run.metrics.reason, /bundles need/);
  } finally {
    bundles.LIMITS.minBaskets = saved;
    on.delete('bundles');
  }
});

test('semantic search: meaning finds what the words alone do not, within the filters, and off is as before', async () => {
  const find = async (q, extra = '') => {
    const res = await h.api('GET', `/products?search=${encodeURIComponent(q)}&sortBy=relevance${extra}`);
    assert.equal(res.status, 200, res.body?.message);
    return res.body.data.map((p) => p.id);
  };
  // Off: no listing says "dessert", so the words find nothing.
  assert.ok(!(await find(`${tag} dessert`, '&pageSize=50')).includes(D.id));

  on.add('search');
  search.forget();
  const run = await runner.runModule('search');
  assert.equal(run.status, 'OK', run.error || run.reason);
  assert.ok(run.metrics.recallAt3 >= 0.5);

  // On: "dessert" also means halaya and ube.
  const found = await find(`${tag} dessert`, '&pageSize=49');
  assert.ok(found.includes(D.id));
  // Keyword matches keep their place: the jam named in the query comes first.
  const jam = await find(`${tag} mango jam`, '&pageSize=48');
  assert.equal(jam[0], A.id);
  // The other filters still apply to meaning matches.
  assert.ok(!(await find(`${tag} dessert`, '&pageSize=47&minPrice=100000')).includes(D.id));
  on.delete('search');

  // A failing engine: the search answers as before.
  const realRank = search.rank;
  on.add('search');
  search.rank = async () => { throw new Error('index gone'); };
  try {
    const res = await h.api('GET', `/products?search=${encodeURIComponent(`${tag} mango jam`)}&sortBy=relevance&pageSize=46`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].id, A.id);
  } finally {
    search.rank = realRank;
    on.delete('search');
  }
});
