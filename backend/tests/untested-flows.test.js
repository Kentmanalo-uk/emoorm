const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const h = require('./helpers');
const email = require('../src/utils/email');
const config = require('../src/config/env');
const { comparePassword } = require('../src/utils/password');

// Password reset, QR sign-in, ID documents (KYC), the search-engine pages
// and permanent deletion: flows that had no tests.

const made = [];
after(async () => {
  email.setDeliverForTests(null);
  await Promise.all(made.map((p) => fs.promises.unlink(p).catch(() => {})));
  await h.cleanup();
});

const site = async () => (await h.startApp()).replace(/\/api$/, '');

test('password reset: the emailed link sets a new password once, signs out every session, and nothing else works', async () => {
  const user = await h.user('BUYER');
  const sent = [];
  email.setDeliverForTests(async (m) => { sent.push(m); return { delivered: true, transport: 'test' }; });

  const asked = await h.api('POST', '/auth/forgot-password', { body: { email: user.email } });
  assert.equal(asked.status, 200);
  // An unknown address gets the same answer (no telling accounts apart).
  const stranger = await h.api('POST', '/auth/forgot-password', { body: { email: `nobody-${h.RUN}@example.test` } });
  assert.equal(stranger.status, 200);
  assert.equal(stranger.body.message, asked.body.message);
  assert.equal(JSON.stringify(asked.body).includes('token='), false, 'the token is only in the email');

  const mail = sent.find((m) => m.to === user.email);
  const token = /reset-password\?token=([a-f0-9]+)/.exec(mail.html || mail.text)[1];
  const before = (await h.prisma.user.findUnique({ where: { id: user.id } })).tokenVersion;

  assert.equal((await h.api('POST', '/auth/reset-password', { body: { token: 'f'.repeat(64), password: 'Another#Pass1', confirmPassword: 'Another#Pass1' } })).status, 400);
  const reset = await h.api('POST', '/auth/reset-password', { body: { token, password: 'Brand#NewPass9', confirmPassword: 'Brand#NewPass9' } });
  assert.equal(reset.status, 200, reset.body?.message);
  const after1 = await h.prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(await comparePassword('Brand#NewPass9', after1.password));
  assert.equal(after1.tokenVersion, before + 1, 'every session signed out');
  assert.equal(after1.passwordResetToken, null);
  // The same link a second time: no.
  assert.equal((await h.api('POST', '/auth/reset-password', { body: { token, password: 'Third#Pass123', confirmPassword: 'Third#Pass123' } })).status, 400);
});

test('QR sign-in: scanned and approved by the phone, collected once by the browser; others cannot approve it', async () => {
  const buyer = await h.user('BUYER');
  const other = await h.user('BUYER');
  const created = await h.api('POST', '/auth/qr/create');
  assert.equal(created.status, 200, created.body?.message);
  const { token } = created.body.data;
  assert.match(created.body.data.qrDataUrl, /^data:image\/png;base64,/);
  assert.equal((await h.api('GET', `/auth/qr/status/${token}`)).body.data.status, 'PENDING');

  const scan = await h.api('POST', '/auth/qr/scan', { token: h.token(buyer), body: { token } });
  assert.equal(scan.status, 200, scan.body?.message);
  // Scanned twice, or approved by someone who did not scan it: no.
  assert.equal((await h.api('POST', '/auth/qr/scan', { token: h.token(other), body: { token } })).status, 409);
  assert.equal((await h.api('POST', '/auth/qr/approve', { token: h.token(other), body: { token, approve: true } })).status, 403);

  const approved = await h.api('POST', '/auth/qr/approve', { token: h.token(buyer), body: { token, approve: true } });
  assert.equal(approved.status, 200, approved.body?.message);
  const collected = await h.api('GET', `/auth/qr/status/${token}`);
  assert.equal(collected.body.data.status, 'APPROVED');
  assert.equal(collected.body.data.user.id, buyer.id);
  assert.ok(collected.body.data.accessToken);
  // Collected once: the next look finds nothing.
  assert.equal((await h.api('GET', `/auth/qr/status/${token}`)).body.data.status, 'EXPIRED');
});

test('QR sign-in: an admin cannot sign in by QR', async () => {
  const town = (await h.reference()).municipality;
  const admin = await h.user('MUNICIPAL_ADMIN', {
    municipality: { connect: { id: town.id } }, mfaEnabled: true, mfaSecret: speakeasy.generateSecret().base32,
  });
  const { token } = (await h.api('POST', '/auth/qr/create')).body.data;
  await h.api('POST', '/auth/qr/scan', { token: h.token(admin), body: { token } });
  assert.equal((await h.api('POST', '/auth/qr/approve', { token: h.token(admin), body: { token, approve: true } })).status, 403);
});

test('ID documents: their owner sees them; another user, or an admin once the application is decided, does not', async () => {
  const applicant = await h.user('BUYER');
  const stranger = await h.user('BUYER');
  const admin = await h.user('SUPER_ADMIN');
  const dir = path.resolve(config.upload.privateUploadDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = `ci-kyc-${crypto.randomBytes(6).toString('hex')}.jpg`;
  fs.writeFileSync(path.join(dir, file), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  made.push(path.join(dir, file));
  await h.prisma.user.update({ where: { id: applicant.id }, data: { idFrontUrl: file, sellerApplicationStatus: 'PENDING' } });

  const url = `/auth/users/${applicant.id}/kyc-photo/idFront`;
  const own = await fetch(`${await h.startApp()}${url}`, { headers: { Authorization: `Bearer ${h.token(applicant)}` } });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.equal((await h.api('GET', url, { token: h.token(stranger) })).status, 403);
  assert.equal((await h.api('GET', `/auth/users/${applicant.id}/kyc-photo/password`, { token: h.token(applicant) })).status, 400);
  // An admin while the application waits (logged), not once it is decided.
  assert.equal((await fetch(`${await h.startApp()}${url}`, { headers: { Authorization: `Bearer ${h.token(admin)}` } })).status, 200);
  assert.equal(await h.prisma.auditLog.count({ where: { userId: admin.id, action: 'VIEW_KYC_DOCUMENT', entityId: applicant.id } }), 1);
  await h.prisma.user.update({ where: { id: applicant.id }, data: { sellerApplicationStatus: 'APPROVED' } });
  assert.equal((await h.api('GET', url, { token: h.token(admin) })).status, 403);
});

test('search engines: unknown pages are 404, category pages have their own address, the sitemap lists only open shops', async () => {
  const web = await site();
  const page = (p) => fetch(`${web}${p}`, { headers: { Accept: 'text/html' }, redirect: 'manual' });
  // Without a built web app the server only answers the API; skip the HTML part then.
  const home = await page('/');
  if (home.status === 200 && /<html/i.test(await home.text())) {
    assert.equal((await page(`/no-such-page-${h.RUN}`)).status, 404);
    assert.equal((await page(`/product/no-such-${h.RUN}`)).status, 404);
    const privacy = await page('/privacy-policy');
    assert.equal(privacy.status, 301);
    assert.match(privacy.headers.get('location'), /\/privacy$/);
  }
  const seo = require('../src/services/seo.service');
  assert.equal((await seo.resolve(`/no-such-page-${h.RUN}`)).notFound, true);
  assert.equal((await seo.resolve('/privacy')).notFound, undefined);
  const { category } = await h.reference();
  const full = await h.prisma.category.findUnique({ where: { id: category.id } });
  const meta = await seo.resolve(`/category/${full.slug}`);
  assert.equal(meta.notFound, undefined);
  assert.match(meta.title, new RegExp(full.name));

  const seller = await h.user('SELLER');
  const open = await h.shop(seller);
  const suspended = await h.prisma.store.update({ where: { id: (await h.shop(await h.user('SELLER'))).id }, data: { isSuspended: true } });
  await h.prisma.store.update({ where: { id: open.id }, data: { isApproved: true, isActive: true } });
  const xml = await (await fetch(`${web}/sitemap.xml`)).text();
  assert.ok(xml.includes(`/store/${open.slug}<`), 'an open shop is listed');
  assert.equal(xml.includes(`/store/${suspended.slug}<`), false, 'a suspended one is not');
  assert.equal(xml.includes('/privacy-policy'), false);
  assert.equal(/products\?category=/.test(xml), false, 'categories by their own address');
});

test('permanent deletion: only a super admin, only with the word, and the account and its shop are gone', async () => {
  const superAdmin = await h.user('SUPER_ADMIN');
  const muniAdmin = await h.user('MUNICIPAL_ADMIN');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.product(store);

  assert.equal((await h.api('POST', `/auth/users/${seller.id}/purge`, { token: h.token(muniAdmin), body: { confirm: 'DELETE' } })).status, 403);
  assert.equal((await h.api('POST', `/auth/users/${seller.id}/purge`, { token: h.token(superAdmin), body: { confirm: 'yes' } })).status, 400);
  assert.equal((await h.api('POST', `/auth/users/${superAdmin.id}/purge`, { token: h.token(superAdmin), body: { confirm: 'DELETE' } })).status, 400, 'not oneself');

  const preview = await h.api('GET', `/auth/users/${seller.id}/purge-preview`, { token: h.token(superAdmin) });
  assert.equal(preview.status, 200, preview.body?.message);
  assert.equal(preview.body.data.counts.stores, 1);
  const done = await h.api('POST', `/auth/users/${seller.id}/purge`, { token: h.token(superAdmin), body: { confirm: 'delete' } });
  assert.equal(done.status, 200, done.body?.message);
  assert.equal(await h.prisma.user.count({ where: { id: seller.id } }), 0);
  assert.equal(await h.prisma.store.count({ where: { id: store.id } }), 0);
  assert.equal(await h.prisma.product.count({ where: { storeId: store.id } }), 0);
});
