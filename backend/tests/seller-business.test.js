const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

// Applying notifies the town's admins about the applicant (relatedId).
const applicants = [];
after(async () => {
  if (applicants.length) await h.prisma.notification.deleteMany({ where: { relatedId: { in: applicants } } });
  await h.cleanup();
});

const applyAs = async (buyer, body) => {
  const { municipality } = await h.reference();
  const category = await h.prisma.category.findFirst({ select: { id: true } });
  return h.api('POST', '/auth/apply-seller', {
    token: h.token(buyer),
    body: {
      shopName: `Ci Business Shop ${h.RUN} ${buyer.id.slice(0, 6)}`,
      shopAddress: 'Stall 4, Public Market',
      shopMunicipalityId: municipality.id,
      shopCategories: [category.id],
      acceptedTerms: true,
      ...body,
    },
  });
};

test('a registered business applies with its permit, papers and TIN', async () => {
  const buyer = await h.user('BUYER', { contactNumber: '09171234567' });
  applicants.push(buyer.id);

  // The permit number is what a registered business has to give.
  const missing = await applyAs(buyer, { sellerBusinessType: 'REGISTERED', sellerBirTin: '123-456-789-000' });
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /permit/i);

  const res = await applyAs(buyer, {
    sellerBusinessType: 'registered',
    sellerPermitNumber: ' DTI-0123456 ',
    sellerPermitUrl: 'ci-permit-papers.jpg',
    sellerBirTin: '123-456-789-000',
  });
  assert.ok([200, 201].includes(res.status), res.body?.message);
  const saved = await h.prisma.user.findUnique({
    where: { id: buyer.id },
    select: { sellerBusinessType: true, sellerPermitNumber: true, sellerPermitUrl: true, sellerBirTin: true },
  });
  assert.deepEqual(saved, {
    sellerBusinessType: 'REGISTERED',
    sellerPermitNumber: 'DTI-0123456',
    sellerPermitUrl: 'ci-permit-papers.jpg',
    sellerBirTin: '123-456-789-000',
  });

  // The guided setup reads them back as given.
  const status = await h.api('GET', '/auth/seller-application', { token: h.token(buyer) });
  assert.equal(status.body.data.details.sellerBusinessType, 'REGISTERED');
  assert.equal(status.body.data.details.sellerPermitNumber, 'DTI-0123456');
});

test('an individual seller sends no business papers', async () => {
  const buyer = await h.user('BUYER', { contactNumber: '09171234568' });
  applicants.push(buyer.id);
  const res = await applyAs(buyer, { sellerBusinessType: 'INDIVIDUAL', sellerPermitNumber: 'left over', sellerBirTin: '111' });
  assert.ok([200, 201].includes(res.status), res.body?.message);
  const saved = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { sellerBusinessType: true, sellerPermitNumber: true, sellerBirTin: true } });
  assert.deepEqual(saved, { sellerBusinessType: 'INDIVIDUAL', sellerPermitNumber: null, sellerBirTin: null });
});
