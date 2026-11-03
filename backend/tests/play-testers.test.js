const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const email = require('../src/utils/email');

const sent = [];
email.setDeliverForTests(async (m) => { sent.push(m); return { messageId: 'x', delivered: true, transport: 'test' }; });

const stamp = Date.now();
const address = (n) => `tester.${stamp}.${n}@gmail.com`;
after(async () => {
  email.setDeliverForTests(null);
  await h.prisma.playTester.deleteMany({ where: { email: { startsWith: `tester.${stamp}.` } } });
  await h.cleanup();
});

test('anyone can leave a Gmail; twice is the same entry; a bad address is refused', async () => {
  const first = await h.api('POST', '/app/testers', { body: { email: `  ${address(1).toUpperCase()} ` } });
  assert.equal(first.status, 201, first.body?.message);
  assert.deepEqual(first.body.data, { email: address(1), added: false });

  const buyer = await h.user('BUYER');
  const again = await h.api('POST', '/app/testers', { body: { email: address(1) }, token: h.token(buyer) });
  assert.equal(again.status, 201);
  const rows = await h.prisma.playTester.findMany({ where: { email: address(1) } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, buyer.id, 'signed in now: linked to the account');

  for (const bad of ['', 'not-an-email', 'a@b', `${'x'.repeat(200)}@gmail.com`]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await h.api('POST', '/app/testers', { body: { email: bad } });
    assert.equal(res.status, 400, bad);
  }
});

test('only the super admin sees the list, marks people added (they are emailed) and removes them', async () => {
  await h.api('POST', '/app/testers', { body: { email: address(2) } });
  await h.api('POST', '/app/testers', { body: { email: address(3) } });

  assert.equal((await h.api('GET', '/app/testers')).status, 401);
  const buyer = await h.user('BUYER');
  assert.equal((await h.api('GET', '/app/testers', { token: h.token(buyer) })).status, 403);
  const muni = await h.user('MUNICIPAL_ADMIN');
  assert.equal((await h.api('POST', '/app/testers/added', { token: h.token(muni), body: { ids: [] } })).status, 403);

  const boss = await h.user('SUPER_ADMIN');
  const list = await h.api('GET', '/app/testers', { token: h.token(boss) });
  assert.equal(list.status, 200, list.body?.message);
  assert.match(list.body.data.joinUrl, /play\.google\.com\/apps\/testing\/shop\.emoorm\.app$/);
  const two = list.body.data.testers.find((t) => t.email === address(2));
  const three = list.body.data.testers.find((t) => t.email === address(3));
  assert.ok(two && three && !two.addedAt);

  sent.length = 0;
  const marked = await h.api('POST', '/app/testers/added', { token: h.token(boss), body: { ids: [two.id] } });
  assert.equal(marked.status, 200, marked.body?.message);
  assert.deepEqual(marked.body.data, { marked: 1, emailed: 1, failed: [] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, address(2));
  assert.match(sent[0].text, /apps\/testing\/shop\.emoorm\.app/);

  // Already added: not emailed again.
  const repeat = await h.api('POST', '/app/testers/added', { token: h.token(boss), body: { ids: [two.id] } });
  assert.equal(repeat.body.data.marked, 0);
  assert.equal(sent.length, 1);

  // Asking again once added says so.
  const joined = await h.api('POST', '/app/testers', { body: { email: address(2) } });
  assert.equal(joined.body.data.added, true);

  assert.equal((await h.api('DELETE', `/app/testers/${three.id}`, { token: h.token(boss) })).status, 200);
  assert.equal((await h.api('DELETE', `/app/testers/${three.id}`, { token: h.token(boss) })).status, 404);
});
