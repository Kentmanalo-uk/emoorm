const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const couriers = [];
after(async () => {
  // Their shops' links go with the shops; the couriers are the tests' own.
  await h.prisma.courier.deleteMany({ where: { id: { in: couriers } } });
  await h.cleanup();
});

const HOUR = 3600e3;
const MINUTE = 60e3;
const at = (ms) => new Date(Date.now() + ms).toISOString();

/** A shop that takes pickup orders (and cash), ready to sell. */
const pickupShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 7', acceptsCod: true },
});

/** A shop that delivers itself or by its courier, and has pickup too. */
const courierShop = async (seller) => {
  const { municipality } = await h.reference();
  const store = await h.shop(seller);
  const courier = await h.prisma.courier.create({
    data: { name: `Ci Courier ${h.RUN} ${couriers.length}`, rates: { brackets: [{ upToKg: 50, sameTown: 80, otherTown: 120 }], extraPerKg: null } },
  });
  couriers.push(courier.id);
  const ready = await h.prisma.store.update({
    where: { id: store.id },
    data: {
      fulfillmentMode: 'BOTH',
      pickupAddress: 'Stall 7',
      acceptsCod: true,
      paymentQrImage: '/uploads/ci-qr.png',
      paymentQrType: 'GCASH',
      selfDelivery: true,
      deliveryFee: 50,
      serviceAreas: { create: { municipalityId: municipality.id } },
      couriers: { create: { courierId: courier.id } },
    },
  });
  return { store: ready, courier, municipality };
};

const base = async (extra = {}) => ({
  name: `Ci Item ${h.RUN} ${Math.random().toString(36).slice(2, 7)}`,
  description: 'Made by the product kind tests.',
  price: 120,
  stock: 10,
  images: ['/uploads/ci-photo.jpg'],
  categoryId: (await h.reference()).category.id,
  ...extra,
});

const create = async (seller, extra) => h.api('POST', '/products', { token: h.token(seller), body: await base(extra) });
const edit = (seller, id, body) => h.api('PUT', `/products/${id}`, { token: h.token(seller), body });
const row = (id) => h.prisma.product.findUnique({ where: { id }, include: { packageItems: { orderBy: { position: 'asc' } } } });
const movements = (productId) => h.prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } });

const PALUTO = {
  serves: 'Good for 3-4 people', minOrder: 2, prepMinutes: 45, prepMinutesMax: 60, notes: 'Tell us how spicy',
};
const PIG = {
  animal: 'PIG', ageValue: 8, ageUnit: 'MONTHS', sex: 'MALE', weightKg: 65, visitFirst: true, notes: 'Dewormed',
};

const pickupOrder = (buyer, store, items, extra = {}) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items, ...extra },
});

const deliveryOrder = (buyer, store, municipality, items, extra = {}) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: {
    storeId: store.id,
    fulfillmentMethod: 'DELIVERY',
    paymentMethod: 'COD',
    contactNumber: '09171234567',
    deliveryAddress: `Purok 1, Poblacion, ${municipality.name}, Oriental Mindoro`,
    buyerMunicipalityId: municipality.id,
    buyerBarangay: 'Poblacion',
    items,
    ...extra,
  },
});

// ── Regular ─────────────────────────────────────────────────────────────

test('a regular product keeps its size; details are tidied and unknown keys dropped', async () => {
  const seller = await h.user('SELLER');
  await courierShop(seller);
  const res = await create(seller, { weightGrams: 500, details: { size: '  500 g pack ', color: 'red' }, fulfillment: 'PICKUP' });
  assert.equal(res.status, 201, res.body?.message);
  assert.equal(res.body.data.productType, 'REGULAR');
  assert.equal(res.body.data.listingKind, 'REGULAR');
  assert.deepEqual(res.body.data.details, { size: '500 g pack' });
  assert.equal(res.body.data.fulfillment, 'PICKUP');
  assert.equal(res.body.data.packageItems, undefined);

  const resized = await edit(seller, res.body.data.id, { details: { size: '1 kg pack' }, fulfillment: null });
  assert.equal(resized.status, 200, resized.body?.message);
  assert.deepEqual(resized.body.data.details, { size: '1 kg pack' });
  assert.equal(resized.body.data.fulfillment, null);
  const noWeight = await edit(seller, res.body.data.id, { weightGrams: null });
  assert.equal(noWeight.status, 400, 'goods in a courier shop keep a weight');

  const bad = await create(seller, { weightGrams: 500, fulfillment: 'COURIER' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.message, 'Choose pickup, delivery or both');

  const pickupOnly = await h.user('SELLER');
  await pickupShop(pickupOnly);
  const delivery = await create(pickupOnly, { fulfillment: 'DELIVERY' });
  assert.equal(delivery.status, 400);
  assert.equal(delivery.body.message, 'Your shop offers pickup only');

  const unknown = await create(pickupOnly, { productType: 'SERVICE' });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.message, 'Choose what kind of product it is');
});

// ── Cooked to order ─────────────────────────────────────────────────────

test('paluto: its details are checked, and it keeps no stock', async () => {
  const seller = await h.user('SELLER');
  await pickupShop(seller);

  const res = await create(seller, {
    productType: 'COOK_TO_ORDER',
    stock: 50,
    details: { ...PALUTO, cookDays: [6, 0, 6], orderBy: '15:00', extra: 'dropped' },
  });
  assert.equal(res.status, 201, res.body?.message);
  const made = res.body.data;
  assert.equal(made.productType, 'COOK_TO_ORDER');
  assert.equal(made.stock, 0);
  assert.deepEqual(made.details, { ...PALUTO, cookDays: [0, 6], orderBy: '15:00' });

  // Every day is the same as none; the minimum order defaults to 1.
  const daily = await create(seller, { productType: 'COOK_TO_ORDER', details: { serves: 'Good for 2', prepMinutes: 30, cookDays: [0, 1, 2, 3, 4, 5, 6] } });
  assert.equal(daily.status, 201, daily.body?.message);
  assert.deepEqual(daily.body.data.details, { serves: 'Good for 2', minOrder: 1, prepMinutes: 30 });

  // Sizes with their own prices: the listing shows "from" the lowest.
  const sized = await create(seller, {
    productType: 'COOK_TO_ORDER',
    details: { serves: 'Good for 3-4 people', prepMinutes: 45 },
    variations: [{ name: 'Size', options: ['Good for 3-4', 'Good for 6-8'], prices: { 'Good for 3-4': 350, 'Good for 6-8': 650 } }],
  });
  assert.equal(sized.status, 201, sized.body?.message);
  assert.equal(Number(sized.body.data.price), 350);

  const bad = async (details, message, extra = {}) => {
    const r = await create(seller, { productType: 'COOK_TO_ORDER', details, ...extra });
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(details)}`);
    assert.equal(r.body.message, message);
  };
  await bad({ prepMinutes: 30 }, 'Say how many people it serves, like "Good for 3-4 people"');
  await bad({ serves: 'Good for 2', prepMinutes: 3 }, 'Preparation time: from 5 minutes to 24 hours');
  await bad({ serves: 'Good for 2', prepMinutes: 60, prepMinutesMax: 30 }, 'The longest preparation time must not be shorter than the shortest (at most 48 hours)');
  await bad({ serves: 'Good for 2', prepMinutes: 30, minOrder: 0 }, 'Minimum order: a whole number from 1 to 100');
  await bad({ serves: 'Good for 2', prepMinutes: 30, cookDays: [7] }, 'Choose the days you cook');
  await bad({ serves: 'Good for 2', prepMinutes: 30, orderBy: '25:00' }, 'Order-by time is like 15:00');
  await bad('Good for 2', 'Check the product details');
  await bad({ serves: 'Good for 2', prepMinutes: 30 }, 'Cooked-to-order food has no stock: remove the stock per choice', {
    variations: [{ name: 'Size', options: ['S', 'L'], stocks: { S: 2, L: 3 } }],
  });

  // No stock to add to by hand either.
  const manual = await h.api('POST', `/products/${made.id}/stock`, { token: h.token(seller), body: { delta: 5 } });
  assert.equal(manual.status, 400);
  assert.equal(manual.body.message, 'Cooked-to-order food has no stock to change: it is cooked when ordered');

  // Editing: the details are checked again, and stock stays out of it.
  const wrong = await edit(seller, made.id, { details: { ...PALUTO, prepMinutes: 2 } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.message, 'Preparation time: from 5 minutes to 24 hours');
  const changed = await edit(seller, made.id, { details: { ...PALUTO, serves: 'Good for 5-6 people' }, stock: 30 });
  assert.equal(changed.status, 200, changed.body?.message);
  assert.equal(changed.body.data.details.serves, 'Good for 5-6 people');
  assert.equal(changed.body.data.details.cookDays, undefined);
  assert.equal(changed.body.data.stock, 0);
});

// ── Live animals ────────────────────────────────────────────────────────

test('live animals: priced per head, with their age, sex and weight checked', async () => {
  const seller = await h.user('SELLER');
  await pickupShop(seller);

  const res = await create(seller, { productType: 'LIVESTOCK', name: 'Native Pig', price: 8500, stock: 3, details: { ...PIG, breed: 'dropped' } });
  assert.equal(res.status, 201, res.body?.message);
  assert.equal(res.body.data.productType, 'LIVESTOCK');
  assert.equal(res.body.data.stock, 3);
  assert.deepEqual(res.body.data.details, PIG);
  // A few heads at a time: only "sold out" warns, unless the seller says otherwise.
  assert.equal(res.body.data.lowStockThreshold, 0);
  const marked = await create(seller, { productType: 'LIVESTOCK', stock: 30, lowStockThreshold: 5, details: { ...PIG, animal: 'CHICKEN' } });
  assert.equal(marked.body.data.lowStockThreshold, 5);

  // Editing checks the facts again.
  const older = await edit(seller, res.body.data.id, { details: { ...PIG, ageValue: 9 } });
  assert.equal(older.status, 200, older.body?.message);
  assert.equal(older.body.data.details.ageValue, 9);
  const noUnit = await edit(seller, res.body.data.id, { details: { ...PIG, ageUnit: '' } });
  assert.equal(noUnit.status, 400);
  assert.equal(noUnit.body.message, 'Choose weeks, months or years for the age');

  const ducks = await create(seller, {
    productType: 'LIVESTOCK', stock: 12, details: { animal: 'other', animalName: 'Quail', ageValue: '6', ageUnit: 'weeks', sex: 'MIXED', weightKg: '0.25' },
  });
  assert.equal(ducks.status, 201, ducks.body?.message);
  assert.deepEqual(ducks.body.data.details, { animal: 'OTHER', animalName: 'Quail', ageValue: 6, ageUnit: 'WEEKS', sex: 'MIXED', weightKg: 0.25 });

  const bad = async (extra, message) => {
    const r = await create(seller, { productType: 'LIVESTOCK', stock: 1, ...extra });
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(extra)}`);
    assert.equal(r.body.message, message);
  };
  await bad({ details: { ...PIG, animal: 'DOG' } }, 'Choose the animal');
  await bad({ details: { ...PIG, animal: 'OTHER' } }, 'Type what animal it is');
  await bad({ details: { ...PIG, ageValue: 2.5 } }, 'Age: a whole number, like 8');
  await bad({ details: { ...PIG, ageUnit: 'DAYS' } }, 'Choose weeks, months or years for the age');
  await bad({ details: { ...PIG, sex: 'CASTRATED' } }, 'Choose male, female or mixed');
  await bad({ details: { ...PIG, sex: 'MIXED' } }, 'Mixed is for more than one animal. Choose male or female.');
  await bad({ details: { ...PIG, weightKg: 0 } }, 'Approximate weight: from 0.1 to 2,000 kg');
  await bad({}, 'Choose the animal');
  await bad({ details: PIG, variations: [{ name: 'Size', options: ['Small', 'Big'] }] }, 'Live animals have no choices. List animals that differ on their own.');

  // Down to one animal: "mixed" no longer fits.
  const fewer = await edit(seller, ducks.body.data.id, { stock: 1 });
  assert.equal(fewer.status, 400);
  assert.equal(fewer.body.message, 'Mixed is for more than one animal. Choose male or female.');
});

// ── Ready to eat ────────────────────────────────────────────────────────

test('ready-to-eat food: older forms send listingKind TODAY; a mismatch is refused', async () => {
  const seller = await h.user('SELLER');
  await pickupShop(seller);

  const old = await create(seller, { listingKind: 'TODAY' });
  assert.equal(old.status, 201, old.body?.message);
  assert.equal(old.body.data.productType, 'READY_TO_EAT');
  assert.equal(old.body.data.listingKind, 'TODAY');
  assert.equal(old.body.data.stock, 0);

  const fresh = await create(seller, { productType: 'READY_TO_EAT', details: { serves: 'Good for 1' } });
  assert.equal(fresh.status, 201, fresh.body?.message);
  assert.equal(fresh.body.data.listingKind, 'TODAY');
  assert.deepEqual(fresh.body.data.details, { serves: 'Good for 1' });
  const serves = await edit(seller, fresh.body.data.id, { details: { serves: 'Good for 2', size: 'dropped' }, stock: 8 });
  assert.equal(serves.status, 200, serves.body?.message);
  assert.deepEqual(serves.body.data.details, { serves: 'Good for 2' });
  assert.equal(serves.body.data.stock, 0);

  for (const body of [{ productType: 'READY_TO_EAT', listingKind: 'REGULAR' }, { productType: 'COOK_TO_ORDER', listingKind: 'TODAY', details: PALUTO }]) {
    const r = await create(seller, body);
    assert.equal(r.status, 400);
    assert.equal(r.body.message, 'Only ready-to-eat food is sold as Available Today');
  }
});

test("ready-to-eat food can be posted for today as it is saved; a bad post saves nothing", async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);

  const res = await create(seller, {
    productType: 'READY_TO_EAT',
    name: 'Chicken Adobo',
    todayPost: { quantity: 10, mode: 'MADE_TO_ORDER', prepMinutes: 30, ordersCloseAt: at(3 * HOUR) },
  });
  assert.equal(res.status, 201, res.body?.message);
  assert.equal(res.body.data.todayPostError, undefined);
  assert.equal(res.body.data.stock, 10);
  assert.equal(res.body.data.availability?.status, 'LIVE');
  assert.equal(res.body.data.availability?.mode, 'MADE_TO_ORDER');

  const name = `Ci Late Adobo ${h.RUN}`;
  const late = await create(seller, { productType: 'READY_TO_EAT', name, todayPost: { quantity: 5, ordersCloseAt: at(-HOUR) } });
  assert.equal(late.status, 400);
  assert.equal(late.body.message, 'Orders must close later than now');
  assert.equal(await h.prisma.product.count({ where: { storeId: store.id, name } }), 0);

  const regular = await create(seller, { todayPost: { quantity: 5, ordersCloseAt: at(HOUR) } });
  assert.equal(regular.status, 400);
  assert.equal(regular.body.message, 'Only ready-to-eat food is posted for today');
});

// ── Switching kinds ─────────────────────────────────────────────────────

test('switching kinds: stock goes from paluto, Today windows end, facts are asked for', async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);

  // Regular to paluto: its stock goes, in the ledger.
  const stocked = await h.product(store, { stock: 9 });
  const cooked = await edit(seller, stocked.id, { productType: 'COOK_TO_ORDER', details: PALUTO, stock: 4, stockWas: 9 });
  assert.equal(cooked.status, 200, cooked.body?.message);
  assert.equal(cooked.body.data.stock, 0);
  assert.deepEqual((await movements(stocked.id)).map((m) => [m.reason, m.quantityDelta]), [['KIND_SWITCH', -9]]);

  // Paluto to live animals needs the animal's facts; then stock is heads.
  const noFacts = await edit(seller, stocked.id, { productType: 'LIVESTOCK', stock: 2 });
  assert.equal(noFacts.status, 400);
  assert.equal(noFacts.body.message, 'Choose the animal');
  const animal = await edit(seller, stocked.id, { productType: 'LIVESTOCK', stock: 2, details: PIG });
  assert.equal(animal.status, 200, animal.body?.message);
  assert.equal(animal.body.data.stock, 2);
  assert.deepEqual(animal.body.data.details, PIG);

  // The old form only sends listingKind REGULAR: it stays a live animal.
  const oldForm = await edit(seller, stocked.id, { listingKind: 'REGULAR', description: 'Fixed a typo in the words.' });
  assert.equal(oldForm.status, 200, oldForm.body?.message);
  assert.equal(oldForm.body.data.productType, 'LIVESTOCK');
  assert.deepEqual(oldForm.body.data.details, PIG);

  // Back to regular: the animal's facts go.
  const regular = await edit(seller, stocked.id, { productType: 'REGULAR', stock: 6 });
  assert.equal(regular.status, 200, regular.body?.message);
  assert.equal(regular.body.data.details, null);
  assert.equal(regular.body.data.stock, 6);

  // Ready to eat with a live window, then regular: the window ends.
  const today = await create(seller, { productType: 'READY_TO_EAT', todayPost: { quantity: 5, ordersCloseAt: at(2 * HOUR) } });
  assert.equal(today.status, 201, today.body?.message);
  const off = await edit(seller, today.body.data.id, { productType: 'REGULAR', stock: 3 });
  assert.equal(off.status, 200, off.body?.message);
  assert.equal(off.body.data.listingKind, 'REGULAR');
  assert.equal(off.body.data.stock, 3);
  const window = await h.prisma.productAvailability.findFirst({ where: { productId: today.body.data.id } });
  assert.equal(window.status, 'ENDED');

  // And the old way into Available Today still works.
  const into = await edit(seller, stocked.id, { listingKind: 'TODAY' });
  assert.equal(into.status, 200, into.body?.message);
  assert.equal(into.body.data.productType, 'READY_TO_EAT');
  assert.equal((await row(stocked.id)).stock, 0);
});

// ── Packages ────────────────────────────────────────────────────────────

/** A shop with two weighed goods (one on sale), a paluto and a live animal. */
const packageShop = async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);
  const pancit = await h.product(store, { name: `Ci Pancit ${h.RUN}`, price: 100, weightGrams: 500, images: ['/uploads/ci-pancit.jpg'] });
  const lumpia = await h.product(store, { name: `Ci Lumpia ${h.RUN}`, price: 50, salePrice: 40, weightGrams: 250, images: ['/uploads/ci-lumpia.jpg'] });
  const chicken = await h.product(store, { name: `Ci Lechon Manok ${h.RUN}`, price: 300, stock: 0, productType: 'COOK_TO_ORDER', details: PALUTO, images: ['/uploads/ci-chicken.jpg'] });
  const pig = await h.product(store, { name: `Ci Pig ${h.RUN}`, price: 8500, productType: 'LIVESTOCK', details: PIG });
  return { seller, store, pancit, lumpia, chicken, pig };
};

test('a package is made from the shop\'s own products; its photos, words and weight come from them', async () => {
  const { seller, store, pancit, lumpia, chicken } = await packageShop();

  const res = await h.api('POST', '/products', {
    token: h.token(seller),
    body: {
      productType: 'PACKAGE',
      name: 'Fiesta Food Package',
      price: 220,
      stock: 5,
      details: { packageKind: 'FIESTA', noticeHours: 24 },
      packageItems: [{ productId: pancit.id, quantity: 2 }, { productId: lumpia.id, quantity: 1 }],
    },
  });
  assert.equal(res.status, 201, res.body?.message);
  const pkg = res.body.data;
  assert.equal(pkg.productType, 'PACKAGE');
  assert.equal(pkg.stock, 5);
  assert.deepEqual(pkg.images, ['/uploads/ci-pancit.jpg', '/uploads/ci-lumpia.jpg']);
  assert.equal(pkg.description, `Includes: 2 x ${pancit.name}, 1 x ${lumpia.name}`);
  assert.equal(pkg.categoryId, pancit.categoryId);
  assert.equal(pkg.weightGrams, 1250);
  assert.deepEqual(pkg.details, { packageKind: 'FIESTA', noticeHours: 24, autoCover: true, autoDescription: true });
  // Bought one by one now: 2 x 100 + 1 x 40 (on sale).
  assert.equal(pkg.packageValue, 240);
  assert.deepEqual(pkg.packageItems.map((it) => [it.productId, it.quantity]), [[pancit.id, 2], [lumpia.id, 1]]);
  assert.deepEqual(Object.keys(pkg.packageItems[0].product).sort(), ['deletedAt', 'id', 'images', 'name', 'price', 'productType', 'saleEndsAt', 'saleStartsAt', 'salePrice', 'slug', 'status'].sort());
  assert.deepEqual(pkg.packageItems[0].product.images, ['/uploads/ci-pancit.jpg']);

  // Buyers see the same on the product page and in lists.
  const page = await h.api('GET', `/products/${pkg.id}`);
  assert.equal(page.body.data.packageValue, 240);
  assert.equal(page.body.data.packageItems.length, 2);
  const listed = (await h.api('GET', `/products?storeId=${store.id}&type=PACKAGE`)).body.data;
  assert.deepEqual(listed.map((p) => p.id), [pkg.id]);
  assert.equal(listed[0].packageItems[1].product.name, lumpia.name);

  // With cooked food inside, no courier can take it: no weight.
  const food = await h.api('POST', '/products', {
    token: h.token(seller),
    body: {
      productType: 'PACKAGE', name: 'Family Meal', price: 500, stock: 2, description: 'Our Sunday family favourite, for four.',
      images: ['/uploads/ci-own.jpg'], categoryId: pancit.categoryId,
      packageItems: [{ productId: chicken.id, quantity: 1 }, { productId: pancit.id, quantity: 1 }],
    },
  });
  assert.equal(food.status, 201, food.body?.message);
  assert.equal(food.body.data.weightGrams, null);
  assert.deepEqual(food.body.data.images, ['/uploads/ci-own.jpg']);
  assert.equal(food.body.data.description, 'Our Sunday family favourite, for four.');
  assert.deepEqual(food.body.data.details, { autoCover: false, autoDescription: false });
});

test('a package refuses other shops\' products, deleted ones, packages, live animals and extra prices', async () => {
  const { seller, pancit, lumpia, pig } = await packageShop();
  const other = await packageShop();
  const gone = await h.product((await h.prisma.store.findUnique({ where: { id: pancit.storeId } })), { deletedAt: new Date() });
  const made = await h.api('POST', '/products', {
    token: h.token(seller),
    body: { productType: 'PACKAGE', name: 'Merienda Set', price: 150, packageItems: [{ productId: pancit.id, quantity: 1 }, { productId: lumpia.id, quantity: 1 }] },
  });
  assert.equal(made.status, 201, made.body?.message);

  const bad = async (body, message) => {
    const r = await h.api('POST', '/products', {
      token: h.token(seller),
      body: { productType: 'PACKAGE', name: 'Bad Package', price: 150, ...body },
    });
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(r.body.message, message);
  };
  const two = [{ productId: pancit.id, quantity: 1 }, { productId: lumpia.id, quantity: 1 }];
  await bad({}, 'Choose the products in this package');
  await bad({ packageItems: [{ productId: pancit.id, quantity: 1 }] }, 'A package needs at least 2 items');
  await bad({ packageItems: [{ productId: pancit.id, quantity: 1 }, { productId: pancit.id, quantity: 2 }] }, 'Each product goes in once: change how many instead');
  await bad({ packageItems: [{ productId: pancit.id, quantity: 100 }] }, 'How many of each: a whole number from 1 to 99');
  await bad({ packageItems: Array.from({ length: 21 }, (_, i) => ({ productId: `p${i}`, quantity: 1 })) }, 'A package holds up to 20 different products');
  await bad({ packageItems: [{ productId: other.pancit.id, quantity: 2 }] }, 'Choose products your shop sells');
  await bad({ packageItems: [{ productId: gone.id, quantity: 2 }] }, 'Choose products your shop sells');
  await bad({ packageItems: [{ productId: made.body.data.id, quantity: 2 }] }, `${made.body.data.name} is a package. A package can't go inside another.`);
  await bad({ packageItems: [{ productId: pig.id, quantity: 2 }] }, `${pig.name} is a live animal. Live animals can't go in a package.`);
  await bad({ packageItems: two, variations: [{ name: 'Size', options: ['S', 'L'] }] }, 'A package has one price: remove the choices');
  await bad({ packageItems: two, salePrice: 100 }, 'A package has one price: remove the sale price');
  await bad({ packageItems: two, priceTiers: [{ minQty: 3, price: 120 }] }, 'A package has one price: remove the bulk prices');
  await bad({ packageItems: two, details: { packageKind: 'WEDDING' } }, 'Choose what the package is for');

  // A package stays a package, and nothing else becomes one.
  const change = await edit(seller, made.body.data.id, { productType: 'REGULAR' });
  assert.equal(change.status, 400);
  assert.equal(change.body.message, 'Make a new package instead');
  const become = await edit(seller, pancit.id, { productType: 'PACKAGE', packageItems: two });
  assert.equal(become.status, 400);
  assert.equal(become.body.message, 'Make a new package instead');

  // An item of a package can't turn into a live animal.
  const animal = await edit(seller, pancit.id, { productType: 'LIVESTOCK', details: PIG });
  assert.equal(animal.status, 400);
  assert.match(animal.body.message, /in a package/);
});

test('editing a package replaces its items; filled-in photos and words follow them, the seller\'s own stay', async () => {
  const { seller, pancit, lumpia, chicken } = await packageShop();
  const made = await h.api('POST', '/products', {
    token: h.token(seller),
    body: { productType: 'PACKAGE', name: 'Merienda Set', price: 150, stock: 4, packageItems: [{ productId: pancit.id, quantity: 1 }, { productId: lumpia.id, quantity: 1 }] },
  });
  const id = made.body.data.id;

  const swapped = await edit(seller, id, { packageItems: [{ productId: chicken.id, quantity: 1 }, { productId: lumpia.id, quantity: 3 }] });
  assert.equal(swapped.status, 200, swapped.body?.message);
  assert.deepEqual((await row(id)).packageItems.map((it) => [it.productId, it.quantity, it.position]), [[chicken.id, 1, 0], [lumpia.id, 3, 1]]);
  assert.equal(swapped.body.data.description, `Includes: 1 x ${chicken.name}, 3 x ${lumpia.name}`);
  assert.deepEqual(swapped.body.data.images, ['/uploads/ci-chicken.jpg', '/uploads/ci-lumpia.jpg']);
  assert.equal(swapped.body.data.weightGrams, null);
  assert.equal(swapped.body.data.packageValue, 300 + 3 * 40);

  // The seller's own words and photo are kept from then on.
  const words = await edit(seller, id, { description: 'A merienda set for the whole barkada.', images: ['/uploads/ci-own.jpg'] });
  assert.equal(words.status, 200, words.body?.message);
  const again = await edit(seller, id, { packageItems: [{ productId: pancit.id, quantity: 2 }, { productId: lumpia.id, quantity: 2 }] });
  assert.equal(again.status, 200, again.body?.message);
  assert.equal(again.body.data.description, 'A merienda set for the whole barkada.');
  assert.deepEqual(again.body.data.images, ['/uploads/ci-own.jpg']);
  assert.equal(again.body.data.weightGrams, 1500);
  assert.deepEqual(again.body.data.details, { autoCover: false, autoDescription: false });

  // Clearing them fills them in again.
  const cleared = await edit(seller, id, { description: '', images: [] });
  assert.equal(cleared.status, 200, cleared.body?.message);
  assert.equal(cleared.body.data.description, `Includes: 2 x ${pancit.name}, 2 x ${lumpia.name}`);
  assert.deepEqual(cleared.body.data.images, ['/uploads/ci-pancit.jpg', '/uploads/ci-lumpia.jpg']);
});

test('a package order keeps what was inside, and takes only the package\'s own stock', async () => {
  const { seller, store, pancit, lumpia } = await packageShop();
  const made = await h.api('POST', '/products', {
    token: h.token(seller),
    body: { productType: 'PACKAGE', name: 'Merienda Set', price: 150, stock: 5, packageItems: [{ productId: pancit.id, quantity: 2 }, { productId: lumpia.id, quantity: 1 }] },
  });
  const pkg = made.body.data;
  const buyer = await h.user('BUYER');

  const placed = await pickupOrder(buyer, store, [{ productId: pkg.id, quantity: 2 }]);
  assert.equal(placed.status, 201, placed.body?.message);
  const contents = [
    { productId: pancit.id, name: pancit.name, quantity: 2, image: '/uploads/ci-pancit.jpg' },
    { productId: lumpia.id, name: lumpia.name, quantity: 1, image: '/uploads/ci-lumpia.jpg' },
  ];
  assert.deepEqual(placed.body.data.items[0].packageContents, contents);
  assert.equal((await row(pkg.id)).stock, 3);
  assert.equal((await row(pancit.id)).stock, 20);
  assert.equal((await row(lumpia.id)).stock, 20);

  // The seller changing the package later doesn't change the order.
  await edit(seller, pkg.id, { packageItems: [{ productId: lumpia.id, quantity: 4 }] });
  const order = await h.api('GET', `/orders/${placed.body.data.id}`, { token: h.token(buyer) });
  assert.deepEqual(order.body.data.items[0].packageContents, contents);
  assert.equal(order.body.data.items[0].product.productType, 'PACKAGE');
  const sellerList = await h.api('GET', '/orders/store/orders', { token: h.token(seller) });
  const line = (sellerList.body.data || []).find((o) => o.id === placed.body.data.id)?.items?.[0];
  assert.deepEqual(line?.packageContents, contents);
  assert.equal(line.product.productType, 'PACKAGE');

  // Ordering ahead: ready no sooner than its notice.
  const ahead = await h.api('POST', '/products', {
    token: h.token(seller),
    body: { productType: 'PACKAGE', name: 'Birthday Set', price: 900, stock: 2, details: { packageKind: 'BIRTHDAY', noticeHours: 48 }, packageItems: [{ productId: pancit.id, quantity: 3 }] },
  });
  assert.equal(ahead.status, 201, ahead.body?.message);
  const before = Date.now();
  const party = await pickupOrder(await h.user('BUYER'), store, [{ productId: ahead.body.data.id, quantity: 1 }]);
  assert.equal(party.status, 201, party.body?.message);
  assert.ok(new Date(party.body.data.etaFrom).getTime() >= before + 48 * HOUR, 'ready no sooner than 48 hours from now');
});

// ── Orders of cooked-to-order food ──────────────────────────────────────

test('paluto orders: a minimum order, no stock taken or given back, ready after its cooking time', async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);
  const paluto = await create(seller, { productType: 'COOK_TO_ORDER', name: 'Paluto Bangus', price: 350, details: PALUTO });
  assert.equal(paluto.status, 201, paluto.body?.message);
  const id = paluto.body.data.id;
  const buyer = await h.user('BUYER');

  const one = await pickupOrder(buyer, store, [{ productId: id, quantity: 1 }]);
  assert.equal(one.status, 400);
  assert.equal(one.body.message, 'The minimum order for Paluto Bangus is 2');

  const before = Date.now();
  const placed = await pickupOrder(buyer, store, [{ productId: id, quantity: 3 }]);
  assert.equal(placed.status, 201, placed.body?.message);
  const after = Date.now();
  const from = new Date(placed.body.data.etaFrom).getTime();
  const to = new Date(placed.body.data.etaTo).getTime();
  // Cooking starts at 8:00 AM: ordered before then (or so late it runs past
  // midnight), it is ready from the next cooking start instead.
  const hourNow = new Date(before + 8 * HOUR).getUTCHours();
  if (hourNow >= 8 && hourNow < 23) {
    assert.ok(from >= before + 45 * MINUTE && from <= after + 45 * MINUTE, 'ready from 45 minutes after ordering');
    assert.ok(to >= before + 60 * MINUTE && to <= after + 60 * MINUTE, 'ready by 60 minutes after ordering');
  } else {
    assert.equal(new Date(from + 8 * HOUR).getUTCHours() * 60 + new Date(from + 8 * HOUR).getUTCMinutes(), 8 * 60 + 45, 'ready 45 minutes after 8:00 AM');
  }
  assert.equal((await row(id)).stock, 0);
  assert.deepEqual(await movements(id), []);

  const cancelled = await h.api('POST', `/orders/${placed.body.data.id}/cancel`, { token: h.token(buyer), body: { reason: 'Changed my mind' } });
  assert.equal(cancelled.status, 200, cancelled.body?.message);
  assert.equal((await row(id)).stock, 0);
  assert.deepEqual(await movements(id), []);

  // Not a cooking day today: from 8:00 AM of the next one, plus cooking time.
  const manila = new Date(Date.now() + 8 * HOUR);
  const later = (manila.getUTCDay() + 2) % 7;
  const weekly = await create(seller, { productType: 'COOK_TO_ORDER', details: { ...PALUTO, minOrder: 1, cookDays: [later] } });
  assert.equal(weekly.status, 201, weekly.body?.message);
  const next = await pickupOrder(await h.user('BUYER'), store, [{ productId: weekly.body.data.id, quantity: 1 }]);
  assert.equal(next.status, 201, next.body?.message);
  const midnight = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()) - 8 * HOUR;
  assert.equal(new Date(next.body.data.etaFrom).getTime(), midnight + 2 * 24 * HOUR + 8 * HOUR + 45 * MINUTE);

  // With goods in the same order, it is ready when the later of the two is.
  const goods = await h.product(store);
  const mixed = await pickupOrder(await h.user('BUYER'), store, [{ productId: id, quantity: 2 }, { productId: goods.id, quantity: 1 }]);
  assert.equal(mixed.status, 201, mixed.body?.message);
  const only = await pickupOrder(await h.user('BUYER'), store, [{ productId: goods.id, quantity: 1 }]);
  const cookFrom = new Date(mixed.body.data.createdAt).getTime() + 45 * MINUTE;
  const expected = Math.max(new Date(only.body.data.etaFrom).getTime(), cookFrom);
  assert.ok(Math.abs(new Date(mixed.body.data.etaFrom).getTime() - expected) < 5000, 'the later of the goods and the cooking');
  assert.ok(new Date(mixed.body.data.etaTo) >= new Date(only.body.data.etaTo));
});

test('paluto is never counted as out of stock or running low', async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);
  const out = await h.product(store, { stock: 0 });
  const paluto = await h.product(store, { stock: 0, productType: 'COOK_TO_ORDER', details: PALUTO });
  const token = h.token(seller);

  const summary = await h.api('GET', '/products/my/summary', { token });
  assert.equal(summary.body.data.outOfStock, 1);
  const restock = (await h.api('GET', '/products/my/products?stock=restock', { token })).body.data.map((p) => p.id);
  assert.deepEqual(restock, [out.id]);
  const attention = (await h.api('GET', '/stores/my/attention', { token })).body.data;
  assert.equal(attention.find((a) => a.key === 'lowStock')?.count, 1);
  const stats = await h.api('GET', '/analytics/seller', { token });
  const low = (stats.body.data?.lowStock || []).map((p) => p.id);
  assert.ok(low.includes(out.id) && !low.includes(paluto.id), 'the analytics low-stock list leaves paluto out');
});

// ── Couriers and the way of receiving it ────────────────────────────────

test('couriers are refused for live animals, paluto and packages without a weight', async () => {
  const seller = await h.user('SELLER');
  const { store, courier, municipality } = await courierShop(seller);
  const pig = await h.product(store, { name: `Ci Courier Pig ${h.RUN}`, price: 8500, productType: 'LIVESTOCK', details: PIG, stock: 2 });
  const paluto = await h.product(store, { name: `Ci Courier Paluto ${h.RUN}`, stock: 0, productType: 'COOK_TO_ORDER', details: PALUTO });
  const goods = await h.product(store, { name: `Ci Courier Goods ${h.RUN}`, weightGrams: 400 });
  const food = await h.product(store, { name: `Ci Courier Meal ${h.RUN}`, productType: 'PACKAGE', weightGrams: null, stock: 3 });
  const parcel = await h.product(store, { name: `Ci Courier Box ${h.RUN}`, productType: 'PACKAGE', weightGrams: 800, stock: 3 });
  const buyer = await h.user('BUYER');
  const byCourier = { courierId: courier.id, paymentMethod: 'GCASH' };

  const cooked = await deliveryOrder(buyer, store, municipality, [{ productId: paluto.id, quantity: 2 }], byCourier);
  assert.equal(cooked.status, 400);
  assert.equal(cooked.body.message, 'Cooked-to-order food is picked up or delivered by the shop, not by couriers.');
  const meal = await deliveryOrder(buyer, store, municipality, [{ productId: food.id, quantity: 1 }], byCourier);
  assert.equal(meal.status, 400);
  assert.equal(meal.body.message, `${food.name} can't be sent by courier. Choose delivery by the shop or pickup.`);

  const box = await deliveryOrder(buyer, store, municipality, [{ productId: parcel.id, quantity: 1 }, { productId: goods.id, quantity: 1 }], byCourier);
  assert.equal(box.status, 201, box.body?.message);
  assert.equal(box.body.data.courierId, courier.id);

  // Live animals never go through checkout at all: they are bought by
  // agreeing a price with the seller in chat.
  const self = await deliveryOrder(await h.user('BUYER'), store, municipality, [{ productId: pig.id, quantity: 1 }]);
  assert.equal(self.status, 400);
  assert.equal(self.body.message, `${pig.name} is bought by making an offer to the seller`);

  // The quote says so too.
  const quote = await h.api('POST', '/couriers/quote', { body: { storeId: store.id, items: [{ productId: pig.id, quantity: 1 }], municipalityId: municipality.id } });
  assert.equal(quote.status, 200, quote.body?.message);
  assert.deepEqual(quote.body.data.notByCourier, [pig.name]);
  assert.equal(quote.body.data.couriers[0].reason, 'NOT_BY_COURIER');
  assert.equal(quote.body.data.seller.offered, true);

  // Couriers only ask for the weight of goods.
  const delivery = await h.api('GET', '/couriers/my-store', { token: h.token(seller) });
  assert.equal(delivery.status, 200, delivery.body?.message);
  const unweighed = delivery.body.data.unweighed.map((p) => p.id);
  assert.ok(!unweighed.includes(pig.id) && !unweighed.includes(paluto.id) && !unweighed.includes(food.id));
});

test("an order must fit each product's own way of receiving it", async () => {
  const seller = await h.user('SELLER');
  const { store, municipality } = await courierShop(seller);
  const rice = await h.product(store, { name: `Ci Farm Rice ${h.RUN}`, stock: 2, weightGrams: 1000, fulfillment: 'PICKUP' });
  const buyer = await h.user('BUYER');

  const delivered = await deliveryOrder(buyer, store, municipality, [{ productId: rice.id, quantity: 1 }]);
  assert.equal(delivered.status, 400);
  assert.equal(delivered.body.message, `${rice.name} is pickup only`);
  const picked = await pickupOrder(buyer, store, [{ productId: rice.id, quantity: 1 }]);
  assert.equal(picked.status, 201, picked.body?.message);

  const quote = await h.api('POST', '/couriers/quote', { body: { storeId: store.id, items: [{ productId: rice.id, quantity: 1 }] } });
  assert.deepEqual(quote.body.data.pickupOnly, [rice.name]);
  assert.equal(quote.body.data.seller.offered, false);
});

// ── Lists, cart lines and categories ────────────────────────────────────

test('lists take ?type, and the saved cart carries each product\'s kind', async () => {
  const seller = await h.user('SELLER');
  const store = await pickupShop(seller);
  const regular = await h.product(store);
  const pig = await h.product(store, { productType: 'LIVESTOCK', details: PIG, stock: 2 });
  const paluto = await h.product(store, { productType: 'COOK_TO_ORDER', details: PALUTO, stock: 0 });
  // An Available Today product from before kinds: listingKind alone says it.
  const today = await h.product(store, { listingKind: 'TODAY', stock: 0 });
  const token = h.token(seller);
  const ids = async (path, auth) => ((await h.api('GET', path, auth ? { token: auth } : {})).body.data || []).map((p) => p.id).sort();

  assert.deepEqual(await ids(`/products?storeId=${store.id}&type=LIVESTOCK`), [pig.id]);
  assert.deepEqual(await ids(`/products?storeId=${store.id}&type=REGULAR`), [regular.id]);
  assert.deepEqual(await ids(`/products?storeId=${store.id}&type=NOT_A_KIND`), [regular.id, pig.id, paluto.id].sort());
  assert.deepEqual(await ids('/products/my/products?type=COOK_TO_ORDER', token), [paluto.id]);
  assert.deepEqual(await ids('/products/my/products?type=READY_TO_EAT', token), [today.id]);
  assert.deepEqual(await ids('/products/my/products?kind=TODAY', token), [today.id]);
  const mine = (await h.api('GET', '/products/my/products?type=READY_TO_EAT', { token })).body.data[0];
  assert.equal(mine.productType, 'READY_TO_EAT');

  const buyer = await h.user('BUYER');
  await h.api('PUT', '/me/cart', { token: h.token(buyer), body: { items: [{ productId: paluto.id, quantity: 2 }, { productId: pig.id, quantity: 1 }] } });
  const cart = (await h.api('GET', '/me/cart', { token: h.token(buyer) })).body.data;
  const line = cart.find((l) => l.product.id === paluto.id);
  assert.equal(line.product.productType, 'COOK_TO_ORDER');
  assert.equal(line.product.details.minOrder, 2);
  assert.equal(line.product.listingKind, 'REGULAR');
  assert.ok('fulfillment' in line.product);
});

test('categories have a kind a super admin can set', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const { category } = await h.reference();
  const list = await h.api('GET', '/categories');
  assert.ok(list.body.data.every((c) => ['GOODS', 'FOOD', 'LIVESTOCK'].includes(c.kind)));

  const was = (await h.prisma.category.findUnique({ where: { id: category.id } })).kind;
  try {
    const set = await h.api('PUT', `/categories/${category.id}`, { token: h.token(admin), body: { kind: 'food' } });
    assert.equal(set.status, 200, set.body?.message);
    assert.equal(set.body.data.kind, 'FOOD');
    const one = await h.api('GET', `/categories/${category.id}`);
    assert.equal(one.body.data.kind, 'FOOD');
    const bad = await h.api('PUT', `/categories/${category.id}`, { token: h.token(admin), body: { kind: 'MEAT' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, 'Choose goods, food or livestock');
  } finally {
    await h.prisma.category.update({ where: { id: category.id }, data: { kind: was } });
  }

  // A new category takes a kind too. (Saved nowhere: other test files pick
  // "the first category" while they run, so none is added here.)
  const repo = require('../src/repositories/category.repository');
  const realCreate = repo.createCategory;
  repo.createCategory = async (data) => ({ id: 'ci-unsaved', ...data });
  try {
    const made = await h.api('POST', '/categories', { token: h.token(admin), body: { name: `Ci Kind ${h.RUN}`, kind: 'LIVESTOCK' } });
    assert.equal(made.status, 201, made.body?.message);
    assert.equal(made.body.data.kind, 'LIVESTOCK');
    const wrong = await h.api('POST', '/categories', { token: h.token(admin), body: { name: `Ci Kind B ${h.RUN}`, kind: 'TOOLS' } });
    assert.equal(wrong.status, 400);
  } finally {
    repo.createCategory = realCreate;
  }
});
