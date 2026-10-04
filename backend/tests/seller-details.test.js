const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

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
