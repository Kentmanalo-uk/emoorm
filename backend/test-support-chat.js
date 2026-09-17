const crypto = require('crypto');
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');
const config = require('./src/config/env');

// User ↔ municipal admin support chat, plus the identity verification daily limit.
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

const createUser = async (municipalityId, role, name) => {
  const user = await prisma.user.create({
    data: {
      email: `support-${name}-${suffix}@example.test`,
      password: 'not-used-by-this-test',
      fullName: `Support Test ${name}`,
      municipalityId,
      role,
      isActive: true,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const run = async () => {
  const municipalAdmin = await prisma.user.findFirst({
    where: { role: 'MUNICIPAL_ADMIN', isActive: true, deletedAt: null },
  });
  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  assert(municipalAdmin && superAdmin, 'A municipal admin and a superadmin are required');
  const otherMunicipality = await prisma.municipality.findFirst({
    where: { id: { not: municipalAdmin.municipalityId }, isActive: true },
  });
  assert(otherMunicipality, 'A second municipality is required');

  const buyer = await createUser(municipalAdmin.municipalityId, 'BUYER', 'buyer');
  const otherAdmin = await createUser(otherMunicipality.id, 'MUNICIPAL_ADMIN', 'other-admin');
  const outsider = await createUser(municipalAdmin.municipalityId, 'BUYER', 'outsider');

  const buyerToken = generateTokens(buyer).accessToken;
  const adminToken = generateTokens(municipalAdmin).accessToken;
  const otherAdminToken = generateTokens(otherAdmin).accessToken;
  const superToken = generateTokens(superAdmin).accessToken;
  const outsiderToken = generateTokens(outsider).accessToken;

  const results = [];
  const check = async (name, operation, expectedStatus, predicate = () => true) => {
    const result = await operation();
    assert(result.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body?.message)}`);
    assert(predicate(result.body?.data), `${name}: assertion failed ${JSON.stringify(result.body?.data)}`);
    results.push({ name, status: 'PASS', httpStatus: result.status });
    return result.body?.data;
  };

  // Daily limit → status shows 0 attempts and submissions are refused.
  const limit = config.identity.maxAttemptsPerDay;
  assert(limit > 0, 'IDENTITY_MAX_ATTEMPTS_PER_DAY must be above 0 for this test');
  await prisma.auditLog.createMany({
    data: Array.from({ length: limit }, () => ({
      userId: buyer.id, action: 'IDENTITY_VERIFICATION_ATTEMPT', entity: 'IdentityVerification',
    })),
  });
  await check('Status reports no attempts left', () => request('/identity-verification', buyerToken), 200,
    (d) => d.attemptsRemaining === 0);
  const form = new FormData();
  form.append('idType', 'PHILSYS');
  form.append('idImage', new Blob([Buffer.from('x')], { type: 'image/jpeg' }), 'id.jpg');
  const blocked = await fetch(`${BASE_URL}/identity-verification`, {
    method: 'POST', headers: { Authorization: `Bearer ${buyerToken}` }, body: form,
  });
  assert(blocked.status === 429, `Submission over the limit should be 429, got ${blocked.status}`);
  results.push({ name: 'Submission over the daily limit is refused', status: 'PASS', httpStatus: 429 });

  // Contact support routes to the buyer's municipality.
  const conversation = await check('Buyer opens chat with municipal admin', () => request('/support/chat/municipal', buyerToken, {
    method: 'POST', body: { topic: 'IDENTITY_VERIFICATION' },
  }), 200, (d) => d.municipality.id === municipalAdmin.municipalityId && d.topic === 'IDENTITY_VERIFICATION');
  await check('Opening again reuses the conversation', () => request('/support/chat/municipal', buyerToken, {
    method: 'POST', body: { topic: 'IDENTITY_VERIFICATION' },
  }), 200, (d) => d.id === conversation.id);
  await check('Admins cannot open user chats', () => request('/support/chat/municipal', adminToken, { method: 'POST', body: {} }), 400);

  await check('Buyer sends a message', () => request(`/support/chat/${conversation.id}/messages`, buyerToken, {
    method: 'POST', body: { body: 'I reached the verification limit, please help.' },
  }), 201);
  await check('Empty messages are rejected', () => request(`/support/chat/${conversation.id}/messages`, buyerToken, {
    method: 'POST', body: { body: '   ' },
  }), 400);

  await check('Municipal admin sees it in the inbox with unread count', () => request('/support/chat/inbox', adminToken), 200,
    (d) => d.some((c) => c.id === conversation.id && c.unreadCount === 1));
  await check('Other municipality admin does not see it', () => request('/support/chat/inbox', otherAdminToken), 200,
    (d) => !d.some((c) => c.id === conversation.id));
  await check('Other municipality admin cannot open it', () => request(`/support/chat/${conversation.id}`, otherAdminToken), 403);
  await check('Another buyer cannot open it', () => request(`/support/chat/${conversation.id}`, outsiderToken), 403);
  await check('Buyers cannot read the admin inbox', () => request('/support/chat/inbox', buyerToken), 403);
  await check('Superadmin sees it', () => request('/support/chat/inbox', superToken), 200,
    (d) => d.some((c) => c.id === conversation.id));

  await check('Municipal admin replies', () => request(`/support/chat/${conversation.id}/messages`, adminToken, {
    method: 'POST', body: { body: 'Hello! Please bring your ID to the municipal hall.' },
  }), 201);
  await check('Buyer sees the reply as unread', () => request('/support/chat/my', buyerToken), 200,
    (d) => d.some((c) => c.id === conversation.id && c.unreadCount === 1));
  await check('Buyer reads the thread', () => request(`/support/chat/${conversation.id}`, buyerToken), 200,
    (d) => d.messages.length === 2 && d.viewerSide === 'user');
  await check('Reading clears the unread count', () => request('/support/chat/my', buyerToken), 200,
    (d) => d.some((c) => c.id === conversation.id && c.unreadCount === 0));
  const note = await prisma.notification.findFirst({ where: { userId: buyer.id, type: 'SUPPORT_MESSAGE' } });
  assert(note?.relatedId === conversation.id, 'Buyer should be notified of the admin reply');
  results.push({ name: 'Buyer notified of admin reply', status: 'PASS' });

  console.log(JSON.stringify({ success: true, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.supportConversation.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });
