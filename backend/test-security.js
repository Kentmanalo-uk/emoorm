const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('./src/config/database');
const config = require('./src/config/env');
const { generateTokens } = require('./src/utils/jwt');

/**
 * Adversarial test suite: drives the API as a fully untrusted client.
 *
 * Every case here is an attack a user can mount from DevTools — tampered ids,
 * injected roles, rewritten prices, forged tokens, cross-municipality access,
 * malicious uploads, concurrent double-spends. A PASS means the server refused
 * or neutralised it; a FAIL is a live vulnerability.
 *
 * Requires the API to be running (npm run dev).
 */
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

const made = { users: [], stores: [], products: [], orders: [], vouchers: [], addresses: [] };
const results = [];
let failures = 0;

const record = (name, ok, detail = '') => {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  if (!ok) failures += 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (path, { token, method = 'GET', body, headers = {} } = {}) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          connection: 'close',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let parsed = null;
      try { parsed = await res.json(); } catch { parsed = null; }
      return { status: res.status, body: parsed, headers: res.headers };
    } catch (error) {
      if (attempt === 1) throw error;
      await sleep(200);
    }
  }
  throw new Error('unreachable');
};

/** The request must be refused. 2xx means the attack worked. */
const mustReject = async (name, path, options, allowed = [400, 401, 403, 404, 409, 422, 429]) => {
  const res = await call(path, options);
  const ok = allowed.includes(res.status);
  record(name, ok, `${res.status}${ok ? '' : ` — ALLOWED: ${JSON.stringify(res.body).slice(0, 160)}`}`);
  return res;
};

const mustAllow = async (name, path, options) => {
  const res = await call(path, options);
  const ok = res.status >= 200 && res.status < 300;
  record(name, ok, ok ? '' : `${res.status} ${JSON.stringify(res.body?.message || '').slice(0, 120)}`);
  return res;
};

const run = async () => {
  // ── Fixtures: two separate buyers, two separate sellers in two municipalities
  const [muniA, muniB] = await prisma.municipality.findMany({ where: { isActive: true }, take: 2 });
  if (!muniB) throw new Error('two active municipalities are required');

  const mkUser = async (role, municipalityId, extra = {}) => {
    const user = await prisma.user.create({
      data: {
        email: `sec-${role}-${crypto.randomBytes(4).toString('hex')}-${suffix}@example.test`,
        password: 'unused', fullName: `Sec ${role}`, contactNumber: '09171234567',
        municipalityId, role, isActive: true, ...extra,
      },
    });
    made.users.push(user.id);
    return { ...user, token: generateTokens(user).accessToken };
  };

  const buyerA = await mkUser('BUYER', muniA.id);
  const buyerB = await mkUser('BUYER', muniA.id);
  const sellerA = await mkUser('SELLER', muniA.id);
  const sellerB = await mkUser('SELLER', muniA.id);
  const adminA = await mkUser('MUNICIPAL_ADMIN', muniA.id);
  const adminB = await mkUser('MUNICIPAL_ADMIN', muniB.id);

  const mkStore = async (owner, municipalityId, name) => {
    const store = await prisma.store.create({
      data: {
        name, slug: `sec-${crypto.randomBytes(5).toString('hex')}`,
        ownerId: owner.id, municipalityId, isActive: true, isSuspended: false,
        fulfillmentMode: 'BOTH', acceptsCod: true, pickupAddress: 'Store counter',
      },
    });
    made.stores.push(store.id);
    return store;
  };
  const storeA = await mkStore(sellerA, muniA.id, `Sec Store A ${suffix}`);
  const storeB = await mkStore(sellerB, muniA.id, `Sec Store B ${suffix}`);

  const category = await prisma.category.findFirst();
  const mkProduct = async (store, price, stock = 100) => {
    const product = await prisma.product.create({
      data: {
        name: `Sec Product ${crypto.randomBytes(4).toString('hex')}`,
        slug: `sec-${crypto.randomBytes(6).toString('hex')}`,
        description: 'test', price, stock, images: [],
        storeId: store.id, categoryId: category.id, municipalityId: store.municipalityId,
        status: 'APPROVED',
      },
    });
    made.products.push(product.id);
    return product;
  };
  const productA = await mkProduct(storeA, 100);
  const productB = await mkProduct(storeB, 100);

  // ══════════════════════════════════════════════════════════════════════
  // 1. PRIVILEGE ESCALATION — can a buyer make themselves an admin?
  // ══════════════════════════════════════════════════════════════════════
  await mustReject('Buyer cannot set their own role via profile update',
    '/auth/profile', { token: buyerA.token, method: 'PUT', body: { fullName: 'X', role: 'SUPER_ADMIN' } },
    [200, 400, 403, 422]);
  const afterRole = await prisma.user.findUnique({ where: { id: buyerA.id }, select: { role: true } });
  record('Role is unchanged after the attempt', afterRole.role === 'BUYER', afterRole.role);

  await mustReject('Buyer cannot self-activate seller status',
    '/auth/profile', { token: buyerA.token, method: 'PUT', body: { sellerApplicationStatus: 'APPROVED', isVerified: true } },
    [200, 400, 403, 422]);
  const afterStatus = await prisma.user.findUnique({
    where: { id: buyerA.id }, select: { sellerApplicationStatus: true, isVerified: true },
  });
  record('Seller status and verification unchanged',
    afterStatus.sellerApplicationStatus === null && afterStatus.isVerified === false,
    `${afterStatus.sellerApplicationStatus} / ${afterStatus.isVerified}`);

  await mustReject('Buyer cannot move themselves into another municipality',
    '/auth/profile', { token: buyerA.token, method: 'PUT', body: { municipalityId: muniB.id } },
    [200, 400, 403, 422]);
  const afterMuni = await prisma.user.findUnique({ where: { id: buyerA.id }, select: { municipalityId: true } });
  record('Municipality unchanged after the attempt', afterMuni.municipalityId === muniA.id);

  await mustReject('Buyer cannot call the admin role endpoint',
    `/auth/users/${buyerA.id}/set-role`, { token: buyerA.token, method: 'POST', body: { role: 'SUPER_ADMIN' } });
  await mustReject('Municipal admin cannot promote anyone to super admin',
    `/auth/users/${buyerA.id}/set-role`, { token: adminA.token, method: 'POST', body: { role: 'SUPER_ADMIN' } });

  // ══════════════════════════════════════════════════════════════════════
  // 2. TOKEN FORGERY
  // ══════════════════════════════════════════════════════════════════════
  const forged = jwt.sign({ id: buyerA.id, role: 'SUPER_ADMIN' }, 'not-the-real-secret', { expiresIn: '1h' });
  await mustReject('A token signed with the wrong secret is rejected', '/auth/profile', { token: forged }, [401]);

  const noneAlg = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.`
    + `${Buffer.from(JSON.stringify({ id: buyerA.id, role: 'SUPER_ADMIN' })).toString('base64url')}.`;
  await mustReject('An alg=none token is rejected', '/auth/profile', { token: noneAlg }, [401]);

  const expired = jwt.sign({ id: buyerA.id, role: 'BUYER' }, config.jwt.secret, { expiresIn: '-1h' });
  await mustReject('An expired token is rejected', '/auth/profile', { token: expired }, [401]);

  // A validly-signed token claiming a role the database does not grant.
  const liar = jwt.sign({ id: buyerA.id, email: buyerA.email, role: 'SUPER_ADMIN' }, config.jwt.secret, { expiresIn: '1h' });
  await mustReject('A signed token claiming a false role gets no admin access',
    '/auth/users', { token: liar });

  await mustReject('A malformed token is rejected', '/auth/profile', { token: 'garbage.garbage.garbage' }, [401]);

  // ══════════════════════════════════════════════════════════════════════
  // 3. IDOR — reading and writing another user's resources
  // ══════════════════════════════════════════════════════════════════════
  const address = await prisma.address.create({
    data: {
      userId: buyerA.id, fullName: 'A', contactNumber: '09171234567',
      municipalityId: muniA.id, barangay: 'X', street: 'Y',
    },
  });
  made.addresses.push(address.id);

  await mustReject("Buyer B cannot read buyer A's address",
    `/addresses/${address.id}`, { token: buyerB.token });
  await mustReject("Buyer B cannot update buyer A's address",
    `/addresses/${address.id}`, { token: buyerB.token, method: 'PUT', body: { fullName: 'HACKED' } });
  await mustReject("Buyer B cannot delete buyer A's address",
    `/addresses/${address.id}`, { token: buyerB.token, method: 'DELETE' });
  const addrStill = await prisma.address.findUnique({ where: { id: address.id } });
  record("Buyer A's address survived", addrStill && addrStill.fullName === 'A');

  await mustReject("Seller B cannot edit seller A's product",
    `/products/${productA.id}`, { token: sellerB.token, method: 'PUT', body: { price: 1, name: 'HACKED' } });
  await mustReject("Seller B cannot delete seller A's product",
    `/products/${productA.id}`, { token: sellerB.token, method: 'DELETE' });
  const prodStill = await prisma.product.findUnique({ where: { id: productA.id } });
  record("Seller A's product is untouched", Number(prodStill.price) === 100 && !prodStill.deletedAt,
    `price=${prodStill.price}`);

  await mustReject("Seller B cannot update seller A's store",
    `/stores/${storeA.id}`, { token: sellerB.token, method: 'PUT', body: { name: 'HACKED' } });

  await mustReject('A buyer cannot approve a product',
    `/products/${productA.id}/approve`, { token: buyerA.token, method: 'POST' });
  await mustReject('A seller cannot approve their own product',
    `/products/${productA.id}/approve`, { token: sellerA.token, method: 'POST' });

  // ══════════════════════════════════════════════════════════════════════
  // 4. PRICE AND QUANTITY TAMPERING
  // ══════════════════════════════════════════════════════════════════════
  await prisma.identityVerification.upsert({
    where: { userId: buyerA.id },
    create: { userId: buyerA.id, status: 'VERIFIED', verifiedAt: new Date() },
    update: { status: 'VERIFIED', verifiedAt: new Date() },
  });
  await prisma.storeServiceArea.create({
    data: { storeId: storeA.id, municipalityId: muniA.id, barangay: 'X' },
  }).catch(() => { });

  const orderBody = (overrides = {}) => ({
    storeId: storeA.id,
    items: [{ productId: productA.id, quantity: 2 }],
    deliveryAddress: 'Test address',
    contactNumber: '09171234567',
    fulfillmentMethod: 'PICKUP',
    paymentMethod: 'COD',
    buyerMunicipalityId: muniA.id,
    buyerBarangay: 'X',
    ...overrides,
  });

  const tampered = await call('/orders', {
    token: buyerA.token, method: 'POST',
    body: orderBody({
      total: 1, subtotal: 1, deliveryFee: 0, discountAmount: 999,
      items: [{ productId: productA.id, quantity: 2, price: 0.01, subtotal: 0.02 }],
      status: 'COMPLETED', paymentStatus: 'PAID',
      buyerId: buyerB.id,
    }),
  });
  if (tampered.status >= 200 && tampered.status < 300) {
    const order = tampered.body.data;
    made.orders.push(order.id);
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    record('Server recomputes the total, ignoring the client', Number(fresh.total) === 200,
      `total=${fresh.total} (expected 200)`);
    record('Server ignores a client-supplied item price',
      Number(fresh.subtotal) === 200, `subtotal=${fresh.subtotal}`);
    record('Server ignores a client-supplied discount', Number(fresh.discountAmount) === 0,
      `discount=${fresh.discountAmount}`);
    record('Order status cannot be set by the client', fresh.status === 'PENDING', fresh.status);
    record('Payment status cannot be set by the client', fresh.paymentStatus === 'PENDING', fresh.paymentStatus);
    record('Order belongs to the authenticated buyer, not the supplied buyerId',
      fresh.buyerId === buyerA.id);
  } else {
    record('Price-tampered order was rejected outright', true, `${tampered.status}`);
  }

  for (const [label, quantity] of [['negative', -5], ['zero', 0], ['fractional', 1.5], ['absurd', 1e9], ['string', '5; DROP TABLE orders']]) {
    await mustReject(`Quantity rejected: ${label}`, '/orders', {
      token: buyerA.token, method: 'POST',
      body: orderBody({ items: [{ productId: productA.id, quantity }] }),
    });
  }

  await mustReject('Cannot order more than the available stock', '/orders', {
    token: buyerA.token, method: 'POST',
    body: orderBody({ items: [{ productId: productA.id, quantity: 99999 }] }),
  });

  await mustReject("Cannot mix another store's product into an order", '/orders', {
    token: buyerA.token, method: 'POST',
    body: orderBody({ items: [{ productId: productB.id, quantity: 1 }] }),
  });

  const hidden = await prisma.product.update({
    where: { id: productA.id }, data: { status: 'PENDING' },
  });
  await mustReject('Cannot order an unapproved product', '/orders', {
    token: buyerA.token, method: 'POST', body: orderBody(),
  });
  await prisma.product.update({ where: { id: hidden.id }, data: { status: 'APPROVED' } });

  await prisma.store.update({ where: { id: storeA.id }, data: { isSuspended: true } });
  await mustReject('Cannot order from a suspended store', '/orders', {
    token: buyerA.token, method: 'POST', body: orderBody(),
  });
  await prisma.store.update({ where: { id: storeA.id }, data: { isSuspended: false } });

  // ══════════════════════════════════════════════════════════════════════
  // 5. ORDER IDOR
  // ══════════════════════════════════════════════════════════════════════
  const victimOrder = await call('/orders', { token: buyerA.token, method: 'POST', body: orderBody() });
  if (victimOrder.status < 300 && victimOrder.body?.data?.id) {
    const orderId = victimOrder.body.data.id;
    made.orders.push(orderId);

    await mustReject("Buyer B cannot read buyer A's order", `/orders/${orderId}`, { token: buyerB.token });
    await mustReject("Buyer B cannot cancel buyer A's order",
      `/orders/${orderId}/cancel`, { token: buyerB.token, method: 'POST', body: { reason: 'x' } });
    await mustReject("Seller B cannot change the status of seller A's order",
      `/orders/${orderId}/status`, { token: sellerB.token, method: 'PUT', body: { status: 'COMPLETED' } });
    await mustReject('A buyer cannot mark their own order as paid/completed',
      `/orders/${orderId}/status`, { token: buyerA.token, method: 'PUT', body: { status: 'COMPLETED' } });

    const orderState = await prisma.order.findUnique({ where: { id: orderId } });
    record('Order status survived the tampering attempts',
      orderState.status === 'PENDING' && orderState.paymentStatus === 'PENDING',
      `${orderState.status}/${orderState.paymentStatus}`);
  } else {
    record('Baseline order creation works', false, `${victimOrder.status} ${JSON.stringify(victimOrder.body?.message)}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. MUNICIPAL ADMIN SCOPE
  // ══════════════════════════════════════════════════════════════════════
  await mustReject("Admin B cannot read a user in municipality A",
    `/auth/users/${buyerA.id}`, { token: adminB.token });
  await mustReject("Admin B cannot suspend a user in municipality A",
    `/auth/users/${buyerA.id}/suspend`, { token: adminB.token, method: 'POST' });
  await mustReject("Admin B cannot approve a seller in municipality A",
    `/auth/users/${sellerA.id}/approve-seller`, { token: adminB.token, method: 'POST' });
  await mustReject("Admin B cannot suspend a product in municipality A",
    `/products/${productA.id}/suspend`, { token: adminB.token, method: 'POST', body: { reason: 'x' } });
  await mustReject("Admin B cannot read municipality A's KYC documents",
    `/auth/users/${sellerA.id}/kyc-photo/idFront`, { token: adminB.token });

  const scopedList = await call('/auth/users?pageSize=100', { token: adminB.token });
  const leaked = (scopedList.body?.data || []).filter((u) => u.municipalityId === muniA.id);
  record("Admin B's user list contains nobody from municipality A", leaked.length === 0,
    `${leaked.length} leaked`);

  await mustReject('A municipal admin cannot suspend another municipal admin',
    `/auth/users/${adminA.id}/suspend`, { token: adminB.token, method: 'POST' });

  // ══════════════════════════════════════════════════════════════════════
  // 7. INJECTION AND MALFORMED PAYLOADS
  // ══════════════════════════════════════════════════════════════════════
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT password FROM users --",
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '../../../../etc/passwd',
    '${7*7}',
    '{{7*7}}',
  ];
  let injectionBroke = false;
  for (const payload of payloads) {
    const res = await call(`/products?search=${encodeURIComponent(payload)}`);
    if (res.status >= 500) injectionBroke = true;
  }
  record('Injection strings in search never cause a server error', !injectionBroke);

  const stillThere = await prisma.user.count();
  record('The users table still exists after injection attempts', stillThere > 0, `${stillThere} users`);

  for (const bad of [
    { name: 'array where object expected', body: [1, 2, 3] },
    { name: 'deeply nested object', body: { items: { $ne: null } } },
    { name: 'null items', body: { storeId: storeA.id, items: null } },
    { name: 'object as productId', body: { storeId: storeA.id, items: [{ productId: { $gt: '' }, quantity: 1 }] } },
  ]) {
    await mustReject(`Malformed payload rejected: ${bad.name}`, '/orders',
      { token: buyerA.token, method: 'POST', body: bad.body });
  }

  const xssRes = await call('/products', {
    token: sellerA.token, method: 'POST',
    body: {
      name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>',
      price: 10, stock: 1, categoryId: category.id, images: [],
    },
  });
  if (xssRes.status < 300 && xssRes.body?.data?.id) {
    made.products.push(xssRes.body.data.id);
    const stored = await prisma.product.findUnique({ where: { id: xssRes.body.data.id } });
    record('Stored product name is escaped or stripped of script tags',
      !/<script/i.test(stored.name), stored.name.slice(0, 60));
    record('Stored product description has no inline event handler',
      !/onerror\s*=/i.test(stored.description), stored.description.slice(0, 60));
  } else {
    record('Product with script payload was rejected', true, `${xssRes.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. RACE CONDITIONS / DOUBLE SUBMISSION
  // ══════════════════════════════════════════════════════════════════════
  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  if (superAdmin) {
    const voucher = await prisma.voucher.create({
      data: {
        code: `SEC${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        description: 'security test', discountType: 'FIXED', discountValue: 10,
        isActive: true, perUserLimit: 1, usageLimit: 1, createdById: superAdmin.id,
      },
    });
    made.vouchers.push(voucher.id);

    const attempts = await Promise.all(Array.from({ length: 5 }, () =>
      call('/orders', {
        token: buyerA.token, method: 'POST',
        body: orderBody({ voucherCode: voucher.code, checkoutKey: undefined }),
      })
    ));
    for (const a of attempts) if (a.body?.data?.id) made.orders.push(a.body.data.id);

    const redemptions = await prisma.voucherRedemption.count({ where: { voucherId: voucher.id } });
    record('A one-use voucher cannot be redeemed twice by concurrent requests',
      redemptions <= 1, `${redemptions} redemptions from 5 concurrent orders`);
  }

  const dupKey = `dup-${suffix}`;
  const dupes = await Promise.all(Array.from({ length: 5 }, () =>
    call('/orders', { token: buyerA.token, method: 'POST', body: orderBody({ checkoutKey: dupKey }) })
  ));
  for (const d of dupes) if (d.body?.data?.id) made.orders.push(d.body.data.id);
  const dupCount = await prisma.order.count({ where: { buyerId: buyerA.id, checkoutKey: dupKey } });
  record('One checkout key produces exactly one order',
    dupCount === 1, `${dupCount} orders created from 5 concurrent submits`);

  // ══════════════════════════════════════════════════════════════════════
  // 9. INFORMATION DISCLOSURE
  // ══════════════════════════════════════════════════════════════════════
  const me = await call('/auth/profile', { token: buyerA.token });
  const meDump = JSON.stringify(me.body);
  for (const field of ['password', 'mfaSecret', 'mfaBackupCodes', 'passwordResetToken']) {
    record(`Profile response omits ${field}`, !meDump.includes(`"${field}"`));
  }

  const publicProduct = await call(`/products/${productA.id}`);
  const productDump = JSON.stringify(publicProduct.body);
  record('Public product response leaks no password field', !productDump.includes('"password"'));
  record('Public product response leaks no KYC document fields',
    !/idFrontUrl|idBackUrl|selfieUrl/.test(productDump));
  record('Public product response leaks no payout details',
    !/payoutAccountNumber|sellerBirTin/.test(productDump));

  const notFound = await call('/auth/login', {
    method: 'POST', body: { email: `definitely-not-a-user-${suffix}@example.test`, password: 'wrong' },
  });
  const wrongPass = await call('/auth/login', {
    method: 'POST', body: { email: buyerA.email, password: 'definitely-wrong' },
  });
  record('Login does not reveal whether an account exists',
    notFound.body?.message === wrongPass.body?.message,
    `"${notFound.body?.message}" vs "${wrongPass.body?.message}"`);

  const boom = await call('/products/this-is-not-a-uuid-at-all');
  const boomDump = JSON.stringify(boom.body || {});
  record('Errors never expose Prisma internals or node_modules paths',
    !/prisma\.|PrismaClient|node_modules/i.test(boomDump), boomDump.slice(0, 120));

  // Stack traces are allowed in explicit development and nowhere else. The
  // live response only shows the current mode, so the gate itself is checked
  // directly — including the case that matters most, an unset NODE_ENV on a
  // deploy that forgot to configure it.
  const { errorHandler } = require('./src/middleware/errorHandler');
  const leaksStack = (nodeEnv) => {
    const saved = process.env.NODE_ENV;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    const err = new Error('probe');
    err.statusCode = 400;
    let captured = null;
    errorHandler(err, { method: 'GET', url: '/probe' },
      { status() { return this; }, json(b) { captured = b; return this; }, set() { } }, () => { });
    process.env.NODE_ENV = saved;
    return 'stack' in captured;
  };
  record('Stack traces are withheld when NODE_ENV=production', leaksStack('production') === false);
  record('Stack traces are withheld when NODE_ENV is unset', leaksStack(undefined) === false);
  record('Stack traces are withheld for any non-development value', leaksStack('staging') === false);

  // ══════════════════════════════════════════════════════════════════════
  // 9b. AUTHENTICATION BYPASS CHAINS
  // ══════════════════════════════════════════════════════════════════════
  // A step-up token is what an admin holds after a password but BEFORE the
  // second factor. It is signed with the same secret as a session token, so
  // it must be rejected everywhere a session is expected — otherwise MFA is
  // decorative and a stolen password is a full takeover.
  const { generateMfaToken } = require('./src/utils/jwt');
  const stepUp = generateMfaToken({ id: superAdmin?.id || buyerA.id, email: buyerA.email, role: 'SUPER_ADMIN' }, 'mfa-verify');

  await mustReject('A pre-MFA step-up token is not a session', '/auth/profile', { token: stepUp }, [401]);
  await mustReject('A pre-MFA step-up token cannot list users', '/auth/users', { token: stepUp }, [401, 403]);
  await mustReject('A pre-MFA step-up token cannot re-enrol MFA',
    '/auth/mfa/setup/begin', { token: stepUp, method: 'POST' }, [401, 403]);
  await mustReject('A pre-MFA step-up token cannot reach super-admin routes',
    '/admin/junior-admins', { token: stepUp }, [401, 403]);

  // forgot-password must never hand back the token it just emailed.
  const forgot = await call('/auth/forgot-password', { method: 'POST', body: { email: buyerA.email } });
  const forgotDump = JSON.stringify(forgot.body || {});
  record('forgot-password never returns the reset token',
    !/resetToken|resetUrl/.test(forgotDump), forgotDump.slice(0, 120));

  // ══════════════════════════════════════════════════════════════════════
  // 10. SECURITY HEADERS
  // ══════════════════════════════════════════════════════════════════════
  const headerProbe = await call('/categories');
  const h = headerProbe.headers;
  record('X-Content-Type-Options is nosniff', h.get('x-content-type-options') === 'nosniff');
  record('Frame protection is present', Boolean(h.get('x-frame-options') || h.get('content-security-policy')));
  record('Referrer-Policy is set', Boolean(h.get('referrer-policy')));
  record('Server implementation is not advertised', !h.get('x-powered-by'));

  // ══════════════════════════════════════════════════════════════════════
  // 11. RATE LIMITING
  // ══════════════════════════════════════════════════════════════════════
  const burst = [];
  for (let i = 0; i < 30; i += 1) {
    burst.push(await call('/auth/login', {
      method: 'POST', body: { email: buyerA.email, password: `wrong-${i}` },
    }));
  }
  record('Repeated failed logins are rate limited',
    burst.some((r) => r.status === 429), `statuses: ${[...new Set(burst.map((r) => r.status))].join(',')}`);

  console.log(JSON.stringify({
    success: failures === 0,
    total: results.length,
    failed: failures,
    results,
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message, stack: error.stack?.split('\n').slice(0, 4) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.voucherRedemption.deleteMany({ where: { voucherId: { in: made.vouchers } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: made.products } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: made.orders } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: made.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: made.orders } } });
    await prisma.voucher.deleteMany({ where: { id: { in: made.vouchers } } });
    await prisma.address.deleteMany({ where: { id: { in: made.addresses } } });
    await prisma.storeServiceArea.deleteMany({ where: { storeId: { in: made.stores } } });
    await prisma.product.deleteMany({ where: { id: { in: made.products } } });
    await prisma.store.deleteMany({ where: { id: { in: made.stores } } });
    await prisma.identityVerification.deleteMany({ where: { userId: { in: made.users } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: made.users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: made.users } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.$disconnect();
  });
