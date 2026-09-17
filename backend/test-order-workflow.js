const crypto = require('crypto');
const prisma = require('./src/config/database');
const { generateTokens } = require('./src/utils/jwt');
const orderService = require('./src/services/order.service');

// End-to-end buyer → seller order workflow against the running API (npm run dev).
const BASE_URL = process.env.API_TEST_BASE_URL || 'http://localhost:3000/api';
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const created = { users: [], storeId: null, productId: null, voucherId: null };

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
      email: `order-${name}-${suffix}@example.test`,
      password: 'not-used-by-this-test',
      fullName: `Order Test ${name}`,
      municipalityId,
      role,
      isActive: true,
    },
  });
  created.users.push(user.id);
  return user;
};

const stockOf = async () => (await prisma.product.findUnique({ where: { id: created.productId } })).stock;

const run = async () => {
  const municipality = await prisma.municipality.findFirst({ where: { isActive: true } });
  const category = await prisma.category.findFirst();
  assert(municipality && category, 'An active municipality and a category are required');

  const seller = await createUser(municipality.id, 'SELLER', 'seller');
  const buyer = await createUser(municipality.id, 'BUYER', 'buyer');
  const other = await createUser(municipality.id, 'SELLER', 'other-seller');
  await prisma.identityVerification.create({ data: { userId: buyer.id, status: 'VERIFIED', verifiedAt: new Date() } });

  const store = await prisma.store.create({
    data: {
      name: `Order Test Store ${suffix}`,
      slug: `order-test-${suffix}`,
      ownerId: seller.id,
      municipalityId: municipality.id,
      fulfillmentMode: 'BOTH',
      pickupAddress: 'Test pickup counter',
      paymentQrImage: '/uploads/test-qr.png',
      serviceAreas: { create: [{ municipalityId: municipality.id }] },
    },
  });
  created.storeId = store.id;
  const product = await prisma.product.create({
    data: {
      name: `Order Test Product ${suffix}`,
      slug: `order-test-product-${suffix}`,
      description: 'Temporary product for the order workflow test',
      price: 100,
      stock: 20,
      images: [],
      storeId: store.id,
      categoryId: category.id,
      municipalityId: municipality.id,
      status: 'APPROVED',
    },
  });
  created.productId = product.id;
  const voucher = await prisma.voucher.create({
    data: { code: `ORDERTEST${crypto.randomBytes(3).toString('hex').toUpperCase()}`, discountType: 'FIXED', discountValue: 10, perUserLimit: 1 },
  });
  created.voucherId = voucher.id;

  const buyerToken = generateTokens(buyer).accessToken;
  const sellerToken = generateTokens(seller).accessToken;
  const otherToken = generateTokens(other).accessToken;

  const results = [];
  const check = async (name, operation, expectedStatus, predicate = () => true) => {
    const result = await operation();
    assert(result.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${result.status} ${JSON.stringify(result.body?.message)}`);
    assert(await predicate(result.body?.data), `${name}: assertion failed ${JSON.stringify(result.body?.data ?? result.body)}`);
    results.push({ name, status: 'PASS', httpStatus: result.status });
    return result.body?.data;
  };

  const baseOrder = {
    storeId: store.id,
    contactNumber: '09170000000',
    deliveryAddress: 'Test address',
    buyerMunicipalityId: municipality.id,
    items: [{ productId: product.id, quantity: 2 }],
  };
  const placeOrder = (extra) => request('/orders', buyerToken, { method: 'POST', body: { ...baseOrder, ...extra } });
  const setStatus = (id, status, token = sellerToken) => request(`/orders/${id}/status`, token, { method: 'PUT', body: { status } });
  const setPayment = (id, paymentStatus, token = sellerToken) => request(`/orders/${id}/payment`, token, { method: 'PATCH', body: { paymentStatus } });

  // 1. COD delivery: full happy path, payment becomes PAID on delivery.
  const cod = await check('Buyer places COD delivery order', () => placeOrder({}), 201,
    (d) => Number(d.total) === 250 && d.paymentStatus === 'PENDING');
  assert(await stockOf() === 18, 'Stock should drop by 2 after checkout');
  await check('Seller sees the order', () => request('/orders/store/orders?pageSize=100000', sellerToken), 200,
    (d) => d.some((o) => o.id === cod.id));
  await check('Other seller cannot update it', () => setStatus(cod.id, 'CONFIRMED', otherToken), 403);
  await check('Invalid jump is rejected', () => setStatus(cod.id, 'DELIVERED'), 400);
  for (const status of ['CONFIRMED', 'TO_SHIP', 'OUT_FOR_DELIVERY']) {
    await check(`Seller moves COD order to ${status}`, () => setStatus(cod.id, status), 200);
  }
  await check('Buyer cannot cancel once shipped', () => request(`/orders/${cod.id}/cancel`, buyerToken, { method: 'POST' }), 400);
  await check('Delivered COD order is marked paid', () => setStatus(cod.id, 'DELIVERED'), 200, (d) => d.paymentStatus === 'PAID');
  await check('Seller completes the order', () => setStatus(cod.id, 'COMPLETED'), 200, (d) => Boolean(d.completedAt));
  const notes = await prisma.notification.findMany({ where: { userId: buyer.id, relatedId: cod.id } });
  assert(notes.some((n) => /out for delivery/i.test(n.message)), 'Buyer notifications should use readable status text');
  results.push({ name: 'Buyer notified with readable statuses', status: 'PASS' });

  // 2. Prepaid order: seller must verify payment before fulfilment.
  const prepaid = await check('Buyer places GCash order', () => placeOrder({ paymentMethod: 'GCASH', paymentReference: 'REF123', paymentProofUrl: '/uploads/proof.png' }), 201,
    (d) => d.paymentStatus === 'PENDING_VERIFICATION');
  await check('Seller confirms prepaid order', () => setStatus(prepaid.id, 'CONFIRMED'), 200);
  await check('Fulfilment blocked until payment verified', () => setStatus(prepaid.id, 'TO_SHIP'), 409);
  await check('Other seller cannot verify payment', () => setPayment(prepaid.id, 'PAID', otherToken), 403);
  await check('Seller verifies payment', () => setPayment(prepaid.id, 'PAID'), 200, (d) => d.paymentStatus === 'PAID');
  await check('Payment cannot be decided twice', () => setPayment(prepaid.id, 'FAILED'), 409);
  await check('Fulfilment continues after verification', () => setStatus(prepaid.id, 'TO_SHIP'), 200);

  // 3. Seller cancels mid-fulfilment: stock returns (this used to fail with a 500).
  const beforeCancel = await stockOf();
  await check('Seller cancels a shipped-stage order', () => setStatus(prepaid.id, 'CANCELLED'), 200, (d) => d.status === 'CANCELLED');
  assert(await stockOf() === beforeCancel + 2, 'Seller cancellation should restore stock');
  results.push({ name: 'Seller cancellation restores stock', status: 'PASS' });

  // 4. Rejected payment cancels the order and restores stock.
  const rejected = await check('Buyer places QRPH order', () => placeOrder({ paymentMethod: 'QRPH', paymentReference: 'REF456', paymentProofUrl: '/uploads/proof.png' }), 201);
  const beforeReject = await stockOf();
  await check('Seller rejects payment', () => setPayment(rejected.id, 'FAILED'), 200,
    (d) => d.status === 'CANCELLED' && d.paymentStatus === 'FAILED');
  assert(await stockOf() === beforeReject + 2, 'Rejected payment should restore stock');
  results.push({ name: 'Rejected payment restores stock', status: 'PASS' });

  // 5. Buyer cancellation releases the voucher so it can be used again.
  const voucherOrder = await check('Buyer places pickup order with voucher', () => placeOrder({ fulfillmentMethod: 'PICKUP', voucherCode: voucher.code }), 201,
    (d) => Number(d.deliveryFee) === 0 && Number(d.total) === 190);
  await check('Voucher cannot be reused while the order is active', () => placeOrder({ voucherCode: voucher.code }), 400);
  await check('Buyer cancels pending voucher order', () => request(`/orders/${voucherOrder.id}/cancel`, buyerToken, { method: 'POST' }), 200);
  assert(await prisma.voucherRedemption.count({ where: { orderId: voucherOrder.id } }) === 0, 'Voucher redemption should be released');
  await check('Voucher is usable again after cancellation', () => placeOrder({ voucherCode: voucher.code }), 201);

  // 6. Stale pending orders expire with notifications; fresh ones stay.
  const stale = await check('Buyer places order that will go stale', () => placeOrder({}), 201);
  const fresh = await check('Buyer places fresh order', () => placeOrder({}), 201);
  await prisma.order.update({ where: { id: stale.id }, data: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) } });
  await orderService.expirePendingOrders();
  const [staleNow, freshNow] = await Promise.all([
    prisma.order.findUnique({ where: { id: stale.id } }),
    prisma.order.findUnique({ where: { id: fresh.id } }),
  ]);
  assert(staleNow.status === 'CANCELLED' && freshNow.status === 'PENDING', 'Only orders older than 48h should expire');
  assert(await prisma.notification.count({ where: { relatedId: stale.id, title: 'Order Expired' } }) === 2, 'Buyer and seller should be told about expiry');
  results.push({ name: 'Stale pending orders expire (48h) with notifications', status: 'PASS' });

  console.log(JSON.stringify({ success: true, results }, null, 2));
};

run()
  .catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    const orders = await prisma.order.findMany({ where: { storeId: created.storeId || '' }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    await prisma.voucherRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (created.productId) {
      await prisma.inventoryMovement.deleteMany({ where: { productId: created.productId } });
      await prisma.product.deleteMany({ where: { id: created.productId } });
    }
    if (created.storeId) await prisma.store.deleteMany({ where: { id: created.storeId } });
    if (created.voucherId) await prisma.voucher.deleteMany({ where: { id: created.voucherId } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    await prisma.$disconnect();
  });
