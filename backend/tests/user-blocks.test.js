// Blocking: one person deciding they will not deal with another.
//
// Three things this has to get right, and each has a test of its own:
//   - it holds from both sides, whoever drew the line
//   - it stops messages and new orders, and nothing else
//   - it never stops a report. Being unable to deal with someone must not
//     mean being unable to report them.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(() => h.cleanup().then(() => h.prisma.$disconnect()));

async function pair() {
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const store = await h.shop(seller);
  return { seller, buyer, store };
}

const openChat = (who, storeId) =>
  h.api('POST', '/messages/conversations', { token: h.token(who), body: { storeId } });

test('a block holds from both sides', async () => {
  const { seller, buyer, store } = await pair();

  // They are talking happily first.
  const before = await openChat(buyer, store.id);
  assert.equal(before.status, 200);
  const conversationId = before.body.data.id;

  // The seller has had enough of this buyer.
  const blocked = await h.api('POST', `/blocks/${buyer.id}`, {
    token: h.token(seller),
    body: { reason: 'abusive' },
  });
  assert.equal(blocked.status, 200);

  // The buyer, who did not block anyone, cannot write.
  const buyerTry = await h.api('POST', `/messages/conversations/${conversationId}/messages`, {
    token: h.token(buyer), body: { body: 'hello?' },
  });
  assert.equal(buyerTry.status, 403, 'the blocked person cannot send');

  // Nor can the seller, who did. A line drawn is a line for both.
  const sellerTry = await h.api('POST', `/messages/conversations/${conversationId}/messages`, {
    token: h.token(seller), body: { body: 'stop messaging me' },
  });
  assert.equal(sellerTry.status, 403, 'the blocker cannot send either');

  // Opening a fresh thread is not a way round it.
  const fresh = await openChat(buyer, store.id);
  assert.equal(fresh.status, 403, 'no starting over');

  // Both can still read the history.
  const read = await h.api('GET', `/messages/conversations/${conversationId}`, { token: h.token(buyer) });
  assert.equal(read.status, 200, 'the conversation is not destroyed');
});

test('a block stops a new order', async () => {
  const { seller, buyer, store } = await pair();
  const product = await h.product(store);

  await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(seller) });

  const order = await h.api('POST', '/orders', {
    token: h.token(buyer),
    body: {
      storeId: store.id,
      items: [{ productId: product.id, quantity: 1 }],
      fulfillmentMethod: 'PICKUP',
      paymentMethod: 'COD',
      contactNumber: '09171234567',
    },
  });
  assert.equal(order.status, 403, 'a blocked buyer cannot order');
});

test('a block never stops a report', async () => {
  const { seller, buyer, store } = await pair();
  await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(seller) });

  // The whole point: the person shut out can still raise a hand.
  const report = await h.api('POST', '/reports', {
    token: h.token(buyer),
    body: {
      type: 'SELLER',
      reportedSellerId: seller.id,
      reason: 'ABUSIVE_BEHAVIOR',
      description: 'They blocked me after being rude.',
    },
  });
  assert.ok([200, 201].includes(report.status), `reporting still works (got ${report.status})`);
});

test('unblocking lets them back in', async () => {
  const { seller, buyer, store } = await pair();
  await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(seller) });
  assert.equal((await openChat(buyer, store.id)).status, 403);

  const un = await h.api('DELETE', `/blocks/${buyer.id}`, { token: h.token(seller) });
  assert.equal(un.status, 200);

  assert.equal((await openChat(buyer, store.id)).status, 200, 'they can talk again');
});

test('blocking is idempotent, and tells each side where it stands', async () => {
  const { seller, buyer } = await pair();

  // Twice is not an error: they wanted them blocked, and they are.
  assert.equal((await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(seller) })).status, 200);
  assert.equal((await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(seller) })).status, 200);
  assert.equal(await h.prisma.userBlock.count({ where: { blockerId: seller.id, blockedId: buyer.id } }), 1);

  const mine = await h.api('GET', `/blocks/status/${buyer.id}`, { token: h.token(seller) });
  assert.deepEqual(mine.body.data, { blocking: true, blockedByThem: false, canInteract: false });

  // The blocked person is told plainly, rather than left wondering why
  // their messages vanish.
  const theirs = await h.api('GET', `/blocks/status/${seller.id}`, { token: h.token(buyer) });
  assert.deepEqual(theirs.body.data, { blocking: false, blockedByThem: true, canInteract: false });

  // Unblocking something that was never blocked is fine too.
  const other = await h.user('BUYER');
  assert.equal((await h.api('DELETE', `/blocks/${other.id}`, { token: h.token(seller) })).status, 200);
});

test('you cannot block yourself, or an administrator', async () => {
  const { buyer } = await pair();
  const admin = await h.user('MUNICIPAL_ADMIN');

  assert.equal((await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(buyer) })).status, 400);
  // Blocking an admin would cut off the only route to support.
  assert.equal((await h.api('POST', `/blocks/${admin.id}`, { token: h.token(buyer) })).status, 400);
  assert.equal((await h.api('POST', '/blocks/no-such-user', { token: h.token(buyer) })).status, 404);
});

test('my block list shows who I shut out, and is mine alone', async () => {
  const { seller, buyer } = await pair();
  await h.api('POST', `/blocks/${buyer.id}`, { token: h.token(seller), body: { reason: 'rude' } });

  const list = await h.api('GET', '/blocks/me', { token: h.token(seller) });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].blocked.id, buyer.id);
  assert.equal(list.body.data[0].reason, 'rude');

  // The person blocked sees nothing of it in their own list.
  const theirs = await h.api('GET', '/blocks/me', { token: h.token(buyer) });
  assert.equal(theirs.body.data.length, 0);
});
