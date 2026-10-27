const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const email = require('../src/utils/email');

// Addresses of this file's own, so another file's emails are never touched.
const to = (n) => `ci-outbox-${h.RUN}-${n}@example.test`;

after(async () => {
  email.setDeliverForTests(null);
  await h.prisma.emailOutbox.deleteMany({ where: { to: { startsWith: `ci-outbox-${h.RUN}` } } });
  await h.cleanup();
});

const rows = (address) => h.prisma.emailOutbox.findMany({ where: { to: address } });
const due = (address) => h.prisma.emailOutbox.updateMany({ where: { to: address }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });

test('an email the provider cannot take now is queued, then sent on a later try and removed', async () => {
  email.setDeliverForTests(async () => { throw Object.assign(new Error('fetch failed: ECONNRESET'), { name: 'TypeError' }); });
  const answer = await email.sendMail({ to: to(1), subject: 'Your order', html: '<p>Hi</p>', text: 'Hi' });
  assert.equal(answer.queued, true);
  assert.equal(answer.delivered, false);
  const [queued] = await rows(to(1));
  assert.ok(queued, 'kept in the outbox');
  assert.equal(queued.attempts, 1);
  assert.ok(queued.nextAttemptAt > new Date(), 'tried again later, not at once');
  assert.match(queued.lastError, /ECONNRESET/);

  // Still failing on the next try: the gap grows.
  await due(to(1));
  const first = await email.flushOutbox();
  assert.ok(first.failed >= 1);
  const [again] = await rows(to(1));
  assert.equal(again.attempts, 2);
  assert.ok(again.nextAttemptAt.getTime() - Date.now() > 3 * 60 * 1000);

  // The provider is back: sent, and the row (which may hold a link) is gone.
  const sent = [];
  email.setDeliverForTests(async (m) => { sent.push(m); return { messageId: 'x', delivered: true, transport: 'test' }; });
  await due(to(1));
  const second = await email.flushOutbox();
  assert.ok(second.sent >= 1);
  assert.equal(sent.filter((m) => m.to === to(1)).length, 1);
  assert.equal(sent.find((m) => m.to === to(1)).subject, 'Your order');
  assert.equal((await rows(to(1))).length, 0);
});

test('a refusal for good still throws, and an email with an attachment is not kept', async () => {
  email.setDeliverForTests(async () => { throw Object.assign(new Error('Invalid `to` field'), { name: 'validation_error' }); });
  await assert.rejects(() => email.sendMail({ to: to(2), subject: 'x', text: 'x' }), /Invalid/);
  assert.equal((await rows(to(2))).length, 0);

  email.setDeliverForTests(async () => { throw new Error('timeout'); });
  await assert.rejects(() => email.sendMail({ to: to(3), subject: 'backup', text: 'x', attachments: [{ filename: 'a', content: Buffer.from('a') }] }), /timeout/);
  assert.equal((await rows(to(3))).length, 0);
});

test('after the last try it is given up on (kept with its error), and never sent twice', async () => {
  email.setDeliverForTests(async () => { throw new Error('503 busy'); });
  await email.sendMail({ to: to(4), subject: 'x', text: 'x' });
  await h.prisma.emailOutbox.updateMany({ where: { to: to(4) }, data: { attempts: email.OUTBOX_MAX_ATTEMPTS - 1 } });
  await due(to(4));
  const stats = await email.flushOutbox();
  assert.ok(stats.gaveUp >= 1);
  const [row] = await rows(to(4));
  assert.equal(row.attempts, email.OUTBOX_MAX_ATTEMPTS);
  // Given up on: no later run picks it up.
  await due(to(4));
  let tried = 0;
  email.setDeliverForTests(async (m) => { if (m.to === to(4)) tried += 1; return { delivered: true }; });
  await email.flushOutbox();
  assert.equal(tried, 0);

  // One claimed by another server is left to it.
  email.setDeliverForTests(async () => { throw new Error('down'); });
  await email.sendMail({ to: to(5), subject: 'x', text: 'x' });
  await h.prisma.emailOutbox.updateMany({ where: { to: to(5) }, data: { nextAttemptAt: new Date(Date.now() - 1000), claimedUntil: new Date(Date.now() + 60000) } });
  email.setDeliverForTests(async (m) => { if (m.to === to(5)) tried += 1; return { delivered: true }; });
  await email.flushOutbox();
  assert.equal(tried, 0);
});
