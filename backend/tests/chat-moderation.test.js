// Chat moderation: a message whose words match the list is still delivered,
// and a flag is raised for an admin to look at.
//
// The delivery half is the point. A word list is a guess, and a guess must
// never be able to stop two people talking -- so every test here that proves
// a flag was raised also proves the message arrived.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const messageService = require('../src/services/message.service');

after(() => h.cleanup().then(() => h.prisma.$disconnect()));

// A buyer and a shop with a conversation already open between them.
async function chatting() {
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const store = await h.shop(seller);
  const opened = await h.api('POST', '/messages/conversations', {
    token: h.token(buyer),
    body: { storeId: store.id },
  });
  assert.equal(opened.status, 200, 'conversation opens');
  return { seller, buyer, store, conversationId: opened.body.data.id };
}

const say = (who, conversationId, body) =>
  h.api('POST', `/messages/conversations/${conversationId}/messages`, {
    token: h.token(who),
    body: { body },
  });

test('an ordinary message is delivered and not flagged', async () => {
  const { buyer, conversationId } = await chatting();

  const sent = await say(buyer, conversationId, 'Magandang umaga po, available pa po ba ito?');
  assert.equal(sent.status, 201);

  const row = await h.prisma.message.findUnique({ where: { id: sent.body.data.id } });
  assert.equal(row.flaggedAt, null, 'nothing to answer for');
  const flag = await h.prisma.messageFlag.findUnique({ where: { messageId: row.id } });
  assert.equal(flag, null, 'no queue entry');
});

test('a message with a bad word is delivered AND flagged', async () => {
  const { buyer, store, conversationId } = await chatting();

  const sent = await say(buyer, conversationId, 'gago ka ba, ang bagal mo');
  // Delivered. This is the assertion that matters most in the whole file.
  assert.equal(sent.status, 201, 'the message still goes through');
  assert.ok(sent.body.data.id);

  const row = await h.prisma.message.findUnique({ where: { id: sent.body.data.id } });
  assert.ok(row.flaggedAt, 'the message carries its own judgement');
  assert.equal(row.body, 'gago ka ba, ang bagal mo', 'stored exactly as typed');

  const flag = await h.prisma.messageFlag.findUnique({ where: { messageId: row.id } });
  assert.ok(flag, 'a queue entry exists');
  assert.equal(flag.status, 'PENDING');
  assert.ok(flag.matched.includes('gago'), 'the admin is told what matched');
  assert.equal(flag.municipalityId, store.municipalityId, "routed to the shop's town");

  // And the recipient can read it, which is the whole point of delivering it.
  const thread = await h.api('GET', `/messages/conversations/${conversationId}`, { token: h.token(buyer) });
  assert.ok(thread.body.data.messages.some((m) => m.id === row.id));
});

test('an ordinary word that merely contains a swear is left alone', async () => {
  const { buyer, conversationId } = await chatting();

  const sent = await say(buyer, conversationId, 'maganda po ang reputasyon ng tindahan ninyo');
  assert.equal(sent.status, 201);

  const row = await h.prisma.message.findUnique({ where: { id: sent.body.data.id } });
  assert.equal(row.flaggedAt, null, 'reputasyon is not an insult');
});

test('enough flags and chat closes, but the account keeps working', async () => {
  const { buyer, conversationId } = await chatting();

  for (let i = 0; i < messageService.CHAT_STRIKE_LIMIT; i += 1) {
    const sent = await say(buyer, conversationId, `tanga ${i}`);
    assert.equal(sent.status, 201, `strike ${i + 1} is still delivered`);
  }

  const after3 = await h.prisma.user.findUnique({
    where: { id: buyer.id },
    select: { chatRestrictedUntil: true, chatStrikes: true, isActive: true },
  });
  assert.ok(after3.chatRestrictedUntil > new Date(), 'chat is shut');
  assert.equal(after3.chatStrikes, 0, 'the counter starts again');
  // The part that must never happen automatically.
  assert.equal(after3.isActive, true, 'the account itself is untouched');

  const blocked = await say(buyer, conversationId, 'hello po');
  assert.equal(blocked.status, 403, 'they cannot send while paused');

  const thread = await h.api('GET', `/messages/conversations/${conversationId}`, { token: h.token(buyer) });
  assert.equal(thread.status, 200, 'they can still read what was said');
});

test('the sender is told, and the flag can be found by sender', async () => {
  const { buyer, conversationId } = await chatting();
  await say(buyer, conversationId, 'bobo naman');

  const notice = await h.prisma.notification.findFirst({
    where: { userId: buyer.id, type: 'SYSTEM_ANNOUNCEMENT' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(notice, 'they are warned rather than silently marked');
  assert.match(notice.title, /respectful/i);

  const mine = await h.prisma.messageFlag.count({ where: { senderId: buyer.id } });
  assert.equal(mine, 1);
});
