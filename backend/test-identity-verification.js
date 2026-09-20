const crypto = require('crypto');
const sharp = require('sharp');
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');
const { shutdown: shutdownOcr } = require('./src/utils/identityOcr');

// Requires the API to be running (npm run dev) against the local database.
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const createdUserIds = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (path, token, options = {}) => {
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

// Renders a simple PhilSys-style card so the test does not depend on a real ID.
const renderIdCard = async ({ lastName = '', givenNames = '', idNumber = '', address = '' }) => {
  const lines = [
    'REPUBLIKA NG PILIPINAS',
    'PAMBANSANG PAGKAKAKILANLAN',
    'Philippine Identification Card',
    idNumber,
    lastName && `Last Name: ${lastName}`,
    givenNames && `Given Names: ${givenNames}`,
    'Date of Birth: JANUARY 15, 1990',
    address && `Address: ${address}`,
  ].filter(Boolean);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="460">
    <rect width="100%" height="100%" fill="#eef3f7"/>
    ${lines.map((line, i) => `<text x="30" y="${50 + i * 50}" font-family="Arial" font-size="28" fill="#111">${line}</text>`).join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
};

const submitId = (token, image, idType = 'PHILSYS', backImage = null) => {
  const form = new FormData();
  form.append('idType', idType);
  form.append('idImage', new Blob([image], { type: 'image/jpeg' }), 'id.jpg');
  if (backImage) form.append('idBackImage', new Blob([backImage], { type: 'image/jpeg' }), 'id-back.jpg');
  return request('/identity-verification', token, { method: 'POST', body: form });
};

const createBuyer = async (municipalityId, fullName) => {
  const user = await prisma.user.create({
    data: {
      email: `idv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.test`,
      password: 'not-used-by-this-test',
      fullName,
      municipalityId,
      province: 'Oriental Mindoro',
      barangay: 'Poblacion',
      role: 'BUYER',
      isActive: true,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const run = async () => {
  const municipality = await prisma.municipality.findFirst({ where: { isActive: true } });
  assert(municipality, 'An active municipality is required');

  const buyer = await createBuyer(municipality.id, 'Juan Dela Cruz');
  const otherBuyer = await createBuyer(municipality.id, 'Juan Dela Cruz');
  const token = generateTokens(buyer).accessToken;
  const otherToken = generateTokens(otherBuyer).accessToken;
  const idNumber = `${crypto.randomInt(1000, 9999)}-${crypto.randomInt(1000, 9999)}-${crypto.randomInt(1000, 9999)}-${crypto.randomInt(1000, 9999)}`;
  const address = `POBLACION, ${municipality.name.toUpperCase()}, ORIENTAL MINDORO`;

  const results = [];
  const check = async (name, operation, expectedStatus, predicate = () => true) => {
    const result = await operation();
    assert(result.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body?.message)}`);
    assert(predicate(result.body), `${name}: response assertion failed ${JSON.stringify(result.body?.data || result.body)}`);
    results.push({ name, status: 'PASS', httpStatus: result.status });
  };

  await check('New buyer starts not verified', () => request('/identity-verification', token), 200,
    (body) => body.data.status === 'NOT_VERIFIED');

  await check('Unverified buyer cannot place an order', () => request('/orders', token, {
    method: 'POST',
    body: JSON.stringify({ storeId: 'any', items: [] }),
  }), 403, (body) => body.errors?.[0]?.code === 'IDENTITY_VERIFICATION_REQUIRED');

  await check('Status cannot be set directly', () => request('/identity-verification', token, {
    method: 'PUT',
    body: JSON.stringify({ status: 'VERIFIED' }),
  }), 404);

  await check('Profile update cannot set verification', async () => {
    await request('/auth/profile', token, { method: 'PUT', body: JSON.stringify({ contactNumber: '09170000000', status: 'VERIFIED', identityVerification: { status: 'VERIFIED' } }) });
    return request('/identity-verification', token);
  }, 200, (body) => body.data.status === 'NOT_VERIFIED');

  const wrongName = await renderIdCard({ lastName: 'SANTOS', givenNames: 'PEDRO', idNumber, address });
  await check('Mismatched name fails', () => submitId(token, wrongName), 200,
    (body) => body.data.status === 'FAILED' && /name/i.test(body.data.failureReason));

  const blank = await sharp({ create: { width: 900, height: 460, channels: 3, background: '#eef3f7' } }).jpeg().toBuffer();
  await check('Unreadable photo fails', () => submitId(token, blank), 200,
    (body) => body.data.status === 'FAILED' && /couldn't read/i.test(body.data.failureReason) && !body.data.attempt);

  // Split card: the name and ID number are on the front, the address on the back.
  const frontOnly = await renderIdCard({ lastName: 'DELA CRUZ', givenNames: 'JUAN', idNumber, address: '' });
  await check('Front alone fails when the address is on the back', () => submitId(token, frontOnly), 200,
    (body) => body.data.status === 'FAILED' && /address/i.test(body.data.failureReason));

  const backOnly = await renderIdCard({ address });
  await check('Front + back verifies', () => submitId(token, frontOnly, 'PHILSYS', backOnly), 200,
    (body) => body.data.status === 'VERIFIED');

  // Same ID, printed on a single side — used by the checks below.
  const matching = await renderIdCard({ lastName: 'DELA CRUZ', givenNames: 'JUAN', idNumber, address });

  // The payload is invalid on purpose; any error other than the identity gate proves the gate passed.
  const gated = await request('/orders', token, {
    method: 'POST',
    body: JSON.stringify({ storeId: 'missing-store', items: [] }),
  });
  assert(gated.body?.errors?.[0]?.code !== 'IDENTITY_VERIFICATION_REQUIRED', 'Verified buyer should pass the checkout gate');
  results.push({ name: 'Verified buyer passes the checkout gate', status: 'PASS', httpStatus: gated.status });

  await check('Verified buyer cannot resubmit', () => submitId(token, matching), 409);

  await check('Profile does not expose verification data', () => request('/auth/profile', token), 200,
    (body) => !JSON.stringify(body.data).match(/identityVerification|encryptedData|idNumberHash/));

  const stored = await prisma.identityVerification.findUnique({ where: { userId: buyer.id } });
  assert(stored.encryptedData && !stored.encryptedData.includes('DELA'), 'Extracted data must be encrypted');
  assert(stored.idNumberHash && !stored.idNumberHash.includes(idNumber.slice(0, 4)), 'ID number must be hashed');
  results.push({ name: 'Stored data is encrypted and hashed', status: 'PASS' });

  await check('Same ID cannot verify a second account', () => submitId(otherToken, matching), 200,
    (body) => body.data.status === 'FAILED' && /another account/i.test(body.data.failureReason));

  await check('Changing profile name revokes verification', async () => {
    await request('/auth/profile', token, { method: 'PUT', body: JSON.stringify({ fullName: 'Juan Cruz Reyes' }) });
    return request('/identity-verification', token);
  }, 200, (body) => body.data.status === 'NOT_VERIFIED');

  const auditRows = await prisma.auditLog.findMany({
    where: { userId: buyer.id, action: { startsWith: 'IDENTITY_VERIFICATION' } },
  });
  assert(auditRows.length >= 4, 'Attempts must be audit logged');
  assert(!JSON.stringify(auditRows).includes(idNumber), 'Audit log must not contain the ID number');
  results.push({ name: 'Attempts are audit logged without ID data', status: 'PASS' });

  console.log(JSON.stringify({ success: true, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await shutdownOcr();
    await prisma.$disconnect();
  });
