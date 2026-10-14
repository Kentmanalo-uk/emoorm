const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

/*
 * Local Delicacies' short product form (web and app): Packed food is a
 * regular product kept in stock; Cooked food is an Available Today menu
 * item, saved with no cooking time, days, quantity or post (Today's menu
 * asks those when it is posted). Old paluto products still edit as paluto.
 */

const HOUR = 3600e3;
const at = (ms) => new Date(Date.now() + ms).toISOString();

const pickupShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 7', acceptsCod: true },
});

/** The body the short form sends (formState buildPayload), with only the food's important parts. */
const formBody = async (extra = {}) => ({
  name: `Ci Food ${h.RUN} ${Math.random().toString(36).slice(2, 7)}`,
  description: 'Tasty',
  price: 120,
  salePrice: null,
  saleStartsAt: null,
  saleEndsAt: null,
  priceTiers: [],
  categoryId: (await h.reference()).category.id,
  images: ['/uploads/ci-food.jpg'],
  returnPolicy: null,
  variations: [],
  details: {},
  fulfillment: null,
  ...extra,
});

const create = async (seller, extra) => h.api('POST', '/products', { token: h.token(seller), body: await formBody(extra) });
const edit = (seller, id, body) => h.api('PUT', `/products/${id}`, { token: h.token(seller), body });

test('cooked food: saved as a menu item with only photos, name, price, serving, words and choices', async () => {
  const seller = await h.user('SELLER');
  await pickupShop(seller);

  const res = await create(seller, {
    productType: 'READY_TO_EAT',
    listingKind: 'TODAY',
    details: { serves: 'Good for 2 people' },
    variations: [{ name: 'Rice', options: ['With rice', 'No rice'], prices: { 'With rice': 135, 'No rice': 120 } }],
    returnPolicy: 'For perishable goods, report incorrect or damaged items on delivery with photo proof.',
  });
  assert.equal(res.status, 201, res.body?.message);
  const made = res.body.data;
  assert.equal(made.productType, 'READY_TO_EAT');
  assert.equal(made.listingKind, 'TODAY');
  assert.equal(made.stock, 0, 'its posts on Today\'s menu carry how many');
  assert.deepEqual(made.details, { serves: 'Good for 2 people' });
  assert.equal(made.todayPostError, undefined);
  assert.equal(Number(made.price), 120, 'the lowest choice price');
  // Nothing posted yet: no windows until the seller posts it.
  assert.equal(await h.prisma.productAvailability.count({ where: { productId: made.id } }), 0);

  // "Good for" and choices are optional; a 5-letter description is enough.
  const bare = await create(seller, { productType: 'READY_TO_EAT', listingKind: 'TODAY' });
  assert.equal(bare.status, 201, bare.body?.message);
  assert.equal(bare.body.data.details, null);
  const tooShort = await create(seller, { productType: 'READY_TO_EAT', listingKind: 'TODAY', description: 'Yum' });
  assert.equal(tooShort.status, 400);
  assert.match(tooShort.body.message, /description must be between 5 and/);

  // It is on the menu, and "Post it now" posts it with its own times.
  const menu = (await h.api('GET', '/today/menu', { token: h.token(seller) })).body.data;
  assert.ok(menu.items.some((p) => p.id === made.id), 'on the menu');
  const post = await h.api('POST', '/today', {
    token: h.token(seller),
    body: { productId: made.id, quantity: 10, ordersOpenAt: at(HOUR), ordersCloseAt: at(3 * HOUR) },
  });
  assert.equal(post.status, 201, post.body?.message);

  // Editing it with the short form keeps it a menu item.
  const changed = await edit(seller, made.id, {
    ...(await formBody({ name: made.name, description: 'Tender, with sauce.' })),
    productType: 'READY_TO_EAT',
    listingKind: 'TODAY',
    details: { serves: 'Good for 3-4 people' },
  });
  assert.equal(changed.status, 200, changed.body?.message);
  assert.equal(changed.body.data.listingKind, 'TODAY');
  assert.deepEqual(changed.body.data.details, { serves: 'Good for 3-4 people' });
});

test('packed food: a regular product with its stock, an optional size and pack choices', async () => {
  const seller = await h.user('SELLER');
  await pickupShop(seller);

  const res = await create(seller, {
    productType: 'REGULAR',
    listingKind: 'REGULAR',
    stock: 12,
    weightGrams: null,
    details: { size: '250g pack' },
    variations: [{ name: 'Pack size', options: ['250g', '500g'] }],
  });
  assert.equal(res.status, 201, res.body?.message);
  const made = res.body.data;
  assert.equal(made.productType, 'REGULAR');
  assert.equal(made.listingKind, 'REGULAR');
  assert.equal(made.stock, 12);
  assert.equal(made.weightGrams, null, 'no courier: no weight needed');
  assert.deepEqual(made.details, { size: '250g pack' });
  assert.deepEqual(made.variations, [{ name: 'Pack size', options: ['250g', '500g'] }]);

  // Without the size it is fine too.
  const bare = await create(seller, { productType: 'REGULAR', listingKind: 'REGULAR', stock: 3, weightGrams: null });
  assert.equal(bare.status, 201, bare.body?.message);
  assert.equal(bare.body.data.details, null);
  assert.equal(bare.body.data.stock, 3);

  // Edited from the short form: the stock change applies.
  const restocked = await edit(seller, made.id, {
    ...(await formBody({ name: made.name })),
    productType: 'REGULAR',
    listingKind: 'REGULAR',
    stock: 20,
    stockWas: 12,
    weightGrams: null,
    details: { size: '500g pack' },
  });
  assert.equal(restocked.status, 200, restocked.body?.message);
  assert.equal(restocked.body.data.stock, 20);
  assert.deepEqual(restocked.body.data.details, { size: '500g pack' });
});

test('an existing paluto still edits as paluto', async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);
  const PALUTO = { serves: 'Good for 3-4 people', minOrder: 1, prepMinutes: 45 };
  const paluto = await h.product(store, {
    productType: 'COOK_TO_ORDER', stock: 0, details: PALUTO, images: ['/uploads/ci-paluto.jpg'],
  });

  // The full form sends the paluto's own details back.
  const res = await edit(seller, paluto.id, {
    ...(await formBody({ name: 'Ci Paluto Bangus', description: 'Grilled or sinigang.' })),
    productType: 'COOK_TO_ORDER',
    listingKind: 'REGULAR',
    details: { ...PALUTO, prepMinutesMax: 60, cookDays: [5, 6], orderBy: '15:00' },
  });
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.productType, 'COOK_TO_ORDER');
  assert.equal(res.body.data.listingKind, 'REGULAR');
  assert.deepEqual(res.body.data.details, { ...PALUTO, prepMinutesMax: 60, cookDays: [5, 6], orderBy: '15:00' });

  // A plain change keeps what it is and its cooking facts.
  const renamed = await edit(seller, paluto.id, { name: 'Ci Paluto Tilapia' });
  assert.equal(renamed.status, 200, renamed.body?.message);
  assert.equal(renamed.body.data.productType, 'COOK_TO_ORDER');
  assert.equal(renamed.body.data.details.prepMinutes, 45);

  // Its cooking time is still its own rule.
  const noTime = await edit(seller, paluto.id, { details: { serves: 'Good for 2' } });
  assert.equal(noTime.status, 400);
});
