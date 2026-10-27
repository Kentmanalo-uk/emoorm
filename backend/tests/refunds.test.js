const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const returnService = require('../src/services/return.service');

after(() => h.cleanup());

let seq = 0;
const approvedReturn = (order, amount) => {
  seq += 1;
  return h.prisma.returnRequest.create({
    data: {
      requestNumber: `RR-CI-${h.RUN}-${seq}`,
      orderId: order.id,
      buyerId: order.buyerId,
      storeId: order.storeId,
      status: 'APPROVED',
      reason: 'DAMAGED',
      requestedAmount: amount,
      approvedAmount: amount,
    },
  });
};

const paymentOf = async (orderId) => (await h.prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } })).paymentStatus;

test('a refund and the order\'s payment status change together; two at once add up', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const actor = { id: seller.id, storeId: store.id };

  // Two returns of one ₱200 order, refunded at the same moment: together
  // they cover it, so the order ends fully refunded.
  const order = await h.order(buyer, store, [{ product: item, quantity: 2 }], { status: 'COMPLETED', paymentStatus: 'PAID' });
  const a = await approvedReturn(order, 100);
  const b = await approvedReturn(order, 100);
  const [ra, rb] = await Promise.all([
    returnService.markRefunded(a.id, actor, { refundMethod: 'GCASH', refundReference: 'A1' }),
    returnService.markRefunded(b.id, actor, { refundMethod: 'GCASH', refundReference: 'B1' }),
  ]);
  assert.equal(ra.status, 'REFUNDED');
  assert.equal(rb.status, 'REFUNDED');
  assert.equal(await paymentOf(order.id), 'REFUNDED');

  // One of two: partly refunded.
  const other = await h.order(buyer, store, [{ product: item, quantity: 2 }], { status: 'COMPLETED', paymentStatus: 'PAID' });
  const c = await approvedReturn(other, 50);
  await returnService.markRefunded(c.id, actor, { refundMethod: 'MANUAL' });
  assert.equal(await paymentOf(other.id), 'PARTIALLY_REFUNDED');

  // Refunding again is refused, and changes nothing.
  await assert.rejects(() => returnService.markRefunded(c.id, actor, { refundMethod: 'MANUAL' }));
  assert.equal(await paymentOf(other.id), 'PARTIALLY_REFUNDED');
});
