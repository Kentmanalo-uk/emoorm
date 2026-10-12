const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { imageForSelection } = require('../src/utils/variantPricing');

after(h.cleanup);

const pickupShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 7', acceptsCod: true },
});

const base = async (extra = {}) => ({
  name: `Ci Photo ${h.RUN} ${Math.random().toString(36).slice(2, 7)}`,
  description: 'Made by the variation photo tests.',
  price: 120,
  stock: 10,
  images: ['/uploads/ci-photo.jpg'],
  categoryId: (await h.reference()).category.id,
  ...extra,
});

test('a photo per option is saved; bad photos, two photo groups and unknown options are refused or dropped', async () => {
  const seller = await h.user('SELLER');
  await pickupShop(seller);
  const token = h.token(seller);

  const made = await h.api('POST', '/products', {
    token,
    body: await base({
      variations: [
        { name: 'Color', options: ['Red', 'Blue', 'Green'], images: { Red: '/uploads/ci-red.webp', Blue: ' /uploads/ci-blue.jpg ', Purple: '/uploads/ci-purple.png' } },
        { name: 'Size', options: ['S', 'L'] },
      ],
    }),
  });
  assert.equal(made.status, 201, made.body?.message);
  const saved = await h.prisma.product.findUnique({ where: { id: made.body.data.id }, select: { variations: true } });
  // Green has no photo; Purple isn't an option.
  assert.deepEqual(saved.variations[0].images, { Red: '/uploads/ci-red.webp', Blue: '/uploads/ci-blue.jpg' });
  assert.equal(saved.variations[1].images, undefined);

  const bad = await h.api('POST', '/products', {
    token,
    body: await base({ variations: [{ name: 'Color', options: ['Red'], images: { Red: 'https://evil.example/red.jpg' } }] }),
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /photo for "Red"/);

  const two = await h.api('PUT', `/products/${made.body.data.id}`, {
    token,
    body: {
      variations: [
        { name: 'Color', options: ['Red'], images: { Red: '/uploads/ci-red.webp' } },
        { name: 'Size', options: ['S'], images: { S: '/uploads/ci-s.webp' } },
      ],
    },
  });
  assert.equal(two.status, 400);
  assert.match(two.body.message, /Only one variation can have photos/);

  // Editing keeps photos next to prices, and an empty map clears them.
  const edit = await h.api('PUT', `/products/${made.body.data.id}`, {
    token,
    body: { variations: [{ name: 'Color', options: ['Red', 'Blue'], prices: { Red: 100, Blue: 110 }, images: { Blue: '/uploads/ci-blue.jpg' } }] },
  });
  assert.equal(edit.status, 200, edit.body?.message);
  const edited = await h.prisma.product.findUnique({ where: { id: made.body.data.id }, select: { variations: true } });
  assert.deepEqual(edited.variations[0].images, { Blue: '/uploads/ci-blue.jpg' });
  assert.deepEqual(edited.variations[0].prices, { Red: 100, Blue: 110 });

  const cleared = await h.api('PUT', `/products/${made.body.data.id}`, {
    token,
    body: { variations: [{ name: 'Color', options: ['Red', 'Blue'], images: {} }] },
  });
  assert.equal(cleared.status, 200, cleared.body?.message);
  const clearedRow = await h.prisma.product.findUnique({ where: { id: made.body.data.id }, select: { variations: true } });
  assert.equal(clearedRow.variations[0].images, undefined);
});

test('cart lines and orders carry the variations, so the chosen option photo can be shown', async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);
  const variations = [
    { name: 'Color', options: ['Red', 'Blue'], images: { Red: '/uploads/ci-red.webp' } },
    { name: 'Size', options: ['S', 'L'] },
  ];
  const item = await h.product(store, { images: ['/uploads/ci-main.jpg'], variations });
  const buyer = await h.user('BUYER');
  const token = h.token(buyer);

  assert.equal((await h.api('PUT', '/me/cart', { token, body: { items: [{ productId: item.id, selectedVariations: { Color: 'Red', Size: 'L' }, quantity: 1 }] } })).status, 200);
  const cart = (await h.api('GET', '/me/cart', { token })).body.data;
  assert.equal(imageForSelection(cart[0].product, cart[0].selectedVariations), '/uploads/ci-red.webp');

  const placed = await h.api('POST', '/orders', {
    token,
    body: {
      storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567',
      items: [{ productId: item.id, quantity: 1, selectedVariations: { Color: 'Blue', Size: 'S' } }],
    },
  });
  assert.equal(placed.status, 201, placed.body?.message);
  const orderId = placed.body.data.id;

  const detail = (await h.api('GET', `/orders/${orderId}`, { token })).body.data;
  const line = detail.items[0];
  assert.deepEqual(line.product.variations, variations);
  // Blue has no photo: the product's own image is used.
  assert.equal(imageForSelection(line.product, line.selectedVariations), null);
  assert.equal(imageForSelection(line.product, { Color: 'Red' }), '/uploads/ci-red.webp');

  const mine = (await h.api('GET', '/orders/my/orders', { token })).body.data;
  const listed = (mine.orders || mine.data || mine).find((o) => o.id === orderId);
  assert.ok(listed.items[0].product.variations, 'buyer order list carries variations');

  const sellerList = (await h.api('GET', '/orders/store/orders', { token: h.token(seller) })).body.data;
  const sold = (sellerList.orders || sellerList.data || sellerList).find((o) => o.id === orderId);
  assert.ok(sold.items[0].product.variations, 'seller order list carries variations');

  const sellerDetail = (await h.api('GET', `/orders/${orderId}`, { token: h.token(seller) })).body.data;
  assert.deepEqual(sellerDetail.items[0].product.variations, variations, 'seller order detail carries variations');

  // A return of that line: both sides read the line's product with its variations.
  await h.prisma.returnRequest.create({
    data: {
      requestNumber: `CI-RET-${h.RUN}-${Math.random().toString(36).slice(2, 7)}`,
      orderId, buyerId: buyer.id, storeId: store.id, reason: 'DAMAGED', requestedAmount: 100,
      items: { create: [{ orderItemId: line.id, quantity: 1, unitPrice: 100, subtotal: 100 }] },
    },
  });
  const returnLine = (body) => {
    const list = body.data?.returns || body.data?.data || body.data || [];
    return list.find((r) => r.orderId === orderId || r.order?.id === orderId)?.items?.[0]?.orderItem;
  };
  const buyerReturn = returnLine((await h.api('GET', '/returns/my', { token })).body);
  assert.deepEqual(buyerReturn.product.variations, variations, 'buyer returns carry variations');
  assert.equal(imageForSelection(buyerReturn.product, buyerReturn.selectedVariations), null);
  const storeReturn = returnLine((await h.api('GET', '/returns/store', { token: h.token(seller) })).body);
  assert.deepEqual(storeReturn.product.variations, variations, 'seller returns carry variations');
});
