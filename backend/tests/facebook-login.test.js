// Continue with Facebook: Facebook sends the person back to /facebook-return
// with a code; the server swaps it for who they are and signs them in, links
// an existing account by its email, or asks a new person to finish their
// profile (through the same step as Google). Facebook itself is stubbed here.
process.env.FACEBOOK_APP_ID = 'ci-fb-app';
process.env.FACEBOOK_APP_SECRET = 'ci-fb-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const appSettingService = require('../src/services/appSetting.service');

const RETURN = 'http://localhost:3000/facebook-return';
let person = null; // what the stubbed Facebook says the code belongs to
let graphFails = false;
const realFetch = global.fetch;

before(() => {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (!u.startsWith('https://graph.facebook.com/')) return realFetch(url, opts);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (graphFails) return json({ error: { message: 'Invalid verification code' } }, 400);
    const q = new URL(u).searchParams;
    if (u.includes('/oauth/access_token')) {
      assert.equal(q.get('client_secret'), 'ci-fb-secret', 'the code is swapped with the app secret');
      assert.equal(q.get('redirect_uri'), RETURN);
      return json({ access_token: `tok-${q.get('code')}`, token_type: 'bearer' });
    }
    if (u.includes('/me')) {
      assert.ok(q.get('appsecret_proof'), 'the token is used with appsecret_proof');
      return json(person);
    }
    return json({ error: { message: 'unexpected' } }, 400);
  };
});

const madeEmails = [];
after(async () => {
  global.fetch = realFetch;
  const users = await h.prisma.user.findMany({ where: { email: { in: madeEmails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await h.prisma.address.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.refreshSession.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await h.prisma.user.deleteMany({ where: { id: { in: ids } } });
  await h.cleanup();
});

const login = (code, redirectUri = RETURN) => h.api('POST', '/auth/facebook', { body: { code, redirectUri } });

test('the website can tell it is on, without the secret', async () => {
  const res = await h.api('GET', '/auth/facebook/config');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { enabled: true, appId: 'ci-fb-app' });
  assert.ok(!JSON.stringify(res.body).includes('ci-fb-secret'));
});

test('only this site\'s /facebook-return may receive the code', async () => {
  person = { id: 'fb-x', name: 'X', email: `ci-fb-x-${h.RUN}@example.test` };
  for (const bad of ['https://evil.example/facebook-return', 'http://localhost:3000/login', `${RETURN}?next=/x`, '', null]) {
    const res = await login('code-x', bad);
    assert.equal(res.status, 400, `${bad} is refused`);
  }
});

test('a new person finishes their profile, then signs straight in', async () => {
  const email = `ci-fb-new-${h.RUN}@example.test`;
  madeEmails.push(email);
  person = { id: `fb-new-${h.RUN}`, name: 'Ci Facebook New', email };

  const first = await login('code-new');
  assert.equal(first.status, 200);
  assert.equal(first.body.data.requiresProfile, true);
  assert.equal(first.body.data.email, email);
  assert.equal(first.body.data.fullName, 'Ci Facebook New');
  assert.equal(await h.prisma.user.count({ where: { email } }), 0, 'nothing saved before the profile is finished');

  const { municipality } = await h.reference();
  const done = await h.api('POST', '/auth/google/complete', {
    body: {
      googleToken: first.body.data.googleToken,
      fullName: 'Ci Facebook New',
      municipalityId: municipality.id,
      password: 'Testing#123',
      confirmPassword: 'Testing#123',
    },
  });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  assert.ok(done.body.data.accessToken);
  const saved = await h.prisma.user.findUnique({ where: { email }, select: { facebookId: true, googleId: true, isVerified: true } });
  assert.equal(saved.facebookId, `fb-new-${h.RUN}`);
  assert.equal(saved.googleId, null);
  assert.equal(saved.isVerified, true);

  const profile = await h.api('GET', '/auth/profile', { token: done.body.data.accessToken });
  assert.equal(profile.body.data.hasFacebook, true);
  assert.equal(profile.body.data.facebookId, undefined, 'the id itself never leaves the server');

  const again = await login('code-again');
  assert.equal(again.status, 200);
  assert.ok(again.body.data.accessToken, 'signed straight in the second time');
  assert.equal(again.body.data.user.email, email);
});

test('an account with the same email is linked, not duplicated', async () => {
  const existing = await h.user('BUYER');
  person = { id: `fb-link-${h.RUN}`, name: 'Whoever', email: existing.email.toUpperCase() };
  const res = await login('code-link');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken);
  assert.equal(res.body.data.user.id, existing.id);
  const linked = await h.prisma.user.findUnique({ where: { id: existing.id }, select: { facebookId: true } });
  assert.equal(linked.facebookId, `fb-link-${h.RUN}`);
});

test('a Facebook account without an email is turned away kindly', async () => {
  person = { id: `fb-noemail-${h.RUN}`, name: 'No Email' };
  const res = await login('code-noemail');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /no email/i);
});

test('a code Facebook rejects is a failed sign-in, not a crash', async () => {
  graphFails = true;
  try {
    const res = await login('code-bad');
    assert.equal(res.status, 401);
  } finally {
    graphFails = false;
  }
});

test('switched off by the super admin: hidden and refused, Google too', async () => {
  await appSettingService.update({ loginFacebook: false, loginGoogle: false });
  try {
    assert.deepEqual((await h.api('GET', '/auth/facebook/config')).body.data, { enabled: false });
    person = { id: 'fb-off', name: 'Off', email: `ci-fb-off-${h.RUN}@example.test` };
    const fb = await login('code-off');
    assert.equal(fb.status, 403);
    assert.match(fb.body.message, /Facebook is turned off/);
    const google = await h.api('POST', '/auth/google', { body: { code: 'x' } });
    assert.equal(google.status, 403, 'refused before Google is even asked');
    assert.match(google.body.message, /Google is turned off/);
  } finally {
    await appSettingService.update({ loginFacebook: true, loginGoogle: true });
  }
  assert.equal((await h.api('GET', '/auth/facebook/config')).body.data.enabled, true);
});
