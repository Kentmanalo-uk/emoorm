const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const HOUR = 3600e3;
const at = (ms) => new Date(Date.now() + ms).toISOString();

const readyShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 7', acceptsCod: true },
});
const addToMenu = (seller, productId) => h.api('POST', '/today/menu', { token: h.token(seller), body: { productId } });
const removeFromMenu = (seller, productId) => h.api('DELETE', `/today/menu/${productId}`, { token: h.token(seller) });
const order = (buyer, store, items) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items },
});
const productOf = (id) => h.prisma.product.findUnique({ where: { id } });
const listedIds = async (path) => ((await h.api('GET', path)).body.data || []).map((p) => p.id);

test('menu: a product goes on the menu with no stock until posted; packages, paluto and others are refused', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const sisig = await h.product(store, { stock: 12, details: { size: '1 plate' } });

  const before = await h.api('GET', '/today/menu', { token: h.token(seller) });
  assert.equal(before.status, 200, before.body?.message);
  assert.ok(before.body.data.choices.some((p) => p.id === sisig.id));
  assert.ok(!before.body.data.items.some((p) => p.id === sisig.id));

  const added = await addToMenu(seller, sisig.id);
  assert.equal(added.status, 201, added.body?.message);
  assert.equal(added.body.data.listingKind, 'TODAY');
  assert.equal(added.body.data.stock, 0);
  const saved = await productOf(sisig.id);
  assert.equal(saved.listingKind, 'TODAY');
  assert.equal(saved.productType, 'READY_TO_EAT');
  assert.equal(saved.stock, 0);
  // The 12 that were in stock leave through the ledger.
  const moves = await h.prisma.inventoryMovement.findMany({ where: { productId: sisig.id } });
  assert.deepEqual(moves.map((m) => [m.reason, m.quantityDelta, m.balanceAfter]), [['TODAY_SWITCH', -12, 0]]);

  const menu = (await h.api('GET', '/today/menu', { token: h.token(seller) })).body.data;
  const row = menu.items.find((p) => p.id === sisig.id);
  assert.ok(row, 'on the menu');
  assert.equal(row.window, null);
  assert.ok(!menu.choices.some((p) => p.id === sisig.id));

  // Already on it, other kinds, other shops, archived products.
  assert.equal((await addToMenu(seller, sisig.id)).status, 409);
  const pkg = await h.product(store, { productType: 'PACKAGE' });
  const paluto = await h.product(store, { productType: 'COOK_TO_ORDER', stock: 0, details: { serves: '3-4', prepMinutes: 60 } });
  const archived = await h.product(store, { status: 'ARCHIVED' });
  const perOption = await h.product(store, { variations: [{ name: 'Size', options: ['S', 'L'], stocks: { S: 3, L: 4 } }], stock: 7 });
  const elsewhere = await h.product(await readyShop(await h.user('SELLER')));
  for (const p of [pkg, paluto, archived, perOption]) {
    const res = await addToMenu(seller, p.id);
    assert.equal(res.status, 400, `${p.productType} ${p.status}: ${res.body?.message}`);
    assert.equal((await productOf(p.id)).listingKind, 'REGULAR');
  }
  assert.match((await addToMenu(seller, pkg.id)).body.message, /Packages/);
  assert.match((await addToMenu(seller, paluto.id)).body.message, /Paluto/);
  assert.equal((await addToMenu(seller, elsewhere.id)).status, 404);
  const choices = menu.choices.map((p) => p.id);
  assert.ok(!choices.includes(pkg.id) && !choices.includes(paluto.id) && !choices.includes(archived.id));
});

test('menu: an item with a post coming up or taking orders stays on the menu; without posts it comes off', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store);
  assert.equal((await addToMenu(seller, item.id)).status, 201);

  const post = await h.api('POST', '/today', {
    token: h.token(seller),
    body: { productId: item.id, quantity: 4, ordersOpenAt: at(HOUR), ordersCloseAt: at(3 * HOUR) },
  });
  assert.equal(post.status, 201, post.body?.message);
  const menu = (await h.api('GET', '/today/menu', { token: h.token(seller) })).body.data;
  assert.equal(menu.items.find((p) => p.id === item.id)?.window?.id, post.body.data.id);

  const refused = await removeFromMenu(seller, item.id);
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /Stop or cancel its posts first/);
  assert.equal((await productOf(item.id)).listingKind, 'TODAY');

  assert.equal((await h.api('POST', `/today/${post.body.data.id}/end`, { token: h.token(seller) })).status, 200);
  const removed = await removeFromMenu(seller, item.id);
  assert.equal(removed.status, 200, removed.body?.message);
  assert.match(removed.body.message, /set its stock in My products/);
  const after = await productOf(item.id);
  assert.equal(after.listingKind, 'REGULAR');
  assert.equal(after.productType, 'REGULAR');
  assert.equal(after.stock, 0);
  assert.equal((await removeFromMenu(seller, item.id)).status, 400);
});

test('menu: a menu item is on its shop page and in search with no post, but not on the Available Today lists', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store, { name: `Tofu Sisig ${h.RUN}` });
  assert.equal((await addToMenu(seller, item.id)).status, 201);

  const shopList = (await h.api('GET', `/products?storeId=${store.id}`)).body.data;
  const shown = shopList.find((p) => p.id === item.id);
  assert.ok(shown, 'on the shop page');
  assert.equal(shown.listingKind, 'TODAY');
  assert.equal(shown.availability, null);
  assert.ok((await listedIds(`/products?storeId=${store.id}&search=Tofu`)).includes(item.id));
  assert.ok(!(await listedIds(`/products?storeId=${store.id}&today=1`)).includes(item.id));
  const today = await h.api('GET', `/today?near=${store.municipalityId}&pageSize=50&sort=newest`);
  assert.ok(!today.body.data.items.some((w) => w.productId === item.id));

  // Its own page shows too, with no post to order from.
  const page = await h.api('GET', `/products/slug/${item.slug}`);
  assert.equal(page.status, 200, page.body?.message);
  assert.equal(page.body.data.availability, null);

  // Posted with a later start: still listed, with the post it waits for.
  const post = await h.api('POST', '/today', {
    token: h.token(seller),
    body: { productId: item.id, quantity: 3, ordersOpenAt: at(2 * HOUR), ordersCloseAt: at(4 * HOUR) },
  });
  assert.equal(post.status, 201, post.body?.message);
  const again = (await h.api('GET', `/products?storeId=${store.id}`)).body.data.find((p) => p.id === item.id);
  assert.equal(again?.availability?.id, post.body.data.id);
  assert.equal(again.availability.status, 'SCHEDULED');
  assert.ok(!(await listedIds(`/products?storeId=${store.id}&today=1`)).includes(item.id));
});

test('menu: checkout of a menu item that is not posted is refused; orders placed before it went on the menu stay', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store, { stock: 5 });
  const buyer = await h.user('BUYER');

  const earlier = await order(buyer, store, [{ productId: item.id, quantity: 2 }]);
  assert.equal(earlier.status, 201, earlier.body?.message);
  assert.equal((await productOf(item.id)).stock, 3);

  assert.equal((await addToMenu(seller, item.id)).status, 201);
  assert.equal((await productOf(item.id)).stock, 0);
  const kept = await h.prisma.order.findUnique({ where: { id: earlier.body.data.id } });
  assert.equal(kept.status, 'PENDING');

  const refused = await order(buyer, store, [{ productId: item.id, quantity: 1 }]);
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /isn't taking orders right now/);
});
