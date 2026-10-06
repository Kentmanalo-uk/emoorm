const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const h = require('./helpers');
const { generateTokens } = require('../src/utils/jwt');

after(h.cleanup);

test('a refresh token renews the session', async () => {
  const buyer = await h.user('BUYER');
  const { refreshToken } = generateTokens(buyer);
  const res = await h.api('POST', '/auth/refresh-token', { body: { refreshToken } });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken);
});

test('a session from before a promotion to admin is refused, and not renewed', async () => {
  const buyer = await h.user('BUYER');
  const tokens = generateTokens(buyer);
  await h.prisma.user.update({ where: { id: buyer.id }, data: { role: 'MUNICIPAL_ADMIN' } });
  assert.equal((await h.api('GET', '/auth/profile', { token: tokens.accessToken })).status, 401);
  assert.equal((await h.api('POST', '/auth/refresh-token', { body: { refreshToken: tokens.refreshToken } })).status, 401);
});

test('a session ends at once when its account is suspended or its password changes', async () => {
  const buyer = await h.user('BUYER');
  const { accessToken } = generateTokens(buyer);
  // Signed-in requests just made: the account is remembered for a moment.
  assert.equal((await h.api('GET', '/auth/profile', { token: accessToken })).status, 200);
  await h.prisma.user.update({ where: { id: buyer.id }, data: { isActive: false } });
  assert.equal((await h.api('GET', '/auth/profile', { token: accessToken })).status, 403);

  await h.prisma.user.update({ where: { id: buyer.id }, data: { isActive: true } });
  assert.equal((await h.api('GET', '/auth/profile', { token: accessToken })).status, 200);
  // A password change inside a transaction, as the account pages make it.
  await h.prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: buyer.id }, data: { tokenVersion: { increment: 1 } } });
  });
  assert.equal((await h.api('GET', '/auth/profile', { token: accessToken })).status, 401);
});

test('login answers the same for an unknown email, a wrong password and a deleted account', async () => {
  const buyer = await h.user('BUYER');
  const gone = await h.user('BUYER', { deletedAt: new Date() });
  const answers = await Promise.all([
    h.api('POST', '/auth/login', { body: { email: `nobody-${h.RUN}@example.test`, password: 'Whatever#123' } }),
    h.api('POST', '/auth/login', { body: { email: buyer.email, password: 'Wrong#12345' } }),
    h.api('POST', '/auth/login', { body: { email: gone.email, password: 'Wrong#12345' } }),
  ]);
  for (const a of answers) {
    assert.equal(a.status, 401);
    assert.equal(a.body.message, 'Invalid email or password');
  }
});

test('Google sign-in over an unconfirmed account revokes its password and sessions', async () => {
  const squatter = await h.user('BUYER', { isVerified: false, password: await bcrypt.hash('Attacker#123', 4) });
  const oldToken = h.token(squatter);
  const google = require('../src/services/google.service');
  const auth = require('../src/services/auth.service');
  const original = google.verifyIdToken;
  google.verifyIdToken = async () => ({ googleId: `g-${h.RUN}`, email: squatter.email, fullName: 'Owner', profilePhoto: null });
  try {
    await auth.loginWithGoogle({ idToken: 'stub' });
  } finally {
    google.verifyIdToken = original;
  }
  const after = await h.prisma.user.findUnique({ where: { id: squatter.id } });
  assert.equal(await bcrypt.compare('Attacker#123', after.password), false);
  assert.equal(after.isVerified, true);
  assert.equal((await h.api('GET', '/auth/profile', { token: oldToken })).status, 401);
});

test('a municipal admin cannot review a shop application in another town', async () => {
  const admin = await h.user('MUNICIPAL_ADMIN');
  const elsewhere = await h.otherTown(admin.municipalityId);
  const applicant = await h.user('BUYER', { sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: 'Ci applicant', shopMunicipalityId: elsewhere.id });
  const res = await h.api('POST', `/auth/users/${applicant.id}/approve-seller`, { token: h.token(admin) });
  assert.equal(res.status, 403);
});
