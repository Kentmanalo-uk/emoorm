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

// What an applicant's account holds that must never reach an admin's browser.
const SECRETS = {
  mfaSecret: 'JBSWY3DPEHPK3PXPCI', mfaBackupCodes: '["ci-backup-hash"]', passwordResetToken: 'ci-reset-hash',
  emailVerificationToken: 'ci-verify-hash', payoutAccountNumber: '09170000001', sellerBirTin: '123-456-789-000',
};
const SECRET_FIELDS = ['password', 'mfaSecret', 'mfaBackupCodes', 'passwordResetToken', 'emailVerificationToken', 'payoutAccountNumber', 'sellerBirTin', 'tokenVersion'];

// An applicant as they are today: a seller whose shop is private until approved.
const applicantIn = async (townId) => {
  const u = await h.user('SELLER', { sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopMunicipalityId: townId, ...SECRETS });
  const s = await h.shop(u);
  await h.prisma.store.update({ where: { id: s.id }, data: { isApproved: false } });
  return u;
};

test('approving or rejecting a shop application answers with the decision, never the account\'s secrets', async () => {
  const admin = await h.user('MUNICIPAL_ADMIN');
  const approving = await applicantIn(admin.municipalityId);
  const rejecting = await applicantIn(admin.municipalityId);

  const approved = await h.api('POST', `/auth/users/${approving.id}/approve-seller`, { token: h.token(admin) });
  assert.equal(approved.status, 200, approved.body?.message);
  assert.equal(approved.body.data.role, 'SELLER');
  assert.equal(approved.body.data.sellerApplicationStatus, 'APPROVED');
  assert.equal((await h.prisma.store.findUnique({ where: { ownerId: approving.id } })).isApproved, true);

  const rejected = await h.api('POST', `/auth/users/${rejecting.id}/reject-seller`, { token: h.token(admin), body: { reason: 'The permit photo is unreadable.' } });
  assert.equal(rejected.status, 200, rejected.body?.message);
  assert.equal(rejected.body.data.role, 'BUYER');
  assert.equal(rejected.body.data.sellerApplicationStatus, 'REJECTED');
  assert.equal(rejected.body.data.sellerRejectionReason, 'The permit photo is unreadable.');

  for (const res of [approved, rejected]) {
    for (const field of SECRET_FIELDS) assert.equal(field in res.body.data, false, `${field} was sent`);
    const text = JSON.stringify(res.body);
    for (const value of Object.values(SECRETS)) assert.equal(text.includes(value), false, `${value} was sent`);
  }
});

test('a decision whose shop step fails is taken back, and the admin can simply retry', async () => {
  const admin = await h.user('MUNICIPAL_ADMIN');
  const storeRepository = require('../src/repositories/store.repository');
  const failing = async (name, run) => {
    const original = storeRepository[name];
    storeRepository[name] = async () => { throw new Error('ci: the database went away'); };
    try { return await run(); } finally { storeRepository[name] = original; }
  };

  // Approving someone who applied before shops opened at application time:
  // a buyer whose shop is created by the approval.
  const legacy = await h.user('BUYER', { sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: `Ci Legacy Shop ${h.RUN}`, shopMunicipalityId: admin.municipalityId });
  const approve = () => h.api('POST', `/auth/users/${legacy.id}/approve-seller`, { token: h.token(admin) });
  assert.equal((await failing('createStore', approve)).status, 500);
  let row = await h.prisma.user.findUnique({ where: { id: legacy.id } });
  assert.equal(row.sellerApplicationStatus, 'PENDING');
  assert.equal(row.role, 'BUYER');
  assert.equal(row.sellerReviewedAt, null);
  assert.equal(row.sellerApplicationHistory, null);
  assert.equal(await h.prisma.store.count({ where: { ownerId: legacy.id } }), 0);
  const retried = await approve();
  assert.equal(retried.status, 200, retried.body?.message);
  assert.equal((await h.prisma.store.findUnique({ where: { ownerId: legacy.id } })).isApproved, true);

  // Rejecting: the shop could not be hidden, so the applicant is still waiting.
  const applicant = await applicantIn(admin.municipalityId);
  const reject = () => h.api('POST', `/auth/users/${applicant.id}/reject-seller`, { token: h.token(admin), body: { reason: 'Please add a clear shop photo.' } });
  assert.equal((await failing('updateStore', reject)).status, 500);
  row = await h.prisma.user.findUnique({ where: { id: applicant.id } });
  assert.equal(row.sellerApplicationStatus, 'PENDING');
  assert.equal(row.role, 'SELLER');
  assert.equal(row.sellerRejectionReason, null);
  assert.equal((await reject()).status, 200);
  assert.equal((await h.prisma.store.findUnique({ where: { ownerId: applicant.id } })).isActive, false);
});
