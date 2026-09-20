const crypto = require('crypto');
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');

// Seller application lifecycle: server-side validation, the shop's own
// municipality, rejection (reason stored, role reverted, re-apply allowed),
// approval (role granted, store created), drafts and duplicate shop names.
// Requires the API to be running (npm run dev).
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const createdUserIds = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (path, token, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

const createBuyer = async (municipalityId, name, overrides = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `apply-${name}-${suffix}@example.test`,
      password: 'not-used-by-this-test',
      fullName: `Apply Test ${name}`,
      contactNumber: '09171234567',
      municipalityId,
      role: 'BUYER',
      isActive: true,
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const run = async () => {
  const municipalAdmin = await prisma.user.findFirst({
    where: { role: 'MUNICIPAL_ADMIN', isActive: true, deletedAt: null },
  });
  assert(municipalAdmin, 'A municipal admin is required');

  const adminMunicipality = municipalAdmin.municipalityId;
  const otherMunicipality = await prisma.municipality.findFirst({
    where: { id: { not: adminMunicipality }, isActive: true },
  });
  assert(otherMunicipality, 'A second municipality is required');

  const categories = await prisma.category.findMany({ take: 2, select: { id: true } });
  assert(categories.length > 0, 'At least one category is required');
  const categoryIds = categories.map((c) => c.id);

  // The applicant's PROFILE is in the other municipality; the SHOP they are
  // opening is in the admin's municipality. The review must follow the shop.
  const applicant = await createBuyer(otherMunicipality.id, 'applicant');
  const applicantToken = generateTokens(applicant).accessToken;
  const adminToken = generateTokens(municipalAdmin).accessToken;

  const results = [];
  const check = async (name, operation, expectedStatus, predicate = () => true) => {
    const result = await operation();
    assert(
      result.status === expectedStatus,
      `${name}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body?.message)}`
    );
    assert(predicate(result.body?.data, result.body), `${name}: response did not match expectations`);
    results.push({ name, status: 'PASS' });
    return result.body?.data;
  };

  const shopName = `Test Shop ${suffix}`;
  const validApplication = {
    shopName,
    shopDescription: 'Fresh calamansi and local produce.',
    shopAddress: `Purok 1, Poblacion, ${otherMunicipality.name}`,
    shopMunicipalityId: adminMunicipality,
    shopBarangay: 'Poblacion',
    shopCategories: categoryIds,
    sellerBusinessType: 'INDIVIDUAL',
    payoutMethod: 'GCASH',
    payoutAccountName: 'Apply Test applicant',
    payoutAccountNumber: '09171234567',
    fulfillmentPreference: 'DELIVERY',
    idType: 'Passport',
    idFrontUrl: 'kyc-front.jpg',
    idBackUrl: 'kyc-back.jpg',
    acceptedTerms: true,
  };

  // ── Server-side validation ────────────────────────────────────────────
  await check('Rejects an application with no shop name', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, shopName: '' },
  }), 400);
  await check('Rejects a shop name that is too short', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, shopName: 'ab' },
  }), 400);
  await check('Rejects a missing ID', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, idFrontUrl: '', idBackUrl: '' },
  }), 400);
  await check('Rejects an unknown shop municipality', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, shopMunicipalityId: crypto.randomUUID() },
  }), 400);
  await check('Rejects an application with no categories', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, shopCategories: [] },
  }), 400);
  await check('Rejects an application without accepting the terms', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, acceptedTerms: false },
  }), 400);

  // ── Draft ─────────────────────────────────────────────────────────────
  await check('Saves a draft', () => request('/auth/seller-application/draft', applicantToken, {
    method: 'PUT', body: { draft: { shopName: 'Half typed', street: 'Purok 1', extraJunk: 'dropped' } },
  }), 200, (d) => d.draft.shopName === 'Half typed' && d.draft.extraJunk === undefined);
  await check('Reads the draft back', () => request('/auth/seller-application', applicantToken), 200,
    (d) => d.draft?.shopName === 'Half typed' && d.status === null);

  // ── Submission ────────────────────────────────────────────────────────
  const submitted = await check('Submits a valid application', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: validApplication,
  }), 200, (d) => d.sellerApplicationStatus === 'PENDING');

  assert(submitted.role === 'BUYER', 'Applicant must stay a BUYER until approved');
  results.push({ name: 'Submitting does not grant the SELLER role', status: 'PASS' });

  const afterSubmit = await prisma.user.findUnique({
    where: { id: applicant.id },
    select: {
      shopMunicipalityId: true, sellerTermsAcceptedAt: true, sellerTermsVersion: true,
      sellerApplicationDraft: true, sellerApplicationHistory: true, store: { select: { id: true } },
    },
  });
  assert(afterSubmit.shopMunicipalityId === adminMunicipality, 'Shop municipality must come from the picker');
  results.push({ name: 'Stores the shop municipality chosen in the form', status: 'PASS' });
  assert(afterSubmit.sellerTermsAcceptedAt && afterSubmit.sellerTermsVersion, 'Terms consent must be recorded');
  results.push({ name: 'Records the terms version and timestamp', status: 'PASS' });
  assert(afterSubmit.sellerApplicationDraft === null, 'Submitting clears the draft');
  results.push({ name: 'Submitting clears the saved draft', status: 'PASS' });
  assert(!afterSubmit.store, 'No store exists before approval');
  results.push({ name: 'No store is created before approval', status: 'PASS' });
  assert(afterSubmit.sellerApplicationHistory?.[0]?.action === 'SUBMITTED', 'History records the submission');
  results.push({ name: 'Application history records the submission', status: 'PASS' });

  const adminNotified = await prisma.notification.findFirst({
    where: { userId: municipalAdmin.id, type: 'SELLER_APPLICATION_SUBMITTED', relatedId: applicant.id },
  });
  assert(adminNotified, "The shop municipality's admin must be notified");
  results.push({ name: "Notifies the shop municipality's admin, not the profile's", status: 'PASS' });

  await check('Blocks a second application while one is pending', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: validApplication,
  }), 400);

  // ── Rejection ─────────────────────────────────────────────────────────
  await check('Rejection requires a reason', () => request(`/auth/users/${applicant.id}/reject-seller`, adminToken, {
    method: 'POST', body: {},
  }), 400);

  const reason = 'The ID photo is too blurry to read.';
  await check('Admin rejects with a reason', () => request(`/auth/users/${applicant.id}/reject-seller`, adminToken, {
    method: 'POST', body: { reason },
  }), 200, (d) => d.sellerApplicationStatus === 'REJECTED' && d.role === 'BUYER');
  results.push({ name: 'Rejection reverts the account to BUYER', status: 'PASS' });

  await check('Applicant can read why it was rejected', () => request('/auth/seller-application', applicantToken), 200,
    (d) => d.status === 'REJECTED' && d.rejectionReason === reason && d.reviewedAt);
  await check('The profile carries the rejection reason', () => request('/auth/profile', applicantToken), 200,
    (d) => d.sellerRejectionReason === reason);

  const afterReject = await prisma.user.findUnique({
    where: { id: applicant.id }, select: { sellerApplicationHistory: true },
  });
  assert(afterReject.sellerApplicationHistory?.some((e) => e.action === 'REJECTED' && e.reason === reason),
    'History records the rejection and its reason');
  results.push({ name: 'Application history records the rejection', status: 'PASS' });

  // ── Re-apply after rejection ──────────────────────────────────────────
  const resubmitted = await check('Rejected applicant can re-apply', () => request('/auth/apply-seller', applicantToken, {
    method: 'POST', body: { ...validApplication, idFrontUrl: 'kyc-front-2.jpg' },
  }), 200, (d) => d.sellerApplicationStatus === 'PENDING');
  assert(resubmitted.role === 'BUYER', 'A resubmission still does not grant the SELLER role');
  const afterResubmit = await prisma.user.findUnique({
    where: { id: applicant.id }, select: { sellerRejectionReason: true },
  });
  assert(afterResubmit.sellerRejectionReason === null, 'Re-applying clears the previous rejection reason');
  results.push({ name: 'Re-applying clears the previous verdict', status: 'PASS' });

  // ── Approval ──────────────────────────────────────────────────────────
  await check('Admin approves', () => request(`/auth/users/${applicant.id}/approve-seller`, adminToken, {
    method: 'POST',
  }), 200, (d) => d.role === 'SELLER' && d.sellerApplicationStatus === 'APPROVED');

  const store = await prisma.store.findUnique({ where: { ownerId: applicant.id } });
  assert(store, 'Approval creates the store');
  assert(store.isActive, 'The new store is live');
  assert(store.municipalityId === adminMunicipality, 'The store is filed under the shop municipality');
  results.push({ name: 'Approval creates a live store in the shop municipality', status: 'PASS' });

  // ── Duplicate shop name ───────────────────────────────────────────────
  const copycat = await createBuyer(adminMunicipality, 'copycat');
  const copycatToken = generateTokens(copycat).accessToken;
  await check('Blocks a duplicate shop name', () => request('/auth/apply-seller', copycatToken, {
    method: 'POST', body: { ...validApplication, shopName: shopName.toLowerCase() },
  }), 409);
  await check('Accepts a free shop name', () => request('/auth/apply-seller', copycatToken, {
    method: 'POST', body: { ...validApplication, shopName: `Another Shop ${suffix}` },
  }), 200);

  // ── Missing contact number ────────────────────────────────────────────
  const noContact = await createBuyer(adminMunicipality, 'nocontact', { contactNumber: null });
  await check('Blocks applying without a contact number', () => request('/auth/apply-seller',
    generateTokens(noContact).accessToken, {
      method: 'POST', body: { ...validApplication, shopName: `No Contact ${suffix}` },
    }), 400);

  console.log(JSON.stringify({ success: true, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.store.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({
      where: { OR: [{ userId: { in: createdUserIds } }, { relatedId: { in: createdUserIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });
