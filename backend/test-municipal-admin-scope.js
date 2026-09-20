const crypto = require('crypto');
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');

const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const createdUserIds = [];
const createdReportIds = [];
const createdReviewIds = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (path, token, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

const createTemporaryUser = async (municipalityId, role, suffix) => {
  const user = await prisma.user.create({
    data: {
      email: `scope-${suffix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.test`,
      password: 'not-used-by-this-test',
      fullName: `Scope Test ${suffix}`,
      municipalityId,
      province: 'Oriental Mindoro',
      role,
      isActive: true,
      isVerified: true,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const run = async () => {
  const municipalAdmin = await prisma.user.findFirst({
    where: { role: 'MUNICIPAL_ADMIN', isActive: true, municipalityId: { not: '' } },
  });
  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  assert(municipalAdmin?.municipalityId, 'No assigned active Municipal Admin fixture found');
  assert(superAdmin, 'No active Superadmin fixture found');

  const otherMunicipality = await prisma.municipality.findFirst({
    where: { id: { not: municipalAdmin.municipalityId }, isActive: true },
  });
  assert(otherMunicipality, 'A second active municipality is required');

  const sameBuyer = await createTemporaryUser(municipalAdmin.municipalityId, 'BUYER', 'same-buyer');
  const sameSeller = await createTemporaryUser(municipalAdmin.municipalityId, 'SELLER', 'same-seller');
  const otherBuyer = await createTemporaryUser(otherMunicipality.id, 'BUYER', 'other-buyer');
  const otherSeller = await createTemporaryUser(otherMunicipality.id, 'SELLER', 'other-seller');
  const sameApplicant = await createTemporaryUser(municipalAdmin.municipalityId, 'BUYER', 'same-applicant');
  const otherApplicant = await createTemporaryUser(otherMunicipality.id, 'BUYER', 'other-applicant');
  await prisma.user.updateMany({
    where: { id: { in: [sameApplicant.id, otherApplicant.id] } },
    data: { sellerApplicationStatus: 'PENDING', sellerApplicationDate: new Date(), shopName: 'Scope Test Shop' },
  });

  const municipalToken = generateTokens(municipalAdmin).accessToken;
  const superToken = generateTokens(superAdmin).accessToken;
  const buyerToken = generateTokens(sameBuyer).accessToken;

  const results = [];
  const check = async (name, operation, expectedStatus, predicate = () => true) => {
    const result = await operation();
    assert(result.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${result.status}`);
    assert(predicate(result.body), `${name}: response assertion failed`);
    results.push({ name, status: 'PASS', httpStatus: result.status });
  };

  await check('Municipal Admin views same-municipality buyer', () => request(`/auth/users/${sameBuyer.id}`, municipalToken), 200);
  await check('Municipal Admin views same-municipality seller', () => request(`/auth/users/${sameSeller.id}`, municipalToken), 200);
  await check('Municipal Admin denied other-municipality buyer', () => request(`/auth/users/${otherBuyer.id}`, municipalToken), 403);
  await check('Municipal Admin denied other-municipality seller', () => request(`/auth/users/${otherSeller.id}`, municipalToken), 403);
  await check('Municipal Admin cannot list admin roles', () => request('/auth/users?role=SUPER_ADMIN', municipalToken), 403);

  await check(
    'Municipal Admin user list ignores foreign municipality override',
    () => request(`/auth/users?role=BUYER&municipalityId=${otherMunicipality.id}&pageSize=100`, municipalToken),
    200,
    (body) => (body?.data || []).every((user) => user.municipalityId === municipalAdmin.municipalityId)
  );

  await check('Municipal Admin suspends local buyer', () => request(`/auth/users/${sameBuyer.id}/suspend`, municipalToken, { method: 'POST' }), 200);
  await check('Municipal Admin reactivates local buyer', () => request(`/auth/users/${sameBuyer.id}/activate`, municipalToken, { method: 'POST' }), 200);
  await check('Municipal Admin denied suspending foreign buyer', () => request(`/auth/users/${otherBuyer.id}/suspend`, municipalToken, { method: 'POST' }), 403);
  await check('Municipal Admin suspends local seller', () => request(`/auth/users/${sameSeller.id}/suspend`, municipalToken, { method: 'POST' }), 200);
  await check('Municipal Admin reactivates local seller', () => request(`/auth/users/${sameSeller.id}/activate`, municipalToken, { method: 'POST' }), 200);
  await check('Municipal Admin denied suspending foreign seller', () => request(`/auth/users/${otherSeller.id}/suspend`, municipalToken, { method: 'POST' }), 403);
  await check('Municipal Admin approves local seller application', () => request(`/auth/users/${sameApplicant.id}/approve-seller`, municipalToken, { method: 'POST' }), 200);
  await check('Municipal Admin denied foreign seller application approval', () => request(`/auth/users/${otherApplicant.id}/approve-seller`, municipalToken, { method: 'POST' }), 403);
  await check('Municipal Admin denied foreign seller application rejection', () => request(`/auth/users/${otherApplicant.id}/reject-seller`, municipalToken, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Scope test' }),
  }), 403);

  await prisma.user.update({ where: { id: sameBuyer.id }, data: { municipalityId: otherMunicipality.id } });
  await check('Municipality change immediately removes admin scope', () => request(`/auth/users/${sameBuyer.id}`, municipalToken), 403);
  await check('Superadmin still views moved user', () => request(`/auth/users/${sameBuyer.id}`, superToken), 200);

  await check('Buyer profile remains available', () => request('/auth/profile', buyerToken), 200);
  await check('Public product flow remains available', () => request('/products?page=1&pageSize=1', municipalToken), 200);

  const outsideOrder = await prisma.order.findFirst({
    where: {
      AND: [
        { buyer: { municipalityId: { not: municipalAdmin.municipalityId } } },
        { store: { municipalityId: { not: municipalAdmin.municipalityId } } },
      ],
    },
    select: { id: true },
  });

  if (outsideOrder) {
    await check('Municipal Admin denied foreign order detail', () => request(`/orders/${outsideOrder.id}`, municipalToken), 403);
    await check(
      'Municipal Admin order list ignores foreign municipality override',
      () => request(`/orders?municipalityId=${otherMunicipality.id}&pageSize=100`, municipalToken),
      200,
      (body) => !(body?.data || []).some((order) => order.id === outsideOrder.id)
    );
    await check('Municipal Admin denied foreign payment mutation', () => request(`/orders/${outsideOrder.id}/payment`, municipalToken, {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus: 'PAID' }),
    }), 403);
    await check('Superadmin views foreign order detail', () => request(`/orders/${outsideOrder.id}`, superToken), 200);
  } else {
    results.push({ name: 'Foreign order tests', status: 'SKIPPED', reason: 'No foreign order fixture exists' });
  }

  const foreignProduct = await prisma.product.findFirst({
    where: { municipalityId: { not: municipalAdmin.municipalityId }, deletedAt: null },
    select: { id: true },
  });
  if (foreignProduct) {
    await check('Municipal Admin denied foreign product mutation', () => request(`/products/${foreignProduct.id}/archive`, municipalToken, { method: 'POST' }), 403);
    await check(
      'Municipal Admin product list ignores foreign municipality override',
      () => request(`/products?municipalityId=${otherMunicipality.id}&pageSize=100`, municipalToken),
      200,
      (body) => !(body?.data || []).some((product) => product.id === foreignProduct.id)
    );
  } else {
    results.push({ name: 'Foreign product tests', status: 'SKIPPED', reason: 'No foreign product fixture exists' });
  }

  const foreignStore = await prisma.store.findFirst({
    where: { municipalityId: { not: municipalAdmin.municipalityId }, deletedAt: null },
    select: { id: true },
  });
  if (foreignStore) {
    await check('Municipal Admin denied foreign store suspension', () => request(`/stores/${foreignStore.id}/suspend`, municipalToken, { method: 'POST' }), 403);
  } else {
    results.push({ name: 'Foreign store test', status: 'SKIPPED', reason: 'No foreign store fixture exists' });
  }

  const localReport = await prisma.report.create({
    data: {
      reporterId: sameSeller.id,
      type: 'SELLER',
      reportedSellerId: sameSeller.id,
      reason: 'Temporary municipal scope test',
      municipalityId: municipalAdmin.municipalityId,
    },
  });
  const foreignReport = await prisma.report.create({
    data: {
      reporterId: otherSeller.id,
      type: 'SELLER',
      reportedSellerId: otherSeller.id,
      reason: 'Temporary cross-municipality scope test',
      municipalityId: otherMunicipality.id,
    },
  });
  createdReportIds.push(localReport.id, foreignReport.id);
  await check('Municipal Admin manages local report', () => request(`/reports/${localReport.id}/status`, municipalToken, {
    method: 'PUT',
    body: JSON.stringify({ status: 'UNDER_REVIEW' }),
  }), 200);
  await check('Municipal Admin denied foreign report mutation', () => request(`/reports/${foreignReport.id}/status`, municipalToken, {
    method: 'PUT',
    body: JSON.stringify({ status: 'UNDER_REVIEW' }),
  }), 403);
  await check('Municipal Admin views local report', () => request(`/reports/${localReport.id}`, municipalToken), 200);
  await check('Municipal Admin denied foreign report detail', () => request(`/reports/${foreignReport.id}`, municipalToken), 403);
  await check('Superadmin views foreign report detail', () => request(`/reports/${foreignReport.id}`, superToken), 200);

  const localProduct = await prisma.product.findFirst({
    where: { municipalityId: municipalAdmin.municipalityId, deletedAt: null },
    select: { id: true },
  });
  if (localProduct && foreignProduct) {
    const localReview = await prisma.review.create({
      data: { userId: sameSeller.id, productId: localProduct.id, rating: 5, comment: 'Temporary municipal scope test' },
    });
    const foreignReview = await prisma.review.create({
      data: { userId: otherBuyer.id, productId: foreignProduct.id, rating: 5, comment: 'Temporary cross-municipality scope test' },
    });
    createdReviewIds.push(localReview.id, foreignReview.id);
    await check('Municipal Admin denied deleting foreign review', () => request(`/reviews/${foreignReview.id}`, municipalToken, { method: 'DELETE' }), 403);
    await check('Municipal Admin deletes local review', () => request(`/reviews/${localReview.id}`, municipalToken, { method: 'DELETE' }), 204);
    await check('Superadmin deletes foreign review', () => request(`/reviews/${foreignReview.id}`, superToken, { method: 'DELETE' }), 204);
  } else {
    results.push({ name: 'Review deletion tests', status: 'SKIPPED', reason: 'Local and foreign product fixtures are required' });
  }

  const foreignReturn = await prisma.returnRequest.findFirst({
    where: { store: { municipalityId: { not: municipalAdmin.municipalityId } } },
    select: { id: true },
  });
  if (foreignReturn) {
    await check('Municipal Admin denied foreign return detail', () => request(`/returns/${foreignReturn.id}`, municipalToken), 403);
    await check('Superadmin views foreign return detail', () => request(`/returns/${foreignReturn.id}`, superToken), 200);
  } else {
    results.push({ name: 'Foreign return test', status: 'SKIPPED', reason: 'No foreign return request fixture exists' });
  }
  const localReturn = await prisma.returnRequest.findFirst({
    where: { store: { municipalityId: municipalAdmin.municipalityId } },
    select: { id: true },
  });
  if (localReturn) {
    await check('Municipal Admin views local return detail', () => request(`/returns/${localReturn.id}`, municipalToken), 200);
  } else {
    results.push({ name: 'Local return test', status: 'SKIPPED', reason: 'No local return request fixture exists' });
  }

  await check(
    'Municipal Admin report list ignores foreign municipality override',
    () => request(`/reports?municipalityId=${otherMunicipality.id}&pageSize=100`, municipalToken),
    200,
    (body) => (body?.data || []).some((report) => report.id === localReport.id)
      && !(body?.data || []).some((report) => report.id === foreignReport.id)
  );

  console.log(JSON.stringify({ success: true, municipalAdminMunicipalityId: municipalAdmin.municipalityId, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdReviewIds.length > 0) {
      await prisma.review.deleteMany({ where: { id: { in: createdReviewIds } } });
    }
    if (createdReportIds.length > 0) {
      await prisma.report.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
      // Approving a seller creates their store, which references the owner.
      await prisma.store.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });
