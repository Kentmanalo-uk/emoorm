const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

// Applying notifies the town's admins about the applicant (relatedId).
const applicants = [];
after(async () => {
  if (applicants.length) await h.prisma.notification.deleteMany({ where: { relatedId: { in: applicants } } });
  await h.cleanup();
});

const details = (seller, body) => h.api('PATCH', '/auth/seller-application/details', { token: h.token(seller), body });
const applicant = async () => {
  const seller = await h.user('SELLER', { sellerApplicationStatus: 'PENDING' });
  await h.shop(seller);
  return seller;
};

test('a new seller adds business and payout details after applying', async () => {
  const seller = await applicant();

  const business = await details(seller, { sellerBusinessType: 'REGISTERED', sellerPermitNumber: ' 0123456 ', sellerBirTin: '123-456-789-000' });
  assert.equal(business.status, 200, business.body?.message);
  assert.equal(business.body.data.details.sellerBusinessType, 'REGISTERED');
  assert.equal(business.body.data.details.sellerPermitNumber, '0123456');

  const payout = await details(seller, { payoutMethod: 'gcash', payoutAccountName: 'Ana Reyes', payoutAccountNumber: '09171234567' });
  assert.equal(payout.status, 200, payout.body?.message);
  const saved = await h.prisma.user.findUnique({
    where: { id: seller.id },
    select: { payoutMethod: true, payoutAccountNumber: true, sellerPermitNumber: true, sellerApplicationHistory: true },
  });
  assert.equal(saved.payoutMethod, 'GCASH');
  assert.equal(saved.payoutAccountNumber, '09171234567');
  // The business details stay as they were when only the payout changes.
  assert.equal(saved.sellerPermitNumber, '0123456');
  assert.equal(saved.sellerApplicationHistory.filter((e) => e.action === 'DETAILS_UPDATED').length, 2);

  // Back to selling on their own, and cash only: the extra details go.
  assert.equal((await details(seller, { sellerBusinessType: 'INDIVIDUAL', payoutMethod: 'COD_ONLY' })).status, 200);
  const cleared = await h.prisma.user.findUnique({ where: { id: seller.id }, select: { sellerPermitNumber: true, payoutAccountNumber: true } });
  assert.equal(cleared.sellerPermitNumber, null);
  assert.equal(cleared.payoutAccountNumber, null);
});

test('the details follow the application rules and are for sellers who applied', async () => {
  const seller = await applicant();
  assert.equal((await details(seller, { sellerBusinessType: 'REGISTERED' })).status, 400);
  assert.equal((await details(seller, { payoutMethod: 'GCASH', payoutAccountName: 'Ana' })).status, 400);
  assert.equal((await details(seller, { payoutMethod: 'PAYPAL', payoutAccountName: 'Ana', payoutAccountNumber: '1' })).status, 400);
  assert.equal((await details(seller, {})).status, 400);

  const buyer = await h.user('BUYER');
  assert.equal((await details(buyer, { payoutMethod: 'COD_ONLY' })).status, 403);
  const neverApplied = await h.user('SELLER');
  assert.equal((await details(neverApplied, { payoutMethod: 'COD_ONLY' })).status, 400);
});

test('applying is not held back by half-filled payout details from an old draft', async () => {
  const buyer = await h.user('BUYER', { contactNumber: '09171234567' });
  const { municipality } = await h.reference();
  const category = await h.prisma.category.findFirst({ select: { id: true } });
  const res = await h.api('POST', '/auth/apply-seller', {
    token: h.token(buyer),
    body: {
      shopName: `Ci Draft Shop ${h.RUN}`,
      shopAddress: 'Stall 4, Public Market',
      shopMunicipalityId: municipality.id,
      shopCategories: [category.id],
      acceptedTerms: true,
      // What the old, longer form saved: GCash picked, no account number.
      payoutMethod: 'GCASH',
      payoutAccountName: 'Ana Reyes',
      payoutAccountNumber: '',
    },
  });
  assert.ok([200, 201].includes(res.status), res.body?.message);
  const saved = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { role: true, payoutMethod: true, payoutAccountName: true } });
  assert.equal(saved.role, 'SELLER');
  assert.equal(saved.payoutMethod, null);
  assert.equal(saved.payoutAccountName, null);
  const store = await h.prisma.store.findUnique({ where: { ownerId: buyer.id }, select: { id: true } });
  if (store) {
    await h.prisma.notification.deleteMany({ where: { relatedId: { in: [store.id, buyer.id] } } });
    await h.prisma.store.delete({ where: { id: store.id } });
  }
  await h.prisma.notification.deleteMany({ where: { relatedId: buyer.id } });
});

// A buyer applies through the API; returns the account and its new shop.
const apply = async (body) => {
  const buyer = await h.user('BUYER', { contactNumber: '09171234567' });
  applicants.push(buyer.id);
  const { municipality } = await h.reference();
  const category = await h.prisma.category.findFirst({ select: { id: true } });
  const res = await h.api('POST', '/auth/apply-seller', {
    token: h.token(buyer),
    body: {
      shopName: `Ci Apply Shop ${h.RUN} ${buyer.id.slice(0, 6)}`,
      shopAddress: 'Stall 4, Public Market',
      shopMunicipalityId: municipality.id,
      shopCategories: [category.id],
      acceptedTerms: true,
      ...body,
    },
  });
  assert.ok([200, 201].includes(res.status), res.body?.message);
  const store = await h.prisma.store.findUnique({ where: { ownerId: buyer.id } });
  return { buyer, store };
};

test('an applicant can pick several ways to be paid', async () => {
  const { buyer, store } = await apply({
    payoutMethods: ['COD_ONLY', 'gcash', 'PAYPAL'],
    payoutAccountName: 'Ana Reyes',
    payoutAccountNumber: '0917 123 4567',
  });
  const saved = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { payoutMethod: true, payoutMethods: true, payoutAccountNumber: true } });
  // The main one is the first online method; the list keeps them all.
  assert.equal(saved.payoutMethod, 'GCASH');
  assert.deepEqual(saved.payoutMethods, ['GCASH', 'COD_ONLY']);
  assert.equal(saved.payoutAccountNumber, '0917 123 4567');
  // The shop's payment settings are filled in from it; cash stays on.
  assert.equal(store.paymentQrType, 'GCASH');
  assert.equal(store.paymentAccountName, 'Ana Reyes');
  assert.equal(store.paymentAccountNumber, '09171234567');
  assert.equal(store.acceptsCod, true);

  const status = await h.api('GET', '/auth/seller-application', { token: h.token(buyer) });
  assert.deepEqual(status.body.data.details.payoutMethods, ['GCASH', 'COD_ONLY']);

  // Changed later: QR Ph and cash. Online methods still need the account.
  assert.equal((await details(buyer, { payoutMethods: ['QRPH', 'COD_ONLY'] })).status, 400);
  assert.equal((await details(buyer, { payoutMethods: [] })).status, 400);
  const changed = await details(buyer, { payoutMethods: ['COD_ONLY', 'QRPH'], payoutAccountName: 'Ana Reyes', payoutAccountNumber: '1234567890' });
  assert.equal(changed.status, 200, changed.body?.message);
  assert.equal(changed.body.data.details.payoutMethod, 'QRPH');
  assert.deepEqual(changed.body.data.details.payoutMethods, ['QRPH', 'COD_ONLY']);
  // Cash only: no account kept.
  const cash = await details(buyer, { payoutMethods: ['COD_ONLY'] });
  assert.equal(cash.status, 200, cash.body?.message);
  assert.equal(cash.body.data.details.payoutMethod, 'COD_ONLY');
  assert.equal(cash.body.data.details.payoutAccountNumber, '');
});

test('the logo and cover photo from the application go on the shop, and stay when it is approved', async () => {
  const { buyer, store } = await apply({
    shopLogoUrl: '/uploads/ci-apply-logo.webp',
    shopCoverUrl: '/uploads/ci-apply-cover.jpg',
    payoutMethods: ['COD_ONLY'],
  });
  const saved = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { shopLogoUrl: true, shopCoverUrl: true, payoutMethod: true } });
  assert.equal(saved.shopLogoUrl, '/uploads/ci-apply-logo.webp');
  assert.equal(saved.shopCoverUrl, '/uploads/ci-apply-cover.jpg');
  assert.equal(saved.payoutMethod, 'COD_ONLY');
  assert.equal(store.logo, '/uploads/ci-apply-logo.webp');
  assert.equal(store.bannerImage, '/uploads/ci-apply-cover.jpg');
  // Cash only: nothing to fill in on the shop's QR settings.
  assert.equal(store.paymentQrType, null);

  const admin = await h.user('SUPER_ADMIN');
  const approved = await h.api('POST', `/auth/users/${buyer.id}/approve-seller`, { token: h.token(admin) });
  assert.equal(approved.status, 200, approved.body?.message);
  const after = await h.prisma.store.findUnique({ where: { ownerId: buyer.id } });
  assert.equal(after.isApproved, true);
  assert.equal(after.logo, '/uploads/ci-apply-logo.webp');
  assert.equal(after.bannerImage, '/uploads/ci-apply-cover.jpg');

  // Someone who applied before shops opened at application time gets their
  // shop on approval, with the pictures and payment details they picked.
  const legacy = await h.user('BUYER', {
    sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: `Ci Legacy Pics ${h.RUN}`,
    shopLogoUrl: '/uploads/ci-legacy-logo.png', shopCoverUrl: '/uploads/ci-legacy-cover.png',
    payoutMethod: 'QRPH', payoutMethods: ['QRPH', 'COD_ONLY'], payoutAccountName: 'Ben Cruz', payoutAccountNumber: '1234567890',
  });
  applicants.push(legacy.id);
  assert.equal((await h.api('POST', `/auth/users/${legacy.id}/approve-seller`, { token: h.token(admin) })).status, 200);
  const made = await h.prisma.store.findUnique({ where: { ownerId: legacy.id } });
  assert.equal(made.logo, '/uploads/ci-legacy-logo.png');
  assert.equal(made.bannerImage, '/uploads/ci-legacy-cover.png');
  assert.equal(made.paymentQrType, 'QRPH');
  assert.equal(made.paymentAccountNumber, '1234567890');
});

test('pictures from elsewhere are left out of the application', async () => {
  const { buyer, store } = await apply({ shopLogoUrl: 'https://tracker.example/logo.png', shopCoverUrl: 'javascript:alert(1)' });
  const saved = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { shopLogoUrl: true, shopCoverUrl: true } });
  assert.equal(saved.shopLogoUrl, null);
  assert.equal(saved.shopCoverUrl, null);
  assert.equal(store.logo, null);
  assert.equal(store.bannerImage, null);
  assert.equal((await details(buyer, { shopCoverUrl: 'https://tracker.example/c.png' })).status, 400);
  const added = await details(buyer, { shopCoverUrl: '/uploads/ci-later-cover.webp' });
  assert.equal(added.status, 200, added.body?.message);
  assert.equal((await h.prisma.store.findUnique({ where: { ownerId: buyer.id } })).bannerImage, '/uploads/ci-later-cover.webp');
});

test('the payment QR from the application becomes the shop\'s QR, and approval copies it', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const approve = (u) => h.api('POST', `/auth/users/${u.id}/approve-seller`, { token: h.token(admin) });

  // Both GCash and QR Ph picked, one QR uploaded and marked as the QR Ph one.
  const { buyer, store } = await apply({
    payoutMethods: ['GCASH', 'QRPH'],
    payoutAccountName: 'Ana Reyes',
    payoutAccountNumber: '09171234567',
    payoutQrUrl: '/uploads/ci-apply-qr.png',
    payoutQrType: 'qrph',
  });
  const saved = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { payoutQrUrl: true, payoutQrType: true } });
  assert.deepEqual(saved, { payoutQrUrl: '/uploads/ci-apply-qr.png', payoutQrType: 'QRPH' });
  assert.equal(store.paymentQrImage, '/uploads/ci-apply-qr.png');
  assert.equal(store.paymentQrType, 'QRPH');
  assert.equal((await approve(buyer)).status, 200);
  assert.equal((await h.prisma.store.findUnique({ where: { ownerId: buyer.id } })).paymentQrImage, '/uploads/ci-apply-qr.png');

  // Applied before shops opened at application time: approval makes the shop
  // with the QR (its kind from the only QR method picked).
  const legacy = await h.user('BUYER', {
    sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: `Ci Legacy Qr ${h.RUN}`,
    payoutMethod: 'GCASH', payoutMethods: ['GCASH', 'COD_ONLY'], payoutAccountName: 'Ben Cruz', payoutAccountNumber: '0918 765 4321',
    payoutQrUrl: '/uploads/ci-legacy-qr.png',
  });
  applicants.push(legacy.id);
  assert.equal((await approve(legacy)).status, 200);
  const made = await h.prisma.store.findUnique({ where: { ownerId: legacy.id } });
  assert.equal(made.paymentQrImage, '/uploads/ci-legacy-qr.png');
  assert.equal(made.paymentQrType, 'GCASH');
  assert.equal(made.paymentAccountNumber, '09187654321');

  // A shop that set up its own payment keeps it.
  const own = await h.user('SELLER', {
    sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(),
    payoutMethod: 'GCASH', payoutMethods: ['GCASH'], payoutAccountName: 'Cy Lim', payoutAccountNumber: '09170000000',
    payoutQrUrl: '/uploads/ci-app-qr.png',
  });
  const ownShop = await h.shop(own);
  await h.prisma.store.update({ where: { id: ownShop.id }, data: { isApproved: false, paymentQrImage: '/uploads/ci-own-qr.png', paymentQrType: 'QRPH' } });
  assert.equal((await approve(own)).status, 200);
  const kept = await h.prisma.store.findUnique({ where: { id: ownShop.id } });
  assert.equal(kept.paymentQrImage, '/uploads/ci-own-qr.png');
  assert.equal(kept.paymentQrType, 'QRPH');

  // A QR goes up only with an account number that fits it, as in Payment options.
  const typo = await h.user('BUYER', {
    sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: `Ci Typo Qr ${h.RUN}`,
    payoutMethod: 'GCASH', payoutMethods: ['GCASH'], payoutAccountName: 'Di Santos', payoutAccountNumber: '12345',
    payoutQrUrl: '/uploads/ci-typo-qr.png',
  });
  applicants.push(typo.id);
  assert.equal((await approve(typo)).status, 200);
  const noQr = await h.prisma.store.findUnique({ where: { ownerId: typo.id } });
  assert.equal(noQr.paymentQrImage, null);
  assert.equal(noQr.paymentQrType, 'GCASH');
});
