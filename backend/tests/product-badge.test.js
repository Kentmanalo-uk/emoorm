// The badge a seller puts on a product (Pre-order, Palengke, DIY): saved on
// create and update in any case, cleared with null or '', anything else
// refused, shown in the lists and on the product page, and only the owner
// can set it.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(() => h.cleanup());

async function seller() {
  const u = await h.user('SELLER');
  const store = await h.shop(u);
  return { u, store, token: h.token(u) };
}

const newProduct = async (token, extra = {}) => h.api('POST', '/products', {
  token,
  body: {
    name: `Ci Badge ${h.RUN}`, description: 'Made by the badge tests.', price: 80, stock: 5,
    images: ['/uploads/ci-photo.webp'], categoryId: (await h.reference()).category.id, ...extra,
  },
});

test('a badge is saved on create (any case) and shown in lists and on the page', async () => {
  const s = await seller();
  const created = await newProduct(s.token, { badge: 'palengke' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { id } = created.body.data;
  assert.equal(created.body.data.badge, 'PALENGKE');

  const list = await h.api('GET', `/products?storeId=${s.store.id}&pageSize=50`);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.data.find((p) => p.id === id)?.badge, 'PALENGKE');

  const page = await h.api('GET', `/products/${id}`);
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.equal(page.body.data.badge, 'PALENGKE');

  // Without one, there is none.
  const plain = await newProduct(s.token);
  assert.equal(plain.status, 201, JSON.stringify(plain.body));
  assert.equal(plain.body.data.badge, null);
});

test('a badge is changed and cleared on update; other fields stay', async () => {
  const s = await seller();
  const item = await h.product(s.store);
  const put = (badge) => h.api('PUT', `/products/${item.id}`, { token: s.token, body: { badge } });

  let res = await put('pre-order');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.badge, 'PRE_ORDER');
  assert.equal(Number(res.body.data.stock), 20);

  res = await put('DIY');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.badge, 'DIY');
  assert.equal((await h.api('GET', `/products/${item.id}`)).body.data.badge, 'DIY');

  res = await put('');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.badge, null);

  await put('PALENGKE');
  res = await put(null);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.badge, null);
  assert.equal((await h.prisma.product.findUnique({ where: { id: item.id } })).badge, null);
});

test('any other badge is refused', async () => {
  const s = await seller();
  const item = await h.product(s.store);
  for (const badge of ['SALE', 'Best seller', 42, ['DIY'], { key: 'DIY' }]) {
    const res = await h.api('PUT', `/products/${item.id}`, { token: s.token, body: { badge } });
    assert.equal(res.status, 400, `${JSON.stringify(badge)}: ${JSON.stringify(res.body)}`);
  }
  const created = await newProduct(s.token, { badge: 'FRESH' });
  assert.equal(created.status, 400, JSON.stringify(created.body));
  assert.equal((await h.prisma.product.findUnique({ where: { id: item.id } })).badge, null);
});

test("another seller can't set a badge on someone else's product", async () => {
  const owner = await seller();
  const other = await seller();
  const item = await h.product(owner.store);
  const res = await h.api('PUT', `/products/${item.id}`, { token: other.token, body: { badge: 'DIY' } });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal((await h.prisma.product.findUnique({ where: { id: item.id } })).badge, null);
});
