const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

/*
 * What the admin people and platform pages rely on: a suspension's reason
 * (kept, shown to admins and at sign-in), the users list's filters and the
 * Sellers page's shop numbers, the in-person ID check for an applicant whose
 * shop is in another town, the super admin's municipality edit and stats,
 * category product counts, banner schedules and keeping used vouchers.
 */

let town;
let other;
let superAdmin;
let townAdmin;
let otherAdmin;
const banners = [];
const vouchers = [];
// The town the super admin edits: this file's own, with an id that sorts
// last so h.reference() never hands it to another file (it gets renamed and
// closed here). Kept between runs, like admin-team's town.
const EDIT_TOWN = 'ffffffff-ffff-4fff-8fff-ffffffffff05';

before(async () => {
  town = (await h.reference()).municipality;
  other = await h.otherTown(town.id);
  superAdmin = await h.user('SUPER_ADMIN');
  townAdmin = await h.user('MUNICIPAL_ADMIN');
  otherAdmin = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: other.id } } });
});

after(async () => {
  await h.prisma.banner.deleteMany({ where: { id: { in: banners } } });
  await h.prisma.voucher.deleteMany({ where: { id: { in: vouchers } } });
  await h.prisma.municipality.updateMany({ where: { id: EDIT_TOWN }, data: { name: 'Ci Zz Edit Town', code: 'CI-EDIT', isActive: true } });
  await h.cleanup();
});

test('a suspension keeps its reason: admins see it and the person reads it at sign-in', async () => {
  const buyer = await h.user('BUYER');

  const elsewhere = await h.api('POST', `/auth/users/${buyer.id}/suspend`, { token: h.token(otherAdmin), body: { reason: 'Not yours' } });
  assert.equal(elsewhere.status, 403, 'another town cannot suspend them');

  const done = await h.api('POST', `/auth/users/${buyer.id}/suspend`, { token: h.token(townAdmin), body: { reason: 'Repeated fake orders' } });
  assert.equal(done.status, 200, done.body?.message);

  const log = await h.prisma.auditLog.findFirst({ where: { action: 'SUSPEND_USER', entityId: buyer.id }, orderBy: { createdAt: 'desc' } });
  assert.equal(log.details.reason, 'Repeated fake orders');
  assert.equal(log.municipalityId, town.id, 'filed under their town');

  const detail = await h.api('GET', `/auth/users/${buyer.id}`, { token: h.token(superAdmin) });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.suspension.reason, 'Repeated fake orders');
  assert.equal(detail.body.data.suspension.byName, townAdmin.fullName);

  const login = await h.api('POST', '/auth/login', { body: { email: buyer.email, password: 'Testing#123' } });
  assert.equal(login.status, 403);
  assert.match(login.body.message, /suspended\. Reason: Repeated fake orders\./);

  const back = await h.api('POST', `/auth/users/${buyer.id}/activate`, { token: h.token(townAdmin) });
  assert.equal(back.status, 200);
  const again = await h.api('GET', `/auth/users/${buyer.id}`, { token: h.token(superAdmin) });
  assert.equal(again.body.data.suspension, null, 'nothing to explain once active');
});

test('the users list filters by active or suspended, stays in a town admin\'s town and shows ID status', async () => {
  const active = await h.user('BUYER');
  const suspended = await h.user('BUYER', { isActive: false });
  await h.prisma.identityVerification.create({ data: { userId: active.id, status: 'VERIFIED', idType: 'IN_PERSON', verifiedAt: new Date() } });
  const away = await h.user('BUYER', { municipality: { connect: { id: other.id } } });
  const search = `ci-buyer-${h.RUN}`;

  const off = await h.api('GET', `/auth/users?role=BUYER&isActive=false&search=${search}&pageSize=200`, { token: h.token(superAdmin) });
  assert.equal(off.status, 200);
  const offIds = off.body.data.map((u) => u.id);
  assert.ok(offIds.includes(suspended.id));
  assert.ok(!offIds.includes(active.id));

  const on = await h.api('GET', `/auth/users?role=BUYER&isActive=true&search=${search}&pageSize=200`, { token: h.token(superAdmin) });
  const row = on.body.data.find((u) => u.id === active.id);
  assert.equal(row.identityVerification.status, 'VERIFIED');
  assert.equal(row.identityVerification.encryptedData, undefined, 'never the ID data');
  assert.equal(typeof row._count.orders, 'number');

  // Asking for another town does not widen a town admin's list.
  const scoped = await h.api('GET', `/auth/users?role=BUYER&municipalityId=${other.id}&search=${search}&pageSize=200`, { token: h.token(townAdmin) });
  assert.equal(scoped.status, 200);
  const scopedIds = scoped.body.data.map((u) => u.id);
  assert.ok(!scopedIds.includes(away.id));
  assert.ok(scopedIds.includes(active.id));

  // The super admin can ask for one town.
  const byTown = await h.api('GET', `/auth/users?role=BUYER&municipalityId=${other.id}&search=${search}&pageSize=200`, { token: h.token(superAdmin) });
  assert.deepEqual(byTown.body.data.map((u) => u.id), [away.id]);

  const byName = await h.api('GET', `/auth/users?role=BUYER&sort=name&search=${search}&pageSize=200`, { token: h.token(superAdmin) });
  const names = byName.body.data.map((u) => u.fullName);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('the Sellers list carries each shop\'s live products and orders in 30 days', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({ where: { id: store.id }, data: { isApproved: true } });
  const item = await h.product(store);
  await h.product(store, { status: 'PENDING' });
  const buyer = await h.user('BUYER');
  await h.order(buyer, store, [{ product: item }]);
  await h.order(buyer, store, [{ product: item }], { status: 'CANCELLED' });
  await h.order(buyer, store, [{ product: item }], { createdAt: h.daysAgo(40) });

  const res = await h.api('GET', `/auth/users?role=SELLER&search=${encodeURIComponent(seller.email)}`, { token: h.token(townAdmin) });
  assert.equal(res.status, 200, res.body?.message);
  const row = res.body.data.find((u) => u.id === seller.id);
  assert.deepEqual(row.shopStats, { liveProducts: 1, orders30d: 1, readyToSell: false });
  assert.equal(row.store.isApproved, true);
});

test('the town a shop is in checks its applicant\'s ID in person, even when they live elsewhere', async () => {
  const applicant = await h.user('BUYER', {
    municipality: { connect: { id: other.id } },
    sellerApplicationStatus: 'PENDING',
    shopMunicipalityId: town.id,
  });
  const neighbour = await h.user('BUYER', { municipality: { connect: { id: other.id } } });
  const body = { decision: 'VERIFIED', note: 'Saw their ID at the office' };

  const ok = await h.api('POST', `/moderation/identity/${applicant.id}/review`, { token: h.token(townAdmin), body });
  assert.equal(ok.status, 200, ok.body?.message);
  const record = await h.prisma.identityVerification.findUnique({ where: { userId: applicant.id } });
  assert.equal(record.status, 'VERIFIED');
  assert.equal(record.reviewedById, townAdmin.id);

  const notTheirs = await h.api('POST', `/moderation/identity/${neighbour.id}/review`, { token: h.token(townAdmin), body });
  assert.equal(notTheirs.status, 403, 'someone of another town with no shop here');
  assert.equal(await h.prisma.identityVerification.count({ where: { userId: neighbour.id } }), 0);
});

test('the super admin renames, recodes and closes a town; a town admin cannot', async () => {
  const made = await h.prisma.municipality.upsert({
    where: { id: EDIT_TOWN },
    create: { id: EDIT_TOWN, name: 'Ci Zz Edit Town', code: 'CI-EDIT' },
    update: { name: 'Ci Zz Edit Town', code: 'CI-EDIT', isActive: true },
  });
  const sa = h.token(superAdmin);

  const bad = await h.api('PUT', `/municipalities/${made.id}`, { token: sa, body: { code: 'no spaces here' } });
  assert.equal(bad.status, 400);
  const taken = await h.api('PUT', `/municipalities/${made.id}`, { token: sa, body: { name: town.name } });
  assert.equal(taken.status, 409);

  const code = 'ci-edit-renamed';
  const saved = await h.api('PUT', `/municipalities/${made.id}`, { token: sa, body: { name: 'Ci Zz Renamed Town', code, isActive: false } });
  assert.equal(saved.status, 200, saved.body?.message);
  const now = await h.prisma.municipality.findUnique({ where: { id: made.id } });
  assert.equal(now.name, 'Ci Zz Renamed Town');
  assert.equal(now.code, code.toUpperCase());
  assert.equal(now.isActive, false);

  // A town admin's own town: name, code and the switch are not theirs.
  const before = await h.prisma.municipality.findUnique({ where: { id: town.id } });
  try {
    const tried = await h.api('PUT', `/municipalities/${town.id}`, { token: h.token(townAdmin), body: { name: `${before.name} X`, code: 'CI-HIJACK', isActive: false } });
    assert.equal(tried.status, 200);
    const after = await h.prisma.municipality.findUnique({ where: { id: town.id } });
    assert.equal(after.name, before.name);
    assert.equal(after.code, before.code);
    assert.equal(after.isActive, before.isActive);
  } finally {
    await h.prisma.municipality.update({ where: { id: town.id }, data: { name: before.name, code: before.code, isActive: before.isActive } });
  }

  const stats = await h.api('GET', '/municipalities/admin/stats', { token: sa });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.data[town.id].admins >= 1, 'the town admin counts');
  const refused = await h.api('GET', '/municipalities/admin/stats', { token: h.token(townAdmin) });
  assert.equal(refused.status, 403);
});

test('category product counts are for the super admin', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const p = await h.product(store);
  const res = await h.api('GET', '/categories/admin/product-counts', { token: h.token(superAdmin) });
  assert.equal(res.status, 200);
  assert.ok(res.body.data[p.categoryId].products >= 1);
  assert.ok(res.body.data[p.categoryId].approved >= 1);
  const refused = await h.api('GET', '/categories/admin/product-counts', { token: h.token(townAdmin) });
  assert.equal(refused.status, 403);
});

test('a banner shows only inside its schedule', async () => {
  const sa = h.token(superAdmin);
  const base = { imageUrl: '/uploads/ci-banner.jpg', placement: 'HOME_CAROUSEL', isActive: true };
  const hour = 3600e3;

  const backwards = await h.api('POST', '/banners', { token: sa, body: { ...base, title: `ci-banner-${h.RUN}-x`, startsAt: new Date(Date.now() + 2 * hour), endsAt: new Date(Date.now() + hour) } });
  assert.equal(backwards.status, 400);
  const past = await h.api('POST', '/banners', { token: sa, body: { ...base, title: `ci-banner-${h.RUN}-p`, endsAt: new Date(Date.now() - hour) } });
  assert.equal(past.status, 400);
  const nonsense = await h.api('POST', '/banners', { token: sa, body: { ...base, title: `ci-banner-${h.RUN}-n`, startsAt: 'soon' } });
  assert.equal(nonsense.status, 400);

  const later = await h.api('POST', '/banners', { token: sa, body: { ...base, title: `ci-banner-${h.RUN}-later`, startsAt: new Date(Date.now() + hour) } });
  assert.equal(later.status, 201, later.body?.message);
  banners.push(later.body.data.id);
  const nowOn = await h.api('POST', '/banners', { token: sa, body: { ...base, title: `ci-banner-${h.RUN}-now`, startsAt: new Date(Date.now() - hour), endsAt: new Date(Date.now() + hour) } });
  assert.equal(nowOn.status, 201, nowOn.body?.message);
  banners.push(nowOn.body.data.id);

  let shown = (await h.api('GET', '/banners')).body.data.map((b) => b.id);
  assert.ok(shown.includes(nowOn.body.data.id));
  assert.ok(!shown.includes(later.body.data.id), 'not before its start');

  // Ended: hidden, and it can still be edited with its old end.
  const ended = new Date(Date.now() - 60e3);
  await h.prisma.banner.update({ where: { id: nowOn.body.data.id }, data: { endsAt: ended } });
  await h.api('PUT', `/banners/${later.body.data.id}`, { token: sa, body: { startsAt: null } }); // clears the cache too
  shown = (await h.api('GET', '/banners')).body.data.map((b) => b.id);
  assert.ok(!shown.includes(nowOn.body.data.id), 'not after its end');
  assert.ok(shown.includes(later.body.data.id), 'no start: shown');
  const retitle = await h.api('PUT', `/banners/${nowOn.body.data.id}`, { token: sa, body: { title: `ci-banner-${h.RUN}-renamed`, endsAt: ended } });
  assert.equal(retitle.status, 200, retitle.body?.message);

  const admin = await h.api('GET', '/banners/admin', { token: sa });
  assert.ok(admin.body.data.some((b) => b.id === nowOn.body.data.id), 'the admin list keeps ended ones');
});

test('a used platform voucher is disabled, not deleted', async () => {
  const sa = h.token(superAdmin);
  const used = await h.prisma.voucher.create({ data: { code: `CIUSED${h.RUN}`.slice(0, 32), discountType: 'FIXED', discountValue: 10, timesUsed: 2 } });
  const fresh = await h.prisma.voucher.create({ data: { code: `CIFRESH${h.RUN}`.slice(0, 32), discountType: 'FIXED', discountValue: 10 } });
  vouchers.push(used.id, fresh.id);

  const refused = await h.api('DELETE', `/vouchers/${used.id}`, { token: sa });
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /Disable it instead/);
  assert.ok(await h.prisma.voucher.findUnique({ where: { id: used.id } }));

  const gone = await h.api('DELETE', `/vouchers/${fresh.id}`, { token: sa });
  assert.equal(gone.status, 200);
  assert.equal(await h.prisma.voucher.findUnique({ where: { id: fresh.id } }), null);
});
