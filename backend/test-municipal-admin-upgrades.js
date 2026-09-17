const crypto = require('crypto');
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');

// Municipal admin upgrades: admin notifications, store/product reasons,
// scoped audit log, attention queue, moderation lists, manual identity
// review, support chat status, and backup admins. Needs `npm run dev`.
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const created = { users: [], storeId: null, productId: null, convoId: null };

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

const createUser = async (municipalityId, role, name, extra = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `mau-${name}-${suffix}@example.test`,
      password: 'not-used-by-this-test',
      fullName: `Upgrade Test ${name}`,
      municipalityId,
      role,
      isActive: true,
      ...extra,
    },
  });
  created.users.push(user.id);
  return user;
};

const run = async () => {
  const admin = await prisma.user.findFirst({
    where: { role: 'MUNICIPAL_ADMIN', isActive: true, deletedAt: null, adminAccessExpiresAt: null },
  });
  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  const other = await prisma.municipality.findFirst({ where: { id: { not: admin?.municipalityId }, isActive: true } });
  const category = await prisma.category.findFirst();
  assert(admin && superAdmin && other && category, 'Fixtures missing (municipal admin, superadmin, 2nd municipality, category)');
  const muni = admin.municipalityId;

  const seller = await createUser(muni, 'SELLER', 'seller');
  const buyer = await createUser(muni, 'BUYER', 'buyer');
  const foreignBuyer = await createUser(other.id, 'BUYER', 'foreign-buyer');
  const backup = await createUser(muni, 'BUYER', 'backup');
  const store = await prisma.store.create({
    data: { name: `Upgrade Store ${suffix}`, slug: `upgrade-store-${suffix}`, ownerId: seller.id, municipalityId: muni },
  });
  created.storeId = store.id;
  const product = await prisma.product.create({
    data: {
      name: `Upgrade Product ${suffix}`, slug: `upgrade-product-${suffix}`, description: 'Temp', price: 10,
      stock: 5, images: [], storeId: store.id, categoryId: category.id, municipalityId: muni, status: 'APPROVED',
    },
  });
  created.productId = product.id;
  await prisma.review.create({ data: { userId: buyer.id, productId: product.id, rating: 2, comment: `Upgrade review ${suffix}` } });

  const tokens = {
    admin: generateTokens(admin).accessToken,
    super: generateTokens(superAdmin).accessToken,
    buyer: generateTokens(buyer).accessToken,
    seller: generateTokens(seller).accessToken,
  };

  const results = [];
  const check = async (name, operation, expectedStatus, predicate = () => true) => {
    const result = await operation();
    assert(result.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body?.message)}`);
    assert(await predicate(result.body?.data, result.body), `${name}: assertion failed ${JSON.stringify(result.body?.data)}`);
    results.push({ name, status: 'PASS', httpStatus: result.status });
    return result.body?.data;
  };

  // 1. Admin notifications (support message from a user in the municipality).
  const convo = await check('Buyer opens support chat', () => request('/support/chat/municipal', tokens.buyer, { method: 'POST', body: {} }), 200);
  created.convoId = convo.id;
  await check('Buyer sends support message', () => request(`/support/chat/${convo.id}/messages`, tokens.buyer, {
    method: 'POST', body: { body: 'Need help with verification' },
  }), 201);
  await check('Admin gets an ADMIN-audience notification', () => request('/notifications?audience=ADMIN&pageSize=50', tokens.admin), 200,
    (d) => d.some((n) => n.relatedId === convo.id && n.audience === 'ADMIN'));
  await check('Admin unread count by audience works', () => request('/notifications/unread/count?audience=ADMIN', tokens.admin), 200);

  // 10. Support chat status.
  await check('Attention queue flags the unanswered chat', () => request('/moderation/attention', tokens.admin), 200,
    (d) => d.length === 6 && d.find((i) => i.key === 'supportAwaiting').count >= 1);
  await check('Inbox marks it awaiting reply', () => request('/support/chat/inbox', tokens.admin), 200,
    (d) => d.find((c) => c.id === convo.id)?.awaitingReply === true);
  await check('Admin closes the conversation', () => request(`/support/chat/${convo.id}/status`, tokens.admin, {
    method: 'PATCH', body: { status: 'CLOSED' },
  }), 200, (d) => d.status === 'CLOSED');
  await check('Users cannot change status', () => request(`/support/chat/${convo.id}/status`, tokens.buyer, {
    method: 'PATCH', body: { status: 'OPEN' },
  }), 403);

  // 1b. Admin-started direct messages.
  const dm = await check('Admin messages a seller directly', () => request(`/support/chat/users/${seller.id}`, tokens.admin, {
    method: 'POST', body: { message: 'Hello from your municipal admin' },
  }), 200, (d) => d.topic === 'DIRECT' && d.messages.length === 1 && d.viewerSide === 'admin');
  created.dmConvoId = dm.id;
  await check('Seller gets a seller-audience notification', () => request('/notifications?audience=SELLER&pageSize=50', tokens.seller), 200,
    (d) => d.some((n) => n.relatedId === dm.id && n.type === 'SUPPORT_MESSAGE'));
  await check('Seller sees the conversation', () => request('/support/chat/my', tokens.seller), 200,
    (d) => d.some((c) => c.id === dm.id && c.unreadCount === 1));
  await check('Seller replies', () => request(`/support/chat/${dm.id}/messages`, tokens.seller, {
    method: 'POST', body: { body: 'Thanks, noted!' },
  }), 201);
  await check('Inbox shows the seller reply awaiting', () => request('/support/chat/inbox', tokens.admin), 200,
    (d) => d.find((c) => c.id === dm.id)?.awaitingReply === true);
  await check('Messaging the buyer reuses their thread', () => request(`/support/chat/users/${buyer.id}`, tokens.admin, { method: 'POST', body: {} }), 200,
    (d) => d.id === convo.id);
  await check('Cannot message users of another municipality', () => request(`/support/chat/users/${foreignBuyer.id}`, tokens.admin, { method: 'POST', body: { message: 'hi' } }), 403);
  await check('Buyers cannot start direct messages', () => request(`/support/chat/users/${seller.id}`, tokens.buyer, { method: 'POST', body: {} }), 403);
  await check('Superadmin can message any user', () => request(`/support/chat/users/${foreignBuyer.id}`, tokens.super, { method: 'POST', body: {} }), 200);

  // 2. Store suspension with reason.
  await check('Admin suspends store with reason', () => request(`/stores/${store.id}/suspend`, tokens.admin, {
    method: 'POST', body: { reason: 'Selling expired goods' },
  }), 200);
  const suspended = await prisma.store.findUnique({ where: { id: store.id } });
  assert(suspended.isSuspended && suspended.suspensionReason === 'Selling expired goods', 'Reason should be stored');
  const storeNote = await prisma.notification.findFirst({ where: { userId: seller.id, relatedId: store.id } });
  assert(/expired goods/.test(storeNote?.message || ''), 'Seller should see the suspension reason');
  results.push({ name: 'Store suspension reason saved and sent to seller', status: 'PASS' });
  await check('Admin unsuspends store', () => request(`/stores/${store.id}/unsuspend`, tokens.admin, { method: 'POST' }), 200);
  assert((await prisma.store.findUnique({ where: { id: store.id } })).suspensionReason === null, 'Reason cleared on unsuspend');

  // 3. Product suspension reason.
  await check('Admin suspends product with reason', () => request(`/products/${product.id}/suspend`, tokens.admin, {
    method: 'POST', body: { reason: 'Photos do not match the item' },
  }), 200);
  const productNote = await prisma.notification.findFirst({ where: { userId: seller.id, relatedId: product.id } });
  assert(/Photos do not match/.test(productNote?.message || ''), 'Seller should see the product reason');
  assert((await prisma.product.findUnique({ where: { id: product.id } })).moderationNote === 'Photos do not match the item', 'Product note stored');
  results.push({ name: 'Product suspension reason saved and sent to seller', status: 'PASS' });
  await check('Buyers cannot restore products', () => request(`/products/${product.id}/restore`, tokens.buyer, { method: 'POST' }), 403);
  await check('Admin restores the suspended product', () => request(`/products/${product.id}/restore`, tokens.admin, { method: 'POST' }), 200,
    (d) => d.status === 'APPROVED');
  assert((await prisma.product.findUnique({ where: { id: product.id } })).moderationNote === null, 'Note cleared on restore');
  await check('Restoring a live product is rejected', () => request(`/products/${product.id}/restore`, tokens.admin, { method: 'POST' }), 400);

  // 5. Scoped audit log.
  const foreignLog = await prisma.auditLog.create({
    data: { action: 'TEST_FOREIGN', entity: 'Test', municipalityId: other.id, userId: superAdmin.id },
  });
  await check('Municipal admin can read their audit log', () => request('/audit-logs?pageSize=100', tokens.admin), 200,
    (d) => d.some((l) => l.action === 'SUSPEND_STORE' && l.entityId === store.id)
      && d.every((l) => l.municipalityId === muni));
  await check('Superadmin sees other municipalities', () => request(`/audit-logs?municipalityId=${other.id}`, tokens.super), 200,
    (d) => d.some((l) => l.id === foreignLog.id));
  await prisma.auditLog.delete({ where: { id: foreignLog.id } });

  // 8. Review / return moderation lists.
  await check('Reviews list is scoped and searchable', () => request(`/moderation/reviews?search=${encodeURIComponent(suffix)}`, tokens.admin), 200,
    (d) => d.length === 1 && d[0].product.id === product.id);
  await check('Returns list responds', () => request('/moderation/returns', tokens.admin), 200, (d) => Array.isArray(d));
  await check('Buyers cannot use moderation', () => request('/moderation/attention', tokens.buyer), 403);

  // 11. Manual identity review.
  await check('Admin loads identity details', () => request(`/moderation/identity/${buyer.id}`, tokens.admin), 200,
    (d) => d.user.id === buyer.id && d.verification.status === 'NOT_VERIFIED');
  await check('Other municipality user is off-limits', () => request(`/moderation/identity/${foreignBuyer.id}`, tokens.admin), 403);
  await check('Review needs a note', () => request(`/moderation/identity/${buyer.id}/review`, tokens.admin, {
    method: 'POST', body: { decision: 'VERIFIED', note: 'ok' },
  }), 400);
  await check('Admin verifies identity in person', () => request(`/moderation/identity/${buyer.id}/review`, tokens.admin, {
    method: 'POST', body: { decision: 'VERIFIED', note: 'Checked PhilSys card at the municipal hall' },
  }), 200, (d) => d.verification.status === 'VERIFIED');
  await check('Buyer now shows as verified', () => request('/identity-verification', tokens.buyer), 200,
    (d) => d.status === 'VERIFIED' && /in-person/.test(d.idTypeLabel));

  // 12. Backup admins.
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await check('Backup needs a future end date', () => request('/admin/junior-admins', tokens.super, {
    method: 'POST', body: { userId: backup.id, municipalityId: muni, backup: true, accessExpiresAt: '2020-01-01' },
  }), 400);
  await check('Superadmin assigns a backup admin', () => request('/admin/junior-admins', tokens.super, {
    method: 'POST', body: { userId: backup.id, municipalityId: muni, backup: true, accessExpiresAt: soon },
  }), 200, (d) => d.isBackup && d.role === 'MUNICIPAL_ADMIN');
  const primaryStill = await prisma.municipality.findUnique({ where: { id: muni } });
  assert(primaryStill.adminId !== backup.id, 'Backup must not replace the primary admin');
  await check('Admin list flags the backup', () => request(`/admin/junior-admins?municipalityId=${muni}`, tokens.super), 200,
    (d) => d.some((a) => a.id === backup.id && a.isBackup && !a.isPrimary));
  const backupToken = generateTokens({ ...backup, role: 'MUNICIPAL_ADMIN' }).accessToken;
  await check('Backup admin can work the queue', () => request('/moderation/attention', backupToken), 200);
  await prisma.user.update({ where: { id: backup.id }, data: { adminAccessExpiresAt: new Date(Date.now() - 1000) } });
  await check('Expired backup loses admin access', () => request('/moderation/attention', backupToken), 403);
  const demoted = await prisma.user.findUnique({ where: { id: backup.id } });
  assert(demoted.role === 'BUYER' && demoted.adminAccessExpiresAt === null, 'Expired backup is demoted to buyer');
  results.push({ name: 'Expired backup demoted to buyer', status: 'PASS' });

  console.log(JSON.stringify({ success: true, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    const ids = created.users;
    await prisma.supportConversation.deleteMany({ where: { userId: { in: ids } } });
    await prisma.review.deleteMany({ where: { userId: { in: ids } } });
    if (created.productId) await prisma.product.deleteMany({ where: { id: created.productId } });
    if (created.storeId) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [created.storeId, created.productId, created.convoId, created.dmConvoId, ...ids].filter(Boolean) } } });
      await prisma.store.deleteMany({ where: { id: created.storeId } });
    }
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { relatedId: { in: [created.storeId, created.productId, created.convoId, created.dmConvoId, ...ids].filter(Boolean) } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
