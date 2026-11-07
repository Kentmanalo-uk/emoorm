// Continue with mobile number: a 6-digit code texted to the number signs in
// the account that proved it, or starts a new account (finished with an
// email, through the same step as a first Google sign-in). Texts are written
// to the log here (SMS_DEV_LOG), and read back from it.
process.env.SMS_DEV_LOG = '1';
process.env.SEMAPHORE_API_KEY = '';
process.env.HTTPSMS_API_KEY = '';
process.env.HTTPSMS_FROM = '';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const appSettingService = require('../src/services/appSetting.service');

const texts = [];
const realWarn = console.warn;
console.warn = (...args) => {
  const line = args.join(' ');
  if (line.startsWith('[sms:dev]')) texts.push(line);
  else realWarn(...args);
};
const codeFor = (number) => {
  const line = [...texts].reverse().find((t) => t.includes(`to ${number}:`));
  return line && line.match(/code is (\d{6})/)[1];
};

// A number of this run's own (09 + 9 digits).
let seq = 0;
const freshNumber = () => {
  seq += 1;
  return `09${String(h.RUN).slice(-7)}${String(seq).padStart(2, '0')}`.slice(0, 11);
};

// The sign-in steps allow 20 requests a quarter hour from one address
// (app.js authLimiter, counted in memory in tests): this file stays under it.
// Every file signs in from one address: start this one's hourly count afresh.
before(() => appSettingService.update({ loginPhone: true }));
before(() => h.prisma.securityCounter.deleteMany({
  where: { OR: [{ name: { contains: 'sms-login-ip' } }, { name: { contains: 'auth-phone/login' } }] },
}));

const madeEmails = [];
after(async () => {
  console.warn = realWarn;
  await appSettingService.update({ loginPhone: false }).catch(() => {});
  const users = await h.prisma.user.findMany({ where: { email: { in: madeEmails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await h.prisma.address.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.refreshSession.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.user.deleteMany({ where: { id: { in: ids } } });
  await h.cleanup();
});

const send = (number) => h.api('POST', '/auth/phone/login/send', { body: { number } });
const login = (number, code) => h.api('POST', '/auth/phone/login', { body: { number, code } });

test('off unless the super admin switches it on (texts still work for number checks)', async () => {
  await appSettingService.update({ loginPhone: false });
  try {
    const config = (await h.api('GET', '/auth/phone/config')).body.data;
    assert.equal(config.enabled, true);
    assert.equal(config.login, false);
    const sent = await send('09171234567');
    assert.equal(sent.status, 403);
    assert.match(sent.body.message, /turned off/);
  } finally {
    await appSettingService.update({ loginPhone: true });
  }
  assert.equal((await h.api('GET', '/auth/phone/config')).body.data.login, true);
});

test('only a Philippine mobile number gets a code', async () => {
  for (const bad of ['12345', 'not a number']) {
    assert.equal((await send(bad)).status, 400, `${bad} is refused`);
  }
});

test('a new number finishes its account with an email, then signs straight in', async () => {
  const number = freshNumber();
  const email = `ci-phone-${h.RUN}@example.test`;
  madeEmails.push(email);

  const sent = await send(number);
  assert.equal(sent.status, 200);
  assert.ok(sent.body.data.sentTo.endsWith(number.slice(-3)), 'the number is shown masked');
  assert.equal((await send(number)).status, 429, 'one code a minute');

  const first = await login(number, codeFor(number));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.requiresProfile, true);
  assert.equal(first.body.data.phone, number);
  assert.equal(first.body.data.email, null);
  assert.equal((await login(number, codeFor(number))).status, 400, 'a code works once');

  const { municipality } = await h.reference();
  const finish = (body) => h.api('POST', '/auth/google/complete', {
    body: {
      googleToken: first.body.data.googleToken,
      fullName: 'Ci Phone Person',
      municipalityId: municipality.id,
      password: 'Testing#123',
      confirmPassword: 'Testing#123',
      ...body,
    },
  });
  assert.equal((await finish({})).status, 400, 'an email is needed');
  const done = await finish({ email });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  assert.ok(done.body.data.accessToken);
  const saved = await h.prisma.user.findUnique({ where: { email }, select: { phoneVerifiedNumber: true, contactNumber: true, isVerified: true } });
  assert.equal(saved.phoneVerifiedNumber, number);
  assert.equal(saved.contactNumber, number);
  assert.equal(saved.isVerified, false, 'the email is confirmed later, by the welcome email');

  // Next time: straight in. (The minute's wait is over for a fresh counter.)
  await h.prisma.securityCounter.deleteMany({ where: { name: { contains: `sms-login-wait:${number}` } } });
  assert.equal((await send(number)).status, 200);
  const again = await login(number, codeFor(number));
  assert.equal(again.status, 200);
  assert.equal(again.body.data.user.email, email);
  assert.ok(again.body.data.accessToken);
});

test('a number proven by an existing account signs that account in', async () => {
  const number = freshNumber();
  const existing = await h.user('BUYER', { phoneVerifiedNumber: number, phoneVerifiedAt: new Date() });
  await send(number);
  const res = await login(number, codeFor(number));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.id, existing.id);
});

test('a number on two accounts asks for the email instead', async () => {
  const number = freshNumber();
  await h.user('BUYER', { phoneVerifiedNumber: number, phoneVerifiedAt: new Date() });
  await h.user('BUYER', { phoneVerifiedNumber: number, phoneVerifiedAt: new Date() });
  await send(number);
  const res = await login(number, codeFor(number));
  assert.equal(res.status, 409);
  assert.match(res.body.message, /more than one account/);
});

test('five wrong codes end that code', async () => {
  const number = freshNumber();
  const sent = await send(number);
  assert.equal(sent.status, 200, sent.body.message);
  const right = codeFor(number);
  const wrong = right === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i += 1) assert.equal((await login(number, wrong)).status, 400);
  assert.equal((await login(number, right)).status, 429, 'even the right code is refused now');
});
