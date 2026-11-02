const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const referralService = require('../src/services/referral.service');

// Accounts made through POST /auth/register are not in the helpers' list.
const registered = [];

let admin;
const setInvites = async (referralSettings) => {
  const res = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { referralSettings } });
  assert.equal(res.status, 200, res.body?.message);
  return res.body.data.referralSettings;
};

before(async () => {
  admin = await h.user('SUPER_ADMIN');
});

after(async () => {
  // Off again, as a fresh install has it.
  await setInvites({ enabled: false }).catch(() => {});
  if (registered.length) {
    const orders = { order: { buyerId: { in: registered } } };
    await h.prisma.voucherRedemption.deleteMany({ where: { userId: { in: registered } } });
    await h.prisma.orderStatusHistory.deleteMany({ where: orders });
    await h.prisma.orderItem.deleteMany({ where: orders });
    await h.prisma.order.deleteMany({ where: { buyerId: { in: registered } } });
    await h.prisma.notification.deleteMany({ where: { userId: { in: registered } } });
    await h.prisma.auditLog.deleteMany({ where: { userId: { in: registered } } });
    await h.prisma.user.deleteMany({ where: { id: { in: registered } } });
  }
  await h.cleanup();
});

const readyShop = async (seller) => h.prisma.store.update({
  where: { id: (await h.shop(seller)).id },
  data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 3', acceptsCod: true },
});
const approvedSeller = (extra = {}) => h.user('SELLER', { sellerApplicationStatus: 'APPROVED', ...extra });

/** An order of `quantity` × ₱100 that is completed the way a buyer completes one. */
const completedOrder = async (buyer, store, item, { quantity = 3, ...fields } = {}) => {
  const order = await h.order(buyer, store, [{ product: item, quantity }], { status: 'PICKED_UP', ...fields });
  const res = await h.api('POST', `/orders/${order.id}/received`, { token: h.token(buyer) });
  assert.equal(res.status, 200, res.body?.message);
  return order;
};

const referralOf = (inviteeId, kind = 'BUYER') => h.prisma.referral.findUnique({ where: { inviteeId_kind: { inviteeId, kind } } });

test('invites are off until a super admin turns them on', async () => {
  await setInvites({ enabled: false });
  const buyer = await h.user('BUYER');
  const mine = await h.api('GET', '/referrals/me', { token: h.token(buyer) });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.enabled, false);
  assert.equal(mine.body.data.code, undefined);
  const page = await h.api('GET', '/referrals/invite/ANYCODE');
  assert.equal(page.body.data.enabled, false);
  const seller = await approvedSeller();
  await readyShop(seller);
  const save = await h.api('PUT', '/referrals/my-shop', { token: h.token(seller), body: { isActive: true } });
  assert.equal(save.status, 403);
  // A code at sign-up is ignored while off.
  const inviter = await h.user('BUYER', { referralCode: `OFF${h.RUN}`.slice(0, 16) });
  const friend = await h.user('BUYER');
  assert.equal(await referralService.attachAtSignup(friend.id, { referralCode: inviter.referralCode }), null);
  assert.equal(await referralOf(friend.id), null);
});

test('the settings are checked and changed one key at a time', async () => {
  const bad = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { referralSettings: { boostDays: 0 } } });
  assert.equal(bad.status, 400);
  const unknown = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { referralSettings: { cash: true } } });
  assert.equal(unknown.status, 400);
  const notBool = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { referralSettings: { enabled: 'yes' } } });
  assert.equal(notBool.status, 400);
  await setInvites({ voucherDays: 14 });
  const s = await setInvites({ boostDays: 5 });
  assert.equal(s.voucherDays, 14);
  assert.equal(s.boostDays, 5);
  assert.equal(s.enabled, false);
  const seller = await approvedSeller();
  const forbidden = await h.api('PUT', '/app-settings', { token: h.token(seller), body: { referralSettings: { enabled: true } } });
  assert.equal(forbidden.status, 403);
  const open = await h.api('GET', '/app-settings');
  assert.equal(open.body.data.referralSettings.boostDays, 5);
});

test('a shop invite: the friend gets the welcome voucher, the inviter the thank-you after the first order', async () => {
  await setInvites({
    enabled: true, shopInvites: true, requireVerifiedPhone: true, inviterMonthlyCap: 10, voucherDays: 30, maxShopReward: 200,
  });
  const seller = await approvedSeller();
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100 });

  const tooMuch = await h.api('PUT', '/referrals/my-shop', { token: h.token(seller), body: { isActive: true, welcomeValue: 9999 } });
  assert.equal(tooMuch.status, 400);
  const saved = await h.api('PUT', '/referrals/my-shop', {
    token: h.token(seller), body: { isActive: true, welcomeValue: 20, rewardValue: 25, minOrderAmount: 200 },
  });
  assert.equal(saved.status, 200, saved.body?.message);
  assert.equal(saved.body.data.program.isActive, true);
  const rewards = await h.api('GET', `/referrals/shop/${store.id}`);
  assert.equal(rewards.body.data.welcomeValue, 20);

  const inviter = await h.user('BUYER', { fullName: 'Ana Cruz Reyes' });
  const mine = await h.api('GET', '/referrals/me', { token: h.token(inviter) });
  assert.equal(mine.status, 200);
  const { code } = mine.body.data;
  assert.match(code, /^[A-Z0-9]{4,16}$/);
  assert.match(mine.body.data.link, new RegExp(`/invite/${code}$`));
  assert.ok(mine.body.data.shops.some((s) => s.id === store.id && s.link.includes(`shop=${store.slug}`)));
  // The same code every time.
  assert.equal((await h.api('GET', '/referrals/me', { token: h.token(inviter) })).body.data.code, code);

  const page = await h.api('GET', `/referrals/invite/${code.toLowerCase()}?shop=${store.slug}`);
  assert.equal(page.body.data.valid, true);
  assert.equal(page.body.data.inviter.firstName, 'Ana');
  assert.equal(page.body.data.shop.welcome.value, 20);
  assert.equal((await h.api('GET', '/referrals/invite/NOSUCHCODE1')).body.data.valid, false);

  // The friend joins through the link.
  const { municipality } = await h.reference();
  const email = `ci-invite-${h.RUN}@example.test`;
  const joined = await h.api('POST', '/auth/register', {
    body: {
      email, password: 'Testing#123', confirmPassword: 'Testing#123', fullName: 'Ben Santos', municipalityId: municipality.id, referralCode: code, referralShop: store.slug,
    },
  });
  assert.equal(joined.status, 201, joined.body?.message);
  const friend = joined.body.data.user;
  registered.push(friend.id);
  const referral = await referralOf(friend.id);
  assert.equal(referral.inviterId, inviter.id);
  assert.equal(referral.storeId, store.id);
  assert.equal(referral.status, 'PENDING');
  assert.equal((await h.prisma.user.findUnique({ where: { id: friend.id } })).referredById, inviter.id);

  const friendToken = joined.body.data.accessToken;
  const vouchers = await h.api('GET', `/referrals/vouchers?storeId=${store.id}`, { token: friendToken });
  assert.equal(vouchers.body.data.length, 1);
  const welcome = vouchers.body.data[0];
  assert.match(welcome.code, /^HELLO-/);
  assert.equal(welcome.discountValue, 20);
  assert.equal(welcome.kind, 'welcome');
  // Nobody else can use it, and it is not on the shop's page or in its list.
  const stolen = await h.api('POST', '/vouchers/validate', { token: h.token(inviter), body: { code: welcome.code, subtotal: 300, storeId: store.id } });
  assert.equal(stolen.status, 404);
  const listed = await h.api('GET', `/vouchers/store/${store.id}`);
  assert.ok(!listed.body.data.some((v) => v.code === welcome.code));
  const shopList = await h.api('GET', '/vouchers/shop', { token: h.token(seller) });
  assert.ok(!JSON.stringify(shopList.body.data).includes(welcome.code));

  // The friend orders with it: ₱20 off.
  const ordered = await h.api('POST', '/orders', {
    token: friendToken,
    body: {
      storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', voucherCode: welcome.code, items: [{ productId: item.id, quantity: 3 }],
    },
  });
  assert.equal(ordered.status, 201, ordered.body?.message);
  assert.equal(Number(ordered.body.data.discountAmount), 20);
  // Completed: the inviter is thanked.
  await h.prisma.order.update({ where: { id: ordered.body.data.id }, data: { status: 'PICKED_UP' } });
  const received = await h.api('POST', `/orders/${ordered.body.data.id}/received`, { token: friendToken });
  assert.equal(received.status, 200, received.body?.message);

  const counted = await referralOf(friend.id);
  assert.equal(counted.status, 'REWARDED');
  assert.equal(counted.orderId, ordered.body.data.id);
  const thanks = await h.prisma.voucher.findUnique({ where: { id: counted.rewardVoucherId } });
  assert.match(thanks.code, /^THANKS-/);
  assert.equal(thanks.ownerId, inviter.id);
  assert.equal(Number(thanks.discountValue), 25);
  assert.equal(thanks.storeId, store.id);
  const notice = await h.prisma.notification.findFirst({ where: { userId: inviter.id, title: { contains: 'You earned' } } });
  assert.ok(notice);
  const after = await h.api('GET', '/referrals/me', { token: h.token(inviter) });
  assert.equal(after.body.data.totals.rewarded, 1);
  assert.equal(after.body.data.invites[0].name, 'Ben S.');
  assert.ok(after.body.data.vouchers.some((v) => v.code === thanks.code && v.kind === 'thanks'));
  const sellerView = await h.api('GET', '/referrals/my-shop', { token: h.token(seller) });
  assert.equal(sellerView.body.data.stats.rewardedThisMonth, 1);

  // A refund that leaves less than the minimum takes it back.
  await referralService.onOrderRefunded(ordered.body.data.id, 300);
  assert.equal((await referralOf(friend.id)).status, 'REJECTED');
  assert.equal((await h.prisma.voucher.findUnique({ where: { id: thanks.id } })).isActive, false);
});

test('an invite counts without a reward on the inviter\'s own shop, under the minimum it waits', async () => {
  await setInvites({ enabled: true, shopInvites: true });
  const seller = await approvedSeller();
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100 });
  await h.api('PUT', '/referrals/my-shop', { token: h.token(seller), body: { isActive: true, minOrderAmount: 200 } });
  const code = await referralService.codeFor(seller.id);

  const friend = await h.user('BUYER');
  await referralService.attachAtSignup(friend.id, { referralCode: code, referralShop: store.id });
  // ₱100: under the shop's minimum, so the invite still waits.
  await completedOrder(friend, store, item, { quantity: 1 });
  assert.equal((await referralOf(friend.id)).status, 'PENDING');
  await completedOrder(friend, store, item, { quantity: 2 });
  const counted = await referralOf(friend.id);
  assert.equal(counted.status, 'COUNTED');
  assert.equal(counted.reason, 'OWN_SHOP');
  assert.equal(counted.rewardVoucherId, null);

  // No shop at all: any first order counts, with nothing to give.
  const buyer = await h.user('BUYER');
  const other = await h.user('BUYER');
  await referralService.attachAtSignup(other.id, { referralCode: await referralService.codeFor(buyer.id) });
  await completedOrder(other, store, item, { quantity: 1 });
  const plain = await referralOf(other.id);
  assert.equal(plain.status, 'COUNTED');
  assert.equal(plain.reason, 'NO_PROGRAM');
  // A code is set once: a second one changes nothing.
  assert.equal(await referralService.attachAtSignup(other.id, { referralCode: code }), null);
});

test('delivered to the inviter\'s own address: held for an admin, who can approve it', async () => {
  await setInvites({ enabled: true, shopInvites: true, inviterMonthlyCap: 10 });
  const seller = await approvedSeller();
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100 });
  await h.api('PUT', '/referrals/my-shop', { token: h.token(seller), body: { isActive: true, minOrderAmount: 100, welcomeValue: 10, rewardValue: 10 } });
  const { municipality } = await h.reference();
  const inviter = await h.user('BUYER');
  await h.prisma.address.create({
    data: {
      userId: inviter.id, fullName: 'Ci Inviter', contactNumber: '09170000000', municipalityId: municipality.id, barangay: 'Poblacion', street: 'Purok 5 Mabini Street',
    },
  });
  const friend = await h.user('BUYER');
  await referralService.attachAtSignup(friend.id, { referralCode: await referralService.codeFor(inviter.id), referralShop: store.slug });
  await completedOrder(friend, store, item, { quantity: 2, fulfillmentMethod: 'DELIVERY', deliveryAddress: 'Purok 5, Mabini Street, Poblacion, Ci Town' });
  const held = await referralOf(friend.id);
  assert.equal(held.status, 'HELD');
  assert.equal(held.reason, 'SAME_ADDRESS');

  const list = await h.api('GET', '/referrals/admin?status=HELD&pageSize=100', { token: h.token(admin) });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.some((r) => r.id === held.id));
  assert.ok(list.body.data.counts.HELD >= 1);

  // Another town's admin can neither see nor decide it.
  const elsewhere = await h.otherTown(municipality.id);
  const otherAdmin = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: elsewhere.id } } });
  const theirs = await h.api('GET', '/referrals/admin?pageSize=100', { token: h.token(otherAdmin) });
  assert.ok(!theirs.body.data.items.some((r) => r.id === held.id));
  const blocked = await h.api('POST', `/referrals/admin/${held.id}/approve`, { token: h.token(otherAdmin) });
  assert.equal(blocked.status, 403);
  const buyerTry = await h.api('POST', `/referrals/admin/${held.id}/approve`, { token: h.token(friend) });
  assert.equal(buyerTry.status, 403);

  const approved = await h.api('POST', `/referrals/admin/${held.id}/approve`, { token: h.token(admin) });
  assert.equal(approved.status, 200, approved.body?.message);
  const done = await referralOf(friend.id);
  assert.equal(done.status, 'REWARDED');
  assert.ok(done.rewardVoucherId);
  const again = await h.api('POST', `/referrals/admin/${held.id}/reject`, { token: h.token(admin) });
  assert.equal(again.status, 409);
});

test('the inviter\'s monthly cap: past it an invite counts without a reward', async () => {
  await setInvites({ enabled: true, shopInvites: true, inviterMonthlyCap: 1 });
  const seller = await approvedSeller();
  const store = await readyShop(seller);
  const item = await h.product(store, { price: 100 });
  await h.api('PUT', '/referrals/my-shop', { token: h.token(seller), body: { isActive: true, minOrderAmount: 100, welcomeValue: 10, rewardValue: 10 } });
  const inviter = await h.user('BUYER');
  const code = await referralService.codeFor(inviter.id);
  const [first, second] = [await h.user('BUYER'), await h.user('BUYER')];
  for (const friend of [first, second]) {
    await referralService.attachAtSignup(friend.id, { referralCode: code, referralShop: store.id });
    await completedOrder(friend, store, item, { quantity: 1 });
  }
  assert.equal((await referralOf(first.id)).status, 'REWARDED');
  const capped = await referralOf(second.id);
  assert.equal(capped.status, 'COUNTED');
  assert.equal(capped.reason, 'INVITER_CAP');
  await setInvites({ inviterMonthlyCap: 10 });
});

test('a seller invite: once enough different buyers ordered, both shops are boosted', async () => {
  await setInvites({ enabled: true, sellerInvites: true, sellerOrdersToQualify: 2, boostDays: 3 });
  const inviter = await approvedSeller();
  const inviterShop = await readyShop(inviter);
  const code = await referralService.codeFor(inviter.id);
  const mine = await h.api('GET', '/referrals/me', { token: h.token(inviter) });
  assert.equal(mine.body.data.canInviteSellers, true);
  assert.match(mine.body.data.sellerLink, /as=seller/);

  // A friend joins, then opens a shop that is approved.
  const friend = await h.user('BUYER');
  await referralService.attachAtSignup(friend.id, { referralCode: code });
  await h.prisma.user.update({ where: { id: friend.id }, data: { role: 'SELLER', sellerApplicationStatus: 'APPROVED' } });
  const shop = await readyShop(friend);
  const item = await h.product(shop, { price: 100 });
  const referral = await referralService.ensureSellerReferral(friend.id);
  assert.equal(referral.kind, 'SELLER');
  assert.equal(referral.storeId, shop.id);

  // The inviter's own orders do not count; one buyer twice is one buyer.
  await completedOrder(inviter, shop, item, { quantity: 1 });
  const buyer = await h.user('BUYER');
  await completedOrder(buyer, shop, item, { quantity: 1 });
  await completedOrder(buyer, shop, item, { quantity: 1 });
  assert.equal((await referralOf(friend.id, 'SELLER')).status, 'PENDING');
  const progress = await h.api('GET', '/referrals/me', { token: h.token(inviter) });
  assert.equal(progress.body.data.invites.find((r) => r.kind === 'SELLER').progress, '1 of 2 buyers');

  await completedOrder(await h.user('BUYER'), shop, item, { quantity: 1 });
  assert.equal((await referralOf(friend.id, 'SELLER')).status, 'REWARDED');
  const boosts = await h.prisma.storeBoost.findMany({ where: { storeId: { in: [inviterShop.id, shop.id] } } });
  assert.equal(boosts.length, 2);
  const days = (boosts[0].until.getTime() - Date.now()) / 86400e3;
  assert.ok(days > 2.9 && days <= 3, `boost of ${days} days`);
  const boosted = await referralService.boostedStoreIds();
  assert.ok(boosted.has(inviterShop.id) && boosted.has(shop.id));
});
