const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const h = require('./helpers');
const counters = require('../src/lib/securityCounters');
const { makeGuard } = require('../src/utils/attemptGuard');

const tag = `ci-${h.RUN}`;
after(async () => {
  await h.prisma.securityCounter.deleteMany({ where: { name: { contains: tag } } });
  await h.cleanup();
});

test('a counter counts every hit, also many at once, and starts again once it ends', async () => {
  const name = `t:${tag}:burst`;
  const answers = await Promise.all(Array.from({ length: 10 }, () => counters.hit(name, 60000)));
  assert.equal((await counters.peek(name)).hits, 10);
  // Each hit gets its own count: one request is first, never two.
  assert.deepEqual(answers.map((r) => r.hits).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // Ended: the next hit is the first of a new window.
  await h.prisma.securityCounter.update({ where: { name }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await counters.peek(name), null);
  assert.equal((await counters.hit(name, 60000)).hits, 1);
  // A name too long for the column is kept by its hash, the same each time.
  const long = `t:${tag}:${'x'.repeat(300)}`;
  await counters.hit(long, 60000);
  assert.equal((await counters.hit(long, 60000)).hits, 2);
  assert.ok(counters.nameOf(long).length <= 191);
});

test('a kept rate limit still refuses after a restart', async () => {
  const limiter = () => rateLimit({ store: new counters.CounterStore(`t-${tag}`), windowMs: 60000, max: 3, standardHeaders: true, legacyHeaders: false });
  const serve = (mw) => new Promise((resolve) => {
    const app = express();
    app.get('/x', mw, (req, res) => res.json({ ok: true }));
    const server = app.listen(0, () => resolve(server));
  });
  const ask = (server) => fetch(`http://127.0.0.1:${server.address().port}/x`).then((r) => r.status);
  let server = await serve(limiter());
  const first = [];
  for (let i = 0; i < 4; i += 1) first.push(await ask(server)); // eslint-disable-line no-await-in-loop
  assert.deepEqual(first, [200, 200, 200, 429]);
  await new Promise((r) => { server.close(r); });
  // A new process would build a new limiter: the count is still there.
  server = await serve(limiter());
  assert.equal(await ask(server), 429);
  await new Promise((r) => { server.close(r); });
});

test('a sign-in lock outlives a restart', async () => {
  const guard = makeGuard({ name: `t-login-${tag}`, limit: 3, windowMs: 60000 });
  for (let i = 0; i < 3; i += 1) await guard.fail('someone@example.test|1.2.3.4'); // eslint-disable-line no-await-in-loop
  assert.ok(await guard.lockedFor('someone@example.test|1.2.3.4') > 0);
  const again = makeGuard({ name: `t-login-${tag}`, limit: 3, windowMs: 60000 });
  assert.ok(await again.lockedFor('someone@example.test|1.2.3.4') > 0, 'still locked for a new process');
  assert.equal(await again.lockedFor('someone@example.test|5.6.7.8'), 0, 'another address is not');
  await again.clear('someone@example.test|1.2.3.4');
  assert.equal(await guard.lockedFor('someone@example.test|1.2.3.4'), 0);
});

test('phone codes: one a minute, five wrong tries, used once, all kept in the database', async () => {
  const sms = require('../src/utils/sms');
  const phone = require('../src/services/phoneVerify.service');
  const real = { enabled: sms.enabled, sendSms: sms.sendSms };
  const texts = [];
  sms.enabled = () => true;
  sms.sendSms = async (number, text) => { texts.push({ number, text }); };
  try {
    const buyer = await h.user('BUYER');
    const number = `0917${String(Date.now()).slice(-7)}`;
    await phone.sendCode(buyer.id, number);
    const code = /code is (\d{6})/.exec(texts.at(-1).text)[1];
    const kept = await h.prisma.securityCounter.findUnique({ where: { name: `sms-code:${buyer.id}` } });
    assert.ok(kept?.data?.hash && !JSON.stringify(kept.data).includes(code), 'kept as a hash');
    await assert.rejects(() => phone.sendCode(buyer.id, number), /Wait a minute/);

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await assert.rejects(() => phone.verifyCode(buyer.id, code === '000000' ? '111111' : '000000'), /not right/);
    }
    await assert.rejects(() => phone.verifyCode(buyer.id, code), /Too many wrong codes/);

    // A new code (the minute has passed), right the first time, then gone.
    await h.prisma.securityCounter.deleteMany({ where: { name: `sms-wait:${buyer.id}` } });
    await phone.sendCode(buyer.id, number);
    const second = /code is (\d{6})/.exec(texts.at(-1).text)[1];
    const [ok, twice] = await Promise.allSettled([phone.verifyCode(buyer.id, second), phone.verifyCode(buyer.id, second)]);
    assert.equal([ok, twice].filter((r) => r.status === 'fulfilled').length, 1, 'the code works once');
    assert.equal((await h.prisma.user.findUnique({ where: { id: buyer.id } })).phoneVerifiedNumber, number);
    // The day's count for the number is in the database.
    const day = require('../src/utils/manilaTime').dayKey(new Date());
    assert.equal((await counters.peek(`sms-day:${day}:${number}`)).hits, 2);
  } finally {
    Object.assign(sms, real);
    // The phone codes and their counts this test made (no other test sends any).
    await h.prisma.securityCounter.deleteMany({ where: { name: { startsWith: 'sms-' } } }).catch(() => {});
  }
});
