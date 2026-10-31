// A superadmin standing in for a shop: POST /auth/users/:id/act-as hands back
// the seller's own session, so every seller route takes it without knowing
// anything special. It is a superadmin's door only, it does not open admin
// accounts, and whatever is done behind it still carries the admin's name.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { verifyAccessToken } = require('../src/utils/jwt');

after(() => h.cleanup().then(() => h.prisma.$disconnect()));

test('a superadmin opens a seller account and is the seller to every route', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const seller = await h.user('SELLER');
  await h.shop(seller);

  const opened = await h.api('POST', `/auth/users/${seller.id}/act-as`, { token: h.token(admin) });
  assert.equal(opened.status, 200);

  const acting = opened.body.data.accessToken;
  assert.ok(acting, 'a token comes back');
  assert.equal(opened.body.data.user.id, seller.id);

  // It is the seller's session: the id, the role and no refresh token to
  // renew it with.
  const claims = verifyAccessToken(acting);
  assert.equal(claims.id, seller.id);
  assert.equal(claims.role, 'SELLER');
  assert.equal(claims.actAs.by, admin.id);
  assert.equal(opened.body.data.refreshToken, undefined);

  // The door shuts on its own.
  const minutes = (claims.exp - claims.iat) / 60;
  assert.ok(minutes > 0 && minutes <= 60, `expires in ${minutes} minutes`);

  // And a seller route answers it as the seller.
  const mine = await h.api('GET', '/auth/profile', { token: acting });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.user?.id || mine.body.data.id, seller.id);
});

test('it is a superadmin door, and never onto another admin', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const municipal = await h.user('MUNICIPAL_ADMIN');
  const otherAdmin = await h.user('SUPER_ADMIN');

  // Nobody below a superadmin may open one.
  for (const who of [seller, buyer, municipal]) {
    const res = await h.api('POST', `/auth/users/${seller.id}/act-as`, { token: h.token(who) });
    assert.equal(res.status, 403, `${who.role} is refused`);
  }

  // An admin is not a shop: borrowing one would be borrowing their rights.
  for (const target of [municipal, otherAdmin]) {
    const res = await h.api('POST', `/auth/users/${target.id}/act-as`, { token: h.token(admin) });
    assert.equal(res.status, 403, `${target.role} cannot be opened`);
  }

  // Only a seller has a shop to stand in for.
  const onBuyer = await h.api('POST', `/auth/users/${buyer.id}/act-as`, { token: h.token(admin) });
  assert.equal(onBuyer.status, 400);

  const onSelf = await h.api('POST', `/auth/users/${admin.id}/act-as`, { token: h.token(admin) });
  assert.equal(onSelf.status, 400);

  const missing = await h.api('POST', '/auth/users/no-such-user/act-as', { token: h.token(admin) });
  assert.equal(missing.status, 404);
});

test('opening the account is written down, and so is what is done inside it', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const seller = await h.user('SELLER');

  const opened = await h.api('POST', `/auth/users/${seller.id}/act-as`, { token: h.token(admin) });
  assert.equal(opened.status, 200);

  const entry = await h.prisma.auditLog.findFirst({
    where: { action: 'ACT_AS_USER', entityId: seller.id, userId: admin.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(entry, 'the door opening is on the record');
  assert.equal(entry.userEmail, admin.email);
});
