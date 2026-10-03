const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const readyShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 3', acceptsCod: true },
});
const orderWith = (buyer, store, item, voucherCode) => h.api('POST', '/orders', {
  token: h.token(buyer),
  body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', voucherCode, items: [{ productId: item.id, quantity: 3 }] },
});

test('a shop voucher works on its own shop only, and shows on its page', async () => {
  const seller = await h.user('SELLER');
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100 });
  const otherStore = await readyShop(await h.user('SELLER'));
  const otherItem = await h.product(otherStore, { price: 100 });
  const buyer = await h.user('BUYER');
  const code = `CI${h.RUN}`.slice(0, 20);

  const made = await h.api('POST', '/vouchers/shop', {
    token: h.token(seller),
    body: { code, discountType: 'FIXED', discountValue: 20, minOrderAmount: 200, perUserLimit: 1 },
  });
  assert.equal(made.status, 201, made.body?.message);
  assert.equal(made.body.data.storeId, store.id);

  const listed = await h.api('GET', `/vouchers/store/${store.id}`);
  assert.deepEqual(listed.body.data.map((v) => v.code), [code]);
  const admin = await h.user('SUPER_ADMIN');
  const adminList = await h.api('GET', '/vouchers?pageSize=100', { token: h.token(admin) });
  assert.ok(!adminList.body.data.items.some((v) => v.code === code));

  const elsewhere = await orderWith(buyer, otherStore, otherItem, code);
  assert.equal(elsewhere.status, 400);
  assert.match(elsewhere.body.message, /only/);
  const check = await h.api('POST', '/vouchers/validate', { token: h.token(buyer), body: { code, subtotal: 300, storeId: otherStore.id } });
  assert.equal(check.status, 400);

  const here = await orderWith(buyer, store, item, code);
  assert.equal(here.status, 201, here.body?.message);
  assert.equal(Number(here.body.data.discountAmount), 20);
  assert.equal(Number(here.body.data.total), 280);

  // Used once: deleting turns it off instead.
  const del = await h.api('DELETE', `/vouchers/shop/${made.body.data.id}`, { token: h.token(seller) });
  assert.equal(del.body.data.isActive, false);
  // Another seller cannot touch it.
  const stranger = await h.api('PUT', `/vouchers/shop/${made.body.data.id}`, { token: h.token(await h.user('SELLER')), body: { isActive: true } });
  assert.notEqual(stranger.status, 200);
});
