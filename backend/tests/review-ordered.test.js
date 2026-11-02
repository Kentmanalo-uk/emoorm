// The strip under a review says what that reviewer bought. A review belongs
// to a product and not to an order, so this is worked out when it is read.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const prisma = require('../src/config/database');

after(async () => { await h.cleanup(); });

const received = { status: 'COMPLETED' };
const COLOURS = [
  { name: 'Size', options: ['S', 'L'], prices: { S: 50, L: 80 } },
  { name: 'Color', options: ['Red', 'Blue'], images: { Red: '/uploads/red.webp' } },
];

async function setup(variations) {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  if (variations) await prisma.product.update({ where: { id: item.id }, data: { variations } });
  return { buyer, store, item };
}

const chose = (order, selectedVariations, quantity = null) => prisma.orderItem.update({
  where: { id: (quantity ? order.items.find((l) => l.quantity === quantity) : order.items[0]).id },
  data: { selectedVariations },
});

const review = (buyer, item, fields = {}) => prisma.review.create({
  data: { userId: buyer.id, productId: item.id, rating: 5, comment: 'Good', ...fields },
});

const read = async (item) => {
  const res = await h.api('GET', `/reviews/product/${item.id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
};

test('says which option and how many, at today\'s price and photo for that option', async () => {
  const { buyer, store, item } = await setup(COLOURS);
  const order = await h.order(buyer, store, [{ product: item, quantity: 2 }], received);
  await chose(order, { Size: 'L', Color: 'Red' });
  await review(buyer, item);

  const [row] = await read(item);
  assert.deepEqual(row.ordered, {
    image: '/uploads/red.webp',
    price: 80,
    lines: [{ variation: 'L, Red', quantity: 2 }],
  });
});

test('a product with no options has only the count', async () => {
  const { buyer, store, item } = await setup();
  await h.order(buyer, store, [{ product: item, quantity: 3 }], received);
  await review(buyer, item);

  const [row] = await read(item);
  assert.deepEqual(row.ordered.lines, [{ variation: '', quantity: 3 }]);
  assert.equal(row.ordered.image, null);
  assert.equal(row.ordered.price, Number(item.price));
});

test('two options in one order both show', async () => {
  const { buyer, store, item } = await setup(COLOURS);
  const order = await h.order(buyer, store, [{ product: item, quantity: 2 }, { product: item, quantity: 1 }], received);
  await chose(order, { Size: 'L', Color: 'Red' }, 2);
  await chose(order, { Size: 'S', Color: 'Blue' }, 1);
  await review(buyer, item);

  const [row] = await read(item);
  assert.deepEqual(
    row.ordered.lines.sort((a, b) => b.quantity - a.quantity),
    [{ variation: 'L, Red', quantity: 2 }, { variation: 'S, Blue', quantity: 1 }],
  );
});

test('bought twice: the order placed before the review, not one placed after it', async () => {
  const { buyer, store, item } = await setup();
  const first = await h.order(buyer, store, [{ product: item, quantity: 1 }], received);
  const later = await h.order(buyer, store, [{ product: item, quantity: 9 }], received);
  const day = 24 * 3600 * 1000;
  await prisma.order.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 3 * day) } });
  await prisma.order.update({ where: { id: later.id }, data: { createdAt: new Date(Date.now() - day) } });
  await review(buyer, item, { createdAt: new Date(Date.now() - 2 * day) });

  const [row] = await read(item);
  assert.deepEqual(row.ordered.lines, [{ variation: '', quantity: 1 }]);
});

test('an order that never arrived is not what they ordered', async () => {
  const { buyer, store, item } = await setup();
  await h.order(buyer, store, [{ product: item, quantity: 4 }], { status: 'CANCELLED' });
  await review(buyer, item);

  const [row] = await read(item);
  assert.deepEqual(row.ordered.lines, []);
  assert.equal(row.ordered.price, Number(item.price));
});

test('an anonymous review still shows what was bought, and still nothing about who', async () => {
  const { buyer, store, item } = await setup(COLOURS);
  const order = await h.order(buyer, store, [{ product: item, quantity: 2 }], received);
  await chose(order, { Size: 'S', Color: 'Blue' });
  await review(buyer, item, { displayAs: 'ANONYMOUS' });

  const [row] = await read(item);
  assert.deepEqual(row.ordered.lines, [{ variation: 'S, Blue', quantity: 2 }]);
  assert.equal(row.userId, undefined);
  assert.equal(row.user.id, undefined);
  const raw = JSON.stringify(row);
  assert.equal(raw.includes(buyer.id), false);
  assert.equal(raw.includes(order.id), false);
});
