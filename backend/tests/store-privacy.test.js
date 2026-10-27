const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const PRIVATE = ['paymentAccountNumber', 'paymentAccountName', 'paymentQrImage', 'paymentInstructions', 'suspensionReason', 'deletionRequestedAt', 'sellerGuides'];

test('a shop\'s payment details are only for a buyer paying it by QR', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({
    where: { id: store.id },
    data: {
      isActive: true,
      isApproved: true,
      paymentQrImage: '/uploads/ci-qr.png',
      paymentQrType: 'GCASH',
      paymentAccountName: 'Maria Ci',
      paymentAccountNumber: '09170000000',
      paymentInstructions: 'Send to 09170000000',
      suspensionReason: 'old note',
    },
  });

  // The public: no payment details or moderation fields, but it may know
  // the shop takes GCash.
  const anon = await h.api('GET', `/stores/${store.id}`);
  assert.equal(anon.status, 200, anon.body?.message);
  for (const key of PRIVATE) assert.equal(key in anon.body.data, false, `${key} is public`);
  assert.equal(anon.body.data.hasPaymentQr, true);
  assert.equal(anon.body.data.paymentQrType, 'GCASH');
  const bySlug = await h.api('GET', `/stores/slug/${store.slug}`);
  for (const key of PRIVATE) assert.equal(key in bySlug.body.data, false, `${key} is public by slug`);
  const front = await h.api('GET', `/stores/slug/${store.slug}/storefront`);
  for (const key of PRIVATE) assert.equal(key in front.body.data, false, `${key} is public on the storefront`);
  const list = await h.api('GET', `/stores?search=${encodeURIComponent(store.name)}`);
  const row = list.body.data.find((s) => s.id === store.id);
  assert.ok(row, 'the shop is in the directory');
  for (const key of PRIVATE) assert.equal(key in row, false, `${key} is public in the list`);

  // A signed-in buyer without an order there: still nothing.
  const stranger = await h.user('BUYER');
  const seen = await h.api('GET', `/stores/${store.id}`, { token: h.token(stranger) });
  assert.equal('paymentAccountNumber' in seen.body.data, false);

  // A buyer with a GCash order at the shop: the details to pay with.
  const buyer = await h.user('BUYER');
  const product = await h.product(store);
  await h.order(buyer, store, [{ product }], { paymentMethod: 'GCASH' });
  const paying = await h.api('GET', `/stores/${store.id}`, { token: h.token(buyer) });
  assert.equal(paying.body.data.paymentAccountNumber, '09170000000');
  assert.equal(paying.body.data.paymentQrImage, '/uploads/ci-qr.png');
  assert.equal('suspensionReason' in paying.body.data, false);
});
