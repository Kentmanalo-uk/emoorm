const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('a long chat shows its newest 100 messages, and earlier ones on request', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const convo = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: store.id, lastMessageAt: new Date() } });
  const start = Date.now() - 200 * 60e3;
  await h.prisma.message.createMany({ data: Array.from({ length: 130 }, (_, i) => ({ conversationId: convo.id, senderId: i % 2 ? buyer.id : seller.id, body: `msg ${i + 1}`, createdAt: new Date(start + i * 60e3) })) });
  const first = await h.api('GET', `/messages/conversations/${convo.id}`, { token: h.token(buyer) });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.messages.length, 100);
  assert.equal(first.body.data.messages.at(-1).body, 'msg 130');
  assert.equal(first.body.data.hasEarlier, true);
  const earlier = await h.api('GET', `/messages/conversations/${convo.id}?before=${encodeURIComponent(first.body.data.messages[0].createdAt)}`, { token: h.token(buyer) });
  assert.equal(earlier.body.data.messages.length, 30);
  assert.equal(earlier.body.data.hasEarlier, false);
  const unread = await h.api('GET', '/messages/unread-count', { token: h.token(buyer) });
  assert.equal(unread.body.data.count, 1);
});

test('a malformed query is a 400, not a server error', async () => {
  const res = await h.api('GET', '/products?storeId=a&storeId=b');
  assert.equal(res.status, 400);
});

test('/health reports the database', async () => {
  const base = await h.startApp();
  const res = await fetch(base.replace(/\/api$/, '/health'));
  const body = await res.json();
  assert.equal(body.database, 'up');
});
