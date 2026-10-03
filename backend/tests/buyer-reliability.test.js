const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('cancellations say why, and the seller sees the buyer\'s record', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');

  const mine = await h.order(buyer, store, [{ product: item }], { status: 'PENDING' });
  assert.equal((await h.api('POST', `/orders/${mine.id}/cancel`, { token: h.token(buyer) })).status, 200);
  const cancelled = await h.prisma.order.findUnique({ where: { id: mine.id }, select: { cancelReason: true, cancelledBy: true } });
  assert.deepEqual(cancelled, { cancelReason: 'BUYER_CANCELLED', cancelledBy: 'BUYER' });

  const early = await h.order(buyer, store, [{ product: item }], { status: 'CONFIRMED' });
  const wrong = await h.api('PUT', `/orders/${early.id}/status`, { token: h.token(seller), body: { status: 'CANCELLED', cancelReason: 'NO_SHOW' } });
  assert.equal(wrong.status, 400);

  const ready = await h.order(buyer, store, [{ product: item }], { status: 'READY_FOR_PICKUP' });
  const noShow = await h.api('PUT', `/orders/${ready.id}/status`, { token: h.token(seller), body: { status: 'CANCELLED', cancelReason: 'NO_SHOW' } });
  assert.equal(noShow.status, 200, noShow.body?.message);
  await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED', completedAt: new Date() });

  const record = await h.api('GET', `/orders/${ready.id}/buyer-record`, { token: h.token(seller) });
  assert.equal(record.status, 200);
  assert.equal(record.body.data.noShows, 1);
  assert.equal(record.body.data.completed, 1);
  assert.equal(record.body.data.cancelledByBuyer, 1);
  assert.equal(record.body.data.fellThrough, 1);

  const stranger = await h.user('SELLER');
  await h.shop(stranger);
  assert.equal((await h.api('GET', `/orders/${ready.id}/buyer-record`, { token: h.token(stranger) })).status, 403);
});
