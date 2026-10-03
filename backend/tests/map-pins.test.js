const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('an address can carry a map pin in the Philippines', async () => {
  const buyer = await h.user('BUYER');
  const { municipality } = await h.reference();
  const base = { fullName: 'Ci Buyer', contactNumber: '09171234567', municipalityId: municipality.id, barangay: 'Poblacion', street: 'Purok 1' };
  const token = h.token(buyer);
  assert.equal((await h.api('POST', '/addresses', { token, body: { ...base, latitude: 51.5, longitude: -0.12 } })).status, 400);
  assert.equal((await h.api('POST', '/addresses', { token, body: { ...base, latitude: 13 } })).status, 400);
  const ok = await h.api('POST', '/addresses', { token, body: { ...base, latitude: 13.1234567, longitude: 121.3 } });
  assert.equal(ok.status, 201, ok.body?.message);
  assert.equal(ok.body.data.latitude, 13.123457);
});

test('a delivery order keeps the pin for the rider', async () => {
  const { municipality } = await h.reference();
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({ where: { id: store.id }, data: { fulfillmentMode: 'DELIVERY', selfDelivery: true, deliveryFee: 30, acceptsCod: true } });
  await h.prisma.storeServiceArea.create({ data: { storeId: store.id, municipalityId: municipality.id, barangay: null, fee: 30 } });
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const res = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id,
      fulfillmentMethod: 'DELIVERY',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
      deliveryAddress: `Purok 1, Poblacion, ${municipality.name}, Oriental Mindoro`,
      buyerMunicipalityId: municipality.id,
      buyerBarangay: 'Poblacion',
      deliveryLatitude: 13.05,
      deliveryLongitude: 121.4,
      items: [{ productId: item.id, quantity: 1 }],
    },
  });
  assert.equal(res.status, 201, res.body?.message);
  const saved = await h.prisma.order.findUnique({ where: { id: res.body.data.id }, select: { deliveryLatitude: true, deliveryLongitude: true } });
  assert.deepEqual(saved, { deliveryLatitude: 13.05, deliveryLongitude: 121.4 });
});
