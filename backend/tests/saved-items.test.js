const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('the saved cart keeps one line per product and options, whatever order they come in', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const other = await h.product(store);
  const token = h.token(buyer);
  const put = await h.api('PUT', '/me/cart', {
    token,
    body: {
      items: [
        { productId: item.id, selectedVariations: { Size: 'L', Color: 'Red' }, quantity: 2 },
        { productId: item.id, selectedVariations: { Color: 'Red', Size: 'L' }, quantity: 3 },
        { productId: item.id, selectedVariations: { Size: 'S' }, quantity: 1 },
        { productId: other.id, quantity: 1 },
        { productId: 'no-such-product', quantity: 1 },
      ],
    },
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.data.saved, 3);
  const got = await h.api('GET', '/me/cart', { token });
  const lines = got.body.data;
  assert.equal(lines.length, 3);
  const red = lines.find((l) => l.selectedVariations?.Color === 'Red');
  assert.equal(red.quantity, 3);
  assert.deepEqual(red.selectedVariations, { Color: 'Red', Size: 'L' });
  assert.equal(red.product.name, item.name);
});

test('saving again replaces the cart, and another user sees nothing of it', async () => {
  const buyer = await h.user('BUYER');
  const stranger = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const token = h.token(buyer);
  await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: item.id, quantity: 1 }] } });
  await h.api('PUT', '/me/cart', { token, body: { items: [] } });
  assert.equal((await h.api('GET', '/me/cart', { token })).body.data.length, 0);
  await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: item.id, quantity: 5000 }] } });
  assert.equal((await h.api('GET', '/me/cart', { token })).body.data[0].quantity, 999);
  assert.equal((await h.api('GET', '/me/cart', { token: h.token(stranger) })).body.data.length, 0);
});

test('the wishlist is saved by product id', async () => {
  const buyer = await h.user('BUYER');
  const store = await h.shop(await h.user('SELLER'));
  const a = await h.product(store);
  const b = await h.product(store);
  const token = h.token(buyer);
  const put = await h.api('PUT', '/me/wishlist', { token, body: { productIds: [a.id, b.id, a.id, 'nope'] } });
  assert.equal(put.body.data.saved, 2);
  const got = await h.api('GET', '/me/wishlist', { token });
  assert.deepEqual(got.body.data.map((p) => p.id).sort(), [a.id, b.id].sort());
  assert.equal((await h.api('PUT', '/me/wishlist', { token, body: { productIds: 'x' } })).status, 400);
});
