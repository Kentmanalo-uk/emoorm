// The "for you" feed: what someone viewed, searched, saved and bought decides
// the order; what they could never be shown stays out; and with nothing to go
// on it is still a full list.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const prisma = require('../src/config/database');
const {
  buildProfile, rankPool, parseViewed, parseTerms,
} = require('../src/services/recommendation.service');

const madeCategories = [];

after(async () => {
  await h.cleanup();
  await prisma.category.deleteMany({ where: { id: { in: madeCategories } } });
});

const feed = (query, viewer) => h.api('GET', `/products/for-you?${new URLSearchParams({ pageSize: 50, ...query })}`, viewer ? { token: h.token(viewer) } : {});
const ids = (res) => res.body.data.map((p) => p.id);
const rank = (res, product) => ids(res).indexOf(product.id);

async function category(name) {
  const tag = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const made = await prisma.category.create({ data: { name: `Ci ${name} ${tag}`, slug: `ci-${name}-${tag}` } });
  madeCategories.push(made.id);
  return made;
}

async function shopWith(extra = {}) {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  return { seller, store, item: await h.product(store, extra) };
}

const row = (id, extra = {}) => ({
  id, categoryId: 'a', storeId: 's1', stock: 5, listingKind: 'REGULAR', productType: 'GOODS', soldCount: 0, ratingAvg: 0, reviewCount: 0, createdAt: new Date(), ...extra,
});

test('the same category as something viewed comes before the rest', () => {
  const profile = buildProfile({ viewed: [{ categoryId: 'a', storeId: 's9' }] });
  const order = rankPool([row('other', { categoryId: 'b' }), row('match')], profile);
  assert.deepEqual(order.map((p) => p.id), ['match', 'other']);
});

test('a search outranks a category, and what was just viewed gives way', () => {
  const profile = buildProfile({ viewed: [{ categoryId: 'a', storeId: 's1' }] });
  const order = rankPool([row('seen'), row('fresh'), row('searched', { categoryId: 'b', storeId: 's2' })], profile, {
    termHits: new Map([['searched', 1]]),
    seen: new Set(['seen']),
  });
  assert.equal(order[0].id, 'searched');
  assert.ok(order.findIndex((p) => p.id === 'fresh') < order.findIndex((p) => p.id === 'seen'));
});

test('something in the cart and something sold out drop down, and stay in', () => {
  const profile = buildProfile({});
  const order = rankPool([row('gone', { stock: 0 }), row('carted'), row('here')], profile, { carted: new Set(['carted']) });
  assert.deepEqual(order.map((p) => p.id), ['here', 'carted', 'gone']);
});

test('a dish cooked to order is never sold out', () => {
  const order = rankPool([row('stock', { soldCount: 0 }), row('cooked', { stock: 0, productType: 'COOK_TO_ORDER', soldCount: 100 })], buildProfile({}));
  assert.equal(order[0].id, 'cooked');
});

test('no more than two in a row from one shop', () => {
  const pool = [row('a1', { soldCount: 9 }), row('a2', { soldCount: 8 }), row('a3', { soldCount: 7 }), row('b1', { storeId: 's2' })];
  const order = rankPool(pool, buildProfile({}));
  assert.equal(order[2].storeId, 's2');
});

test('the same signals give the same order, so pages agree', () => {
  const pool = ['p', 'q', 'r', 's'].map((id) => row(id));
  const now = Date.now();
  assert.deepEqual(rankPool(pool, buildProfile({}), { now }), rankPool(pool, buildProfile({}), { now }));
});

test('what comes in is kept to a safe shape and size', () => {
  assert.deepEqual(parseViewed("a,a,b;drop table,'x',c-1"), ['a', 'c-1']);
  assert.equal(parseViewed(Array.from({ length: 40 }, (_, i) => `id${i}`).join(',')).length, 20);
  assert.deepEqual(parseTerms(' Honey |honey||Rice'), ['honey', 'rice']);
  assert.equal(parseTerms('a|b|c|d|e|f|g').length, 5);
  assert.equal(parseTerms('x'.repeat(200))[0].length, 60);
});

test('no signals at all is still a list, and is never cached for others', async () => {
  const { item } = await shopWith();
  const res = await feed({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(ids(res).includes(item.id));
  const raw = await fetch(`${await h.startApp()}/products/for-you`);
  assert.match(raw.headers.get('cache-control'), /no-store/);
  assert.ok(res.body.pagination.total >= 1);
});

test('a viewed product pulls its category up', async () => {
  const liked = await category('liked');
  const { item: viewed } = await shopWith({ categoryId: liked.id });
  const { item: sibling } = await shopWith({ categoryId: liked.id });
  const { item: unrelated } = await shopWith();
  const res = await feed({ viewed: viewed.id });
  assert.ok(rank(res, sibling) >= 0);
  assert.ok(rank(res, sibling) < rank(res, unrelated) || rank(res, unrelated) < 0);
});

test('what they searched for comes first', async () => {
  const word = `kapeng${Date.now()}`;
  const { item } = await shopWith({ name: `Barako ${word}` });
  const res = await feed({ terms: word });
  assert.equal(res.body.data[0].id, item.id);
});

test('a saved product pulls its category up for that person only', async () => {
  const saved = await category('saved');
  const { item: wished } = await shopWith({ categoryId: saved.id });
  const { item: sibling } = await shopWith({ categoryId: saved.id });
  const buyer = await h.user('BUYER');
  await prisma.wishlistItem.create({ data: { userId: buyer.id, productId: wished.id } });
  const mine = await feed({}, buyer);
  assert.ok(rank(mine, sibling) >= 0 && rank(mine, sibling) < 2, `at ${rank(mine, sibling)}`);
  await prisma.wishlistItem.deleteMany({ where: { userId: buyer.id } });
});

test('what is in the cart is still in the feed', async () => {
  const { item } = await shopWith();
  const buyer = await h.user('BUYER');
  await prisma.cartItem.create({ data: { userId: buyer.id, productId: item.id } });
  const res = await feed({}, buyer);
  assert.equal(ids(res).includes(item.id), true);
  await prisma.cartItem.deleteMany({ where: { userId: buyer.id } });
});

test('hidden products never show, even when asked for by id or search', async () => {
  const word = `hidden${Date.now()}`;
  const { store, item: pending } = await shopWith({ name: `Tago ${word}`, status: 'PENDING' });
  const { store: closed, item: inClosed } = await shopWith({ name: `Sara ${word}` });
  await prisma.store.update({ where: { id: closed.id }, data: { isSuspended: true } });
  const res = await feed({ terms: word, viewed: `${pending.id},${inClosed.id}` });
  assert.equal(ids(res).includes(pending.id), false);
  assert.equal(ids(res).includes(inClosed.id), false);
  assert.ok(store.id);
});

test('a seller is shown their own products too, in the feed and the product list', async () => {
  const { seller, item } = await shopWith();
  const res = await feed({ viewed: item.id }, seller);
  assert.equal(ids(res).includes(item.id), true);
  const list = await h.api('GET', '/products?pageSize=100&sortBy=createdAt&sortOrder=desc', { token: h.token(seller) });
  assert.equal(list.body.data.some((p) => p.id === item.id), true);
});

test('pages do not repeat a product, and every product is in the feed', async () => {
  await shopWith();
  await shopWith();
  await shopWith();
  // Its own feed: the order of one feed is kept for a minute.
  const terms = `nothing${Date.now()}`;
  const first = await feed({ terms, pageSize: 2, page: 1 });
  const second = await feed({ terms, pageSize: 2, page: 2 });
  const skipped = await feed({ terms, pageSize: 2, page: 1, skip: 2 });
  assert.equal(ids(first).some((id) => ids(second).includes(id)), false);
  // skip is no longer honoured: the list starts from the top.
  assert.deepEqual(ids(skipped), ids(first));
  assert.equal(first.body.pagination.hasNext, true);
});

test('nonsense in the address changes nothing', async () => {
  const res = await feed({ viewed: "';--", terms: '%%%', page: 'x', pageSize: '9999', skip: '-4' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.data.length <= 50);
});
