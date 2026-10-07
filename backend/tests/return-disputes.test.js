const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

// A completed order, a return request, and the seller's rejection.
const rejectedReturn = async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const o = await h.order(buyer, store, [{ product: item, quantity: 1 }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
  const made = await h.api('POST', '/returns', { token: h.token(buyer), body: { orderId: o.id, reason: 'DAMAGED', buyerNote: 'Cracked jar', items: [{ orderItemId: o.items[0].id, quantity: 1 }] } });
  assert.equal(made.status, 201, made.body?.message);
  const id = made.body.data.id;
  const rej = await h.api('PATCH', `/returns/${id}/decision`, { token: h.token(seller), body: { action: 'REJECT', sellerNote: 'Looks fine to us' } });
  assert.equal(rej.status, 200, rej.body?.message);
  return { id, buyer, seller, store };
};

test('a rejected return goes to the town admin, who can decide for the buyer', async () => {
  const { id, buyer, store } = await rejectedReturn();
  assert.equal((await h.api('POST', `/returns/${id}/dispute`, { token: h.token(buyer), body: { reason: 'short' } })).status, 400);
  const disputed = await h.api('POST', `/returns/${id}/dispute`, { token: h.token(buyer), body: { reason: 'The photo shows the jar arrived cracked.' } });
  assert.equal(disputed.status, 200, disputed.body?.message);
  assert.equal(disputed.body.data.status, 'DISPUTED');

  const elsewhere = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: (await h.otherTown(store.municipalityId)).id } } });
  assert.equal((await h.api('POST', `/returns/${id}/resolve-dispute`, { token: h.token(elsewhere), body: { decision: 'BUYER', note: 'Approved.' } })).status, 403);

  const admin = await h.user('MUNICIPAL_ADMIN');
  const decided = await h.api('POST', `/returns/${id}/resolve-dispute`, { token: h.token(admin), body: { decision: 'BUYER', note: 'The photos show damage.', approvedAmount: 80, requiresPhysicalReturn: true } });
  assert.equal(decided.status, 200, decided.body?.message);
  assert.equal(decided.body.data.status, 'AWAITING_SHIPMENT');
  assert.equal(Number(decided.body.data.approvedAmount), 80);
  assert.match(decided.body.data.disputeResolution, /For the buyer/);
  const told = await h.prisma.notification.count({ where: { userId: buyer.id, type: 'RETURN_DISPUTE_RESOLVED' } });
  assert.equal(told, 1);
  // The ruling is in the audit trail, under the shop's town.
  const logged = await h.prisma.auditLog.findFirst({ where: { action: 'RESOLVE_RETURN_DISPUTE', entityId: id } });
  assert.equal(logged.userId, admin.id);
  assert.equal(logged.municipalityId, store.municipalityId);
  assert.equal(logged.details.decision, 'BUYER');
  assert.equal(logged.details.approvedAmount, 80);
  assert.equal(logged.details.note, 'The photos show damage.');
});

test('the admin can keep the rejection, which closes the return', async () => {
  const { id, buyer, store } = await rejectedReturn();
  await h.api('POST', `/returns/${id}/dispute`, { token: h.token(buyer), body: { reason: 'It was not what the photos showed.' } });
  const admin = await h.user('SUPER_ADMIN');
  const decided = await h.api('POST', `/returns/${id}/resolve-dispute`, { token: h.token(admin), body: { decision: 'SELLER', note: 'The item matches the listing.' } });
  assert.equal(decided.body.data.status, 'CLOSED');
  // A super admin's ruling still shows on that town's audit log.
  const logged = await h.prisma.auditLog.findFirst({ where: { action: 'RESOLVE_RETURN_DISPUTE', entityId: id } });
  assert.equal(logged.municipalityId, store.municipalityId);
  assert.equal(logged.details.decision, 'SELLER');
  assert.equal(logged.details.approvedAmount, null);
});

test('a rejection cannot be disputed after a week', async () => {
  const { id, buyer } = await rejectedReturn();
  await h.prisma.returnRequest.update({ where: { id }, data: { decidedAt: h.daysAgo(8) } });
  const late = await h.api('POST', `/returns/${id}/dispute`, { token: h.token(buyer), body: { reason: 'I only just saw the rejection.' } });
  assert.equal(late.status, 400);
});
