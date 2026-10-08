const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const speakeasy = require('speakeasy');
const h = require('./helpers');

after(h.cleanup);

const signIn = (email) => h.api('POST', '/auth/login', { body: { email, password: 'Testing#123' } });

test('renewing rotates the refresh token; the old one is refused, and reusing it ends every session', async () => {
  const buyer = await h.user('BUYER');
  const first = (await signIn(buyer.email)).body.data;
  assert.ok(first.refreshToken);

  const renewed = await h.api('POST', '/auth/refresh-token', { body: { refreshToken: first.refreshToken } });
  assert.equal(renewed.status, 200);
  const second = renewed.body.data;
  assert.notEqual(second.refreshToken, first.refreshToken);

  // The retired token again: a copy is in play, so the whole family ends,
  // the current token and the current access tokens with it.
  assert.equal((await h.api('POST', '/auth/refresh-token', { body: { refreshToken: first.refreshToken } })).status, 401);
  assert.equal((await h.api('POST', '/auth/refresh-token', { body: { refreshToken: second.refreshToken } })).status, 401);
  assert.equal((await h.api('GET', '/auth/profile', { token: second.accessToken })).status, 401);
});

test('signing out stops this device renewing; signing out everywhere ends the other devices too', async () => {
  const buyer = await h.user('BUYER');
  const phone = (await signIn(buyer.email)).body.data;
  const laptop = (await signIn(buyer.email)).body.data;

  const out = await h.api('POST', '/auth/logout', { token: phone.accessToken, body: { refreshToken: phone.refreshToken } });
  assert.equal(out.status, 200);
  assert.equal((await h.api('POST', '/auth/refresh-token', { body: { refreshToken: phone.refreshToken } })).status, 401);
  // The laptop is untouched.
  assert.equal((await h.api('POST', '/auth/refresh-token', { body: { refreshToken: laptop.refreshToken } })).status, 200);

  assert.equal((await h.api('POST', '/auth/logout-all', { token: laptop.accessToken })).status, 200);
  assert.equal((await h.api('GET', '/auth/profile', { token: laptop.accessToken })).status, 401);
});

test('ten wrong passwords lock the account for a while, whatever the address', async () => {
  const buyer = await h.user('BUYER');
  for (let i = 0; i < 10; i += 1) {
    const res = await h.api('POST', '/auth/login', { body: { email: buyer.email, password: 'Wrong#1234' } });
    assert.equal(res.status, 401);
  }
  const locked = await h.api('POST', '/auth/login', { body: { email: buyer.email, password: 'Testing#123' } });
  assert.equal(locked.status, 429);
});

test('a sign-in code step is spent after five wrong codes and after one right one', async () => {
  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const buyer = await h.user('BUYER', { mfaEnabled: true, mfaSecret: secret });
  const step = (await signIn(buyer.email)).body.data;
  assert.equal(step.requiresMfa, true);
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await h.api('POST', '/auth/mfa/verify-login', { body: { mfaToken: step.mfaToken, code: '000000' } })).status, 401);
  }
  const right = speakeasy.totp({ secret, encoding: 'base32' });
  assert.equal((await h.api('POST', '/auth/mfa/verify-login', { body: { mfaToken: step.mfaToken, code: right } })).status, 401);

  const fresh = (await signIn(buyer.email)).body.data;
  const ok = await h.api('POST', '/auth/mfa/verify-login', { body: { mfaToken: fresh.mfaToken, code: speakeasy.totp({ secret, encoding: 'base32' }) } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.refreshToken);
  assert.equal(ok.body.data.user.mfaSecret, undefined);
  // The same step again, once it has signed someone in.
  assert.equal((await h.api('POST', '/auth/mfa/verify-login', { body: { mfaToken: fresh.mfaToken, code: speakeasy.totp({ secret, encoding: 'base32' }) } })).status, 401);
});

test('QR sign-in: admins cannot approve one, a two-factor account needs its code, and the code is delivered once', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const created = await h.api('POST', '/auth/qr/create', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120 Windows' } });
  assert.ok([200, 201].includes(created.status));
  const qr = created.body.data.token;
  assert.equal((await h.api('POST', '/auth/qr/scan', { token: h.token(admin), body: { token: qr } })).status, 200);
  const refused = await h.api('POST', '/auth/qr/approve', { token: h.token(admin), body: { token: qr, approve: true } });
  assert.equal(refused.status, 403);

  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const careful = await h.user('BUYER', { mfaEnabled: true, mfaSecret: secret });
  const qr2 = (await h.api('POST', '/auth/qr/create', {})).body.data.token;
  assert.equal((await h.api('POST', '/auth/qr/scan', { token: h.token(careful), body: { token: qr2 } })).status, 200);
  assert.equal((await h.api('POST', '/auth/qr/approve', { token: h.token(careful), body: { token: qr2, approve: true } })).status, 400);
  const code = speakeasy.totp({ secret, encoding: 'base32' });
  assert.equal((await h.api('POST', '/auth/qr/approve', { token: h.token(careful), body: { token: qr2, approve: true, code } })).status, 200);

  const delivered = await h.api('GET', `/auth/qr/status/${qr2}`, {});
  assert.equal(delivered.body.data.status, 'APPROVED');
  assert.ok(delivered.body.data.refreshToken);
  assert.equal(delivered.body.data.user.mfaSecret, undefined);
  assert.equal((await h.api('GET', `/auth/qr/status/${qr2}`, {})).body.data.status, 'EXPIRED');

  // A plain account approves with nothing more, and the session it opens renews.
  const plain = await h.user('BUYER');
  const qr3 = (await h.api('POST', '/auth/qr/create', {})).body.data.token;
  await h.api('POST', '/auth/qr/scan', { token: h.token(plain), body: { token: qr3 } });
  assert.equal((await h.api('POST', '/auth/qr/approve', { token: h.token(plain), body: { token: qr3, approve: true } })).status, 200);
  const session = (await h.api('GET', `/auth/qr/status/${qr3}`, {})).body.data;
  assert.equal((await h.api('POST', '/auth/refresh-token', { body: { refreshToken: session.refreshToken } })).status, 200);
});

test('Google sign-in asks for the second factor when the account turned it on', async () => {
  const authService = require('../src/services/auth.service');
  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const buyer = await h.user('BUYER', { mfaEnabled: true, mfaSecret: secret, googleId: `ci-google-${h.RUN}` });
  const result = await authService.loginWithGoogleProfile({ googleId: buyer.googleId, email: buyer.email, fullName: buyer.fullName });
  assert.equal(result.requiresMfa, true);
  assert.equal(result.accessToken, undefined);
});
