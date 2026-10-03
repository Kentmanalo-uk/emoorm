const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

test('a buyer asks, the shop answers, and everyone sees the answer', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const other = await h.user('BUYER');

  assert.equal((await h.api('POST', `/questions/product/${item.id}`, { token: h.token(seller), body: { question: 'Is my own product good?' } })).status, 400);
  const asked = await h.api('POST', `/questions/product/${item.id}`, { token: h.token(buyer), body: { question: 'How ripe are the mangoes?' } });
  assert.equal(asked.status, 201, asked.body?.message);
  const notice = await h.prisma.notification.findFirst({ where: { userId: seller.id, type: 'PRODUCT_QUESTION' } });
  assert.equal(notice.audience, 'SELLER');

  // Not answered yet: the asker sees it, others do not.
  assert.equal((await h.api('GET', `/questions/product/${item.id}`, { token: h.token(buyer) })).body.data.items.length, 1);
  assert.equal((await h.api('GET', `/questions/product/${item.id}`, { token: h.token(other) })).body.data.items.length, 0);

  const inbox = await h.api('GET', '/questions/store', { token: h.token(seller) });
  assert.equal(inbox.body.data.open, 1);
  const qid = inbox.body.data.items[0].id;
  const stranger = await h.user('SELLER');
  await h.shop(stranger);
  assert.equal((await h.api('POST', `/questions/${qid}/answer`, { token: h.token(stranger), body: { answer: 'Mine now' } })).status, 404);
  const answered = await h.api('POST', `/questions/${qid}/answer`, { token: h.token(seller), body: { answer: 'Ripe in two days.' } });
  assert.equal(answered.status, 200);

  const seen = await h.api('GET', `/questions/product/${item.id}`);
  assert.equal(seen.body.data.items[0].answer, 'Ripe in two days.');
  assert.match(seen.body.data.items[0].askedBy, /^Ci$/);
  assert.equal(await h.prisma.notification.count({ where: { userId: buyer.id, type: 'PRODUCT_ANSWER' } }), 1);

  await h.api('POST', `/questions/${qid}/hide`, { token: h.token(seller) });
  assert.equal((await h.api('GET', `/questions/product/${item.id}`)).body.data.items.length, 0);
});
