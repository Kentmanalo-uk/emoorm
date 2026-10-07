const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const supportRepository = require('../src/repositories/supportChat.repository');
const adminMessageRepository = require('../src/repositories/adminMessage.repository');

after(h.cleanup);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test('the support inbox shows each case\'s last message and unread count, and an open case is marked read only when something new arrives', async () => {
  const admin = await h.user('MUNICIPAL_ADMIN');
  const buyer = await h.user('BUYER');
  const asAdmin = h.token(admin);
  const asBuyer = h.token(buyer);
  const open = async (subject, message) => (await h.api('POST', '/support/cases', { token: asBuyer, body: { category: 'ORDER', subject, message } })).body.data.id;
  const say = (token, id, body) => h.api('POST', `/support/cases/${id}/messages`, { token, body: { body } });

  const late = await open('Late delivery', 'Where is my order?');
  const refund = await open('Refund', 'I need a refund.');
  await say(asAdmin, late, 'It ships today.');
  await say(asBuyer, refund, 'Any update?');

  const inbox = await h.api('GET', '/support/inbox?pageSize=50', { token: asAdmin });
  assert.equal(inbox.status, 200, inbox.body?.message);
  const row = (id) => inbox.body.data.find((c) => c.id === id);
  assert.equal(row(late).lastMessage.body, 'It ships today.');
  assert.equal(row(late).lastMessage.senderId, admin.id);
  assert.equal(row(late).awaitingReply, false);
  assert.equal(row(late).unreadCount, 0);
  assert.equal(row(refund).lastMessage.body, 'Any update?');
  assert.equal(row(refund).awaitingReply, true);
  assert.equal(row(refund).unreadCount, 2);
  // The page's counts are the ones each case counts on its own.
  for (const id of [late, refund]) {
    const conversation = await h.prisma.supportConversation.findUnique({ where: { id } });
    assert.equal(row(id).unreadCount, await supportRepository.countUnreadFor({ conversation, side: 'admin' }));
  }

  const mine = await h.api('GET', '/support/cases', { token: asBuyer });
  assert.equal(mine.body.data.find((c) => c.id === late).unreadCount, 1);
  assert.equal(mine.body.data.find((c) => c.id === refund).unreadCount, 0);

  // Opening the case reads it, up to its newest message; polling it again writes nothing.
  const state = () => h.prisma.supportConversation.findUnique({ where: { id: refund }, select: { adminLastReadAt: true, updatedAt: true, lastMessageAt: true } });
  assert.equal((await h.api('GET', `/support/cases/${refund}`, { token: asAdmin })).body.data.unreadCount, 0);
  const read = await state();
  assert.equal(read.adminLastReadAt.getTime(), read.lastMessageAt.getTime());
  await pause(25);
  await h.api('GET', `/support/cases/${refund}`, { token: asAdmin });
  assert.deepEqual(await state(), read);
  // Something new: the next poll moves the marker to it.
  const sent = await say(asBuyer, refund, 'Hello?');
  await h.api('GET', `/support/cases/${refund}`, { token: asAdmin });
  assert.equal((await state()).adminLastReadAt.getTime(), new Date(sent.body.data.createdAt).getTime());
});

test('admin messages: the unread badge is one count, equal to the threads\' own counts on both sides', async () => {
  const superAdmin = await h.user('SUPER_ADMIN');
  const townAdmin = await h.user('MUNICIPAL_ADMIN');
  const asSuper = h.token(superAdmin);
  const asTown = h.token(townAdmin);
  const start = async (subject, body) => (await h.api('POST', '/admin-messages', { token: asSuper, body: { adminId: townAdmin.id, subject, body } })).body.data.id;
  const stalls = await start('Fiesta stalls', 'Please send the stall list.');
  const permits = await start('Permits', 'How many permits are pending?');
  await h.api('POST', `/admin-messages/${stalls}/messages`, { token: asSuper, body: { body: 'By Friday, please.' } });

  const badge = async (token) => (await h.api('GET', '/admin-messages/unread-count', { token })).body.data.count;
  const threadByThread = async (side, adminId) => {
    const conversations = await h.prisma.adminConversation.findMany({ where: adminId ? { adminId } : {} });
    let n = 0;
    for (const conversation of conversations) n += await adminMessageRepository.countUnreadFor({ conversation, side });
    return n;
  };
  assert.equal(await badge(asTown), 3);
  assert.equal(await badge(asTown), await threadByThread('admin', townAdmin.id));

  const list = await h.api('GET', '/admin-messages', { token: asTown });
  const row = (id) => list.body.data.find((c) => c.id === id);
  assert.equal(row(stalls).lastMessage.body, 'By Friday, please.');
  assert.equal(row(stalls).unreadCount, 2);
  assert.equal(row(permits).unreadCount, 1);

  // Reading a thread clears it; polling it again writes nothing.
  await h.api('GET', `/admin-messages/${stalls}`, { token: asTown });
  assert.equal(await badge(asTown), 1);
  const state = () => h.prisma.adminConversation.findUnique({ where: { id: stalls }, select: { adminLastReadAt: true, updatedAt: true } });
  const read = await state();
  await pause(25);
  await h.api('GET', `/admin-messages/${stalls}`, { token: asTown });
  assert.deepEqual(await state(), read);

  // The town admin answers: the super admins' badge counts it.
  const before = await badge(asSuper);
  await h.api('POST', `/admin-messages/${permits}/messages`, { token: asTown, body: { body: 'Twelve are pending.' } });
  assert.equal(await badge(asSuper), before + 1);
  assert.equal(await badge(asSuper), await threadByThread('super'));
});
