// The Home shortcuts' filters: products by a seller's badge (Pre-order also
// takes in Available Today pre-orders taking orders now), on sale now, in any
// of several categories, of one kind (ready to eat, packages); shops open now
// by their hours and offering pickup; and the lives on air. Each filter is
// part of the list's cache key, so two filters never share an answer.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const madeCategories = [];

after(async () => {
  await h.cleanup();
  await h.prisma.category.deleteMany({ where: { id: { in: madeCategories } } });
  await h.prisma.$disconnect();
});

const HOUR = 3600e3;
const ids = (res) => (res.body?.data || []).map((x) => x.id).sort();
const sorted = (...list) => list.map((x) => x.id).sort();

async function seller() {
  const u = await h.user('SELLER');
  const store = await h.shop(u);
  return { u, store };
}

test('?badge lists the products with that badge, in any case; an unknown badge is ignored', async () => {
  const { store } = await seller();
  const palengke = await h.product(store, { badge: 'PALENGKE' });
  const pre = await h.product(store, { badge: 'PRE_ORDER' });
  const diy = await h.product(store, { badge: 'DIY' });
  const plain = await h.product(store);

  const list = (badge) => h.api('GET', `/products?storeId=${store.id}&pageSize=50&badge=${badge}`);
  let res = await list('palengke');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(ids(res), sorted(palengke));
  assert.deepEqual(ids(await list('pre-order')), sorted(pre));
  assert.deepEqual(ids(await list('DIY')), sorted(diy));

  // Unknown: no filter, like an unknown ?type.
  res = await list('bogus');
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res), sorted(palengke, pre, diy, plain));
});

test('?badge=PRE_ORDER also lists Available Today pre-orders taking orders now', async () => {
  const { store } = await seller();
  const now = Date.now();
  const today = (extra) => h.product(store, { listingKind: 'TODAY', productType: 'READY_TO_EAT', stock: 0, ...extra });
  const window = (product, mode, open = true) => h.prisma.productAvailability.create({
    data: {
      productId: product.id,
      storeId: store.id,
      mode,
      quantity: 10,
      status: 'LIVE',
      ordersOpenAt: new Date(now - HOUR),
      ordersCloseAt: new Date(now + (open ? HOUR : -HOUR / 2)),
      readyFrom: new Date(now + 2 * HOUR),
      readyUntil: new Date(now + 3 * HOUR),
    },
  });
  const preOrder = await today();
  await window(preOrder, 'PRE_ORDER');
  const readyNow = await today();
  await window(readyNow, 'READY_NOW');
  const closed = await today();
  await window(closed, 'PRE_ORDER', false);
  const badged = await h.product(store, { badge: 'PRE_ORDER' });

  const res = await h.api('GET', `/products?storeId=${store.id}&pageSize=50&badge=PRE_ORDER`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(ids(res), sorted(preOrder, badged));
});

test('?onSale=1 lists products whose sale is on now', async () => {
  const { store } = await seller();
  const now = Date.now();
  const on = await h.product(store, { salePrice: 80 });
  const inWindow = await h.product(store, { salePrice: 70, saleStartsAt: new Date(now - HOUR), saleEndsAt: new Date(now + HOUR) });
  await h.product(store, { salePrice: 80, saleEndsAt: new Date(now - HOUR) }); // ended
  await h.product(store, { salePrice: 80, saleStartsAt: new Date(now + HOUR) }); // not yet
  await h.product(store, { salePrice: 120 }); // not lower than the price
  await h.product(store); // no sale

  const res = await h.api('GET', `/products?storeId=${store.id}&pageSize=50&onSale=1`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(ids(res), sorted(on, inWindow));
});

test('?categories lists products in any of the categories; unknown slugs match nothing', async () => {
  const { store } = await seller();
  const cat = async (name) => {
    const c = await h.prisma.category.create({ data: { name: `Ci ${name} ${h.RUN}`, slug: `ci-${name}-${h.RUN}` } });
    madeCategories.push(c.id);
    return c;
  };
  const [a, b, c] = [await cat('delicacies'), await cat('crafts'), await cat('other')];
  const inA = await h.product(store, { categoryId: a.id });
  const inB = await h.product(store, { categoryId: b.id });
  await h.product(store, { categoryId: c.id });

  const list = (q) => h.api('GET', `/products?storeId=${store.id}&pageSize=50&categories=${encodeURIComponent(q)}`);
  let res = await list(`${a.slug},${b.slug}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(ids(res), sorted(inA, inB));
  assert.deepEqual(ids(await list(`${a.slug}, nope-${h.RUN}`)), sorted(inA));
  res = await list(`nope-${h.RUN}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});

test('productType / listingKind name the ready-to-eat and package lists', async () => {
  const { store } = await seller();
  const food = await h.product(store, { productType: 'READY_TO_EAT', listingKind: 'TODAY', stock: 0 });
  const pkg = await h.product(store, { productType: 'PACKAGE' });
  await h.product(store);

  assert.deepEqual(ids(await h.api('GET', `/products?storeId=${store.id}&pageSize=50&productType=READY_TO_EAT`)), sorted(food));
  assert.deepEqual(ids(await h.api('GET', `/products?storeId=${store.id}&pageSize=50&productType=PACKAGE`)), sorted(pkg));
  assert.deepEqual(ids(await h.api('GET', `/products?storeId=${store.id}&pageSize=50&type=PACKAGE`)), sorted(pkg));
  assert.deepEqual(ids(await h.api('GET', `/products?storeId=${store.id}&pageSize=50&listingKind=TODAY`)), sorted(food));
});

test('each filter is its own cached list', async () => {
  const { store } = await seller();
  const diy = await h.product(store, { badge: 'DIY' });
  const palengke = await h.product(store, { badge: 'PALENGKE', salePrice: 50 });
  const base = `/products?storeId=${store.id}&pageSize=50`;
  assert.deepEqual(ids(await h.api('GET', `${base}&badge=DIY`)), sorted(diy));
  assert.deepEqual(ids(await h.api('GET', `${base}&badge=PALENGKE`)), sorted(palengke));
  assert.deepEqual(ids(await h.api('GET', `${base}&onSale=1`)), sorted(palengke));
  assert.deepEqual(ids(await h.api('GET', base)), sorted(diy, palengke));
});

test('?openNow=1 lists shops open now by their hours and not away, paged after the check', async () => {
  const everyDay = (ranges) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ranges]));
  // A second apart, so "newest first" is certain.
  let made = 0;
  const make = async (data) => {
    const { store } = await seller();
    made += 1;
    return h.prisma.store.update({ where: { id: store.id }, data: { ...data, createdAt: new Date(Date.now() - 60e3 + made * 1000) } });
  };
  const open1 = await make({ openingHours: everyDay([['00:00', '23:59']]) });
  const open2 = await make({ openingHours: everyDay([['00:00', '23:59']]) });
  await make({ openingHours: everyDay([]) }); // closed all week
  await make({ openingHours: everyDay([['00:00', '23:59']]), vacationUntil: new Date(Date.now() + 24 * HOUR) }); // away
  await make({}); // no hours set: not known to be open
  const back = await make({ openingHours: everyDay([['00:00', '23:59']]), vacationUntil: new Date(Date.now() - HOUR) }); // back

  const res = await h.api('GET', `/stores?openNow=1&search=${h.RUN}&pageSize=50`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(ids(res), sorted(open1, open2, back));
  assert.equal(res.body.pagination.total, 3);

  // Pages are cut from the open shops: newest first, none twice.
  const page = (n) => h.api('GET', `/stores?openNow=1&search=${h.RUN}&pageSize=2&page=${n}`);
  const [p1, p2] = [await page(1), await page(2)];
  assert.equal(p1.body.data.length, 2);
  assert.equal(p2.body.data.length, 1);
  assert.equal(p1.body.pagination.total, 3);
  assert.deepEqual([...p1.body.data, ...p2.body.data].map((s) => s.id), [back, open2, open1].map((s) => s.id));
  // The list's usual shape.
  assert.ok(p1.body.data[0].municipality?.name);
});

test('?pickup=1 lists shops offering pickup', async () => {
  const make = async (fulfillmentMode) => {
    const { store } = await seller();
    return h.prisma.store.update({ where: { id: store.id }, data: { fulfillmentMode, name: `Ci Pickup ${h.RUN} ${fulfillmentMode}` } });
  };
  const pickup = await make('PICKUP');
  const both = await make('BOTH');
  await make('DELIVERY');

  const res = await h.api('GET', `/stores?pickup=1&search=${encodeURIComponent(`Ci Pickup ${h.RUN}`)}&pageSize=50`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(ids(res), sorted(pickup, both));
  // Without the filter, all three.
  assert.equal((await h.api('GET', `/stores?search=${encodeURIComponent(`Ci Pickup ${h.RUN}`)}&pageSize=50`)).body.data.length, 3);
});

test('GET /live lists only the lives on air, with their shop', async () => {
  const { u, store } = await seller();
  const started = await h.api('POST', '/live', { token: h.token(u), body: { title: 'Fresh catch' } });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const { id, key } = started.body.data;
  const onList = async () => (await h.api('GET', '/live')).body.data.find((l) => l.id === id);

  assert.equal(await onList(), undefined, 'not listed before its video starts');

  const send = async (method, path) => fetch(`${await h.startApp()}${path}`, {
    method, headers: { 'Content-Type': 'application/octet-stream', 'X-Live-Key': key }, body: Buffer.from('x'.repeat(64)),
  });
  assert.equal((await send('PUT', `/live/${id}/init?epoch=0&codecs=avc1.42e01f,mp4a.40.2`)).status, 200);
  assert.equal((await send('POST', `/live/${id}/seg?seq=0&epoch=0&dur=1000`)).status, 200);

  const live = await onList();
  assert.ok(live, 'listed once on air');
  assert.equal(live.title, 'Fresh catch');
  assert.equal(live.status, 'LIVE');
  assert.equal(live.store.id, store.id);
  assert.equal(live.store.slug, store.slug);
  assert.ok('logo' in live.store && 'town' in live.store);
  assert.ok(live.startedAt);
  assert.equal(typeof live.viewers, 'number');

  assert.equal((await h.api('POST', `/live/${id}/end`, { token: h.token(u) })).status, 200);
  assert.equal(await onList(), undefined, 'gone once ended');
});
