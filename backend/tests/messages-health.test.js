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

test('the chat list gives each chat its unread count and newest message', async () => {
  const buyer = await h.user('BUYER');
  const sellerA = await h.user('SELLER');
  const sellerB = await h.user('SELLER');
  const storeA = await h.shop(sellerA);
  const storeB = await h.shop(sellerB);
  const now = Date.now();
  const a = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: storeA.id, lastMessageAt: new Date(now - 60e3), buyerLastReadAt: new Date(now - 150e3) } });
  const b = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: storeB.id, lastMessageAt: new Date(now - 30e3) } });
  await h.prisma.message.createMany({ data: [
    { conversationId: a.id, senderId: sellerA.id, body: 'read already', createdAt: new Date(now - 200e3) },
    { conversationId: a.id, senderId: sellerA.id, body: 'new one', createdAt: new Date(now - 100e3) },
    { conversationId: a.id, senderId: buyer.id, body: 'my reply', createdAt: new Date(now - 60e3) },
    { conversationId: b.id, senderId: sellerB.id, body: '', imageUrl: '/uploads/x.jpg', createdAt: new Date(now - 30e3) },
  ] });

  const res = await h.api('GET', '/messages/conversations', { token: h.token(buyer) });
  assert.equal(res.status, 200, res.body?.message);
  assert.deepEqual(res.body.data.map((c) => c.id), [b.id, a.id]);
  const [first, second] = res.body.data;
  assert.deepEqual([first.unreadCount, first.lastMessage.body, first.role], [1, 'Photo', 'buyer']);
  assert.deepEqual([second.unreadCount, second.lastMessage.body, second.lastMessage.senderId], [1, 'my reply', buyer.id]);

  const seller = await h.api('GET', '/messages/conversations', { token: h.token(sellerA) });
  assert.deepEqual(seller.body.data.map((c) => [c.id, c.role, c.unreadCount]), [[a.id, 'seller', 1]]);
});

test('a sender can unsend a message within 5 hours, and only their own; it disappears for both', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const convo = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: store.id, lastMessageAt: new Date() } });
  const earlier = await h.prisma.message.create({ data: { conversationId: convo.id, senderId: seller.id, body: 'Hello! How can I help?', createdAt: new Date(Date.now() - 6 * 3600e3) } });
  const chatUrl = `/messages/conversations/${convo.id}`;
  const msgUrl = (mid) => `${chatUrl}/messages/${mid}`;

  const sent = await h.api('POST', `${chatUrl}/messages`, { token: h.token(buyer), body: { body: 'oops, wrong chat' } });
  assert.equal(sent.status, 201, sent.body?.message);
  const id = sent.body.data.id;
  const note = await h.prisma.notification.findFirst({ where: { relatedId: convo.id, type: 'STORE_MESSAGE' } });
  assert.equal(note?.message, 'oops, wrong chat');

  // Not the other side's to take back.
  const theirs = await h.api('DELETE', msgUrl(id), { token: h.token(seller) });
  assert.equal(theirs.status, 403, JSON.stringify(theirs.body));

  const unsent = await h.api('DELETE', msgUrl(id), { token: h.token(buyer) });
  assert.equal(unsent.status, 200, unsent.body?.message);
  // Hidden from both, kept for moderators (erased after 30 days).
  assert.ok((await h.prisma.message.findUnique({ where: { id } }))?.unsentAt);
  const again = await h.api('DELETE', msgUrl(id), { token: h.token(buyer) });
  assert.equal(again.status, 404);

  // Gone for both: not in the chat, the list shows the message before it, no notification.
  const view = await h.api('GET', chatUrl, { token: h.token(seller) });
  assert.deepEqual(view.body.data.messages.map((m) => m.id), [earlier.id]);
  const list = await h.api('GET', '/messages/conversations', { token: h.token(seller) });
  const row = list.body.data.find((c) => c.id === convo.id);
  assert.equal(row.lastMessage.body, 'Hello! How can I help?');
  assert.equal(new Date(row.lastMessageAt).getTime(), earlier.createdAt.getTime());
  const removed = await h.prisma.notification.findUnique({ where: { id: note.id } });
  assert.ok(removed.deletedAt);

  // Four hours old: still allowed. Over five: too late.
  const recent = await h.prisma.message.create({ data: { conversationId: convo.id, senderId: buyer.id, body: 'recent', createdAt: new Date(Date.now() - 4 * 3600e3) } });
  const ok = await h.api('DELETE', msgUrl(recent.id), { token: h.token(buyer) });
  assert.equal(ok.status, 200, ok.body?.message);
  const old = await h.prisma.message.create({ data: { conversationId: convo.id, senderId: buyer.id, body: 'old', createdAt: new Date(Date.now() - 5 * 3600e3 - 60e3) } });
  const late = await h.api('DELETE', msgUrl(old.id), { token: h.token(buyer) });
  assert.equal(late.status, 400);
});
