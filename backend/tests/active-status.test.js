const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const activeStatus = require('../src/services/activeStatus.service');
const { activeStatus: statusAt, activeLabel } = require('../src/utils/activity');
const { withDeadlockRetry: retry } = require('../src/lib/dbRetry');

after(h.cleanup);

const ago = (ms) => new Date(Date.now() - ms);
const MIN = 60e3;

// Set a person's last activity straight in the database, and forget what the
// service remembered (it reuses answers for half a minute).
const lastActive = async (u, when) => {
  await retry(() => h.prisma.user.update({ where: { id: u.id }, data: { lastActiveAt: when } }));
  activeStatus.forget();
};

const openShop = async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await retry(() => h.prisma.store.update({ where: { id: store.id }, data: { isActive: true, isApproved: true, isSuspended: false } }));
  const product = await h.product(store);
  return { seller, store, product };
};

// What the shop page, the directory and the product page say about the seller.
const shopViews = async ({ store, product }) => {
  const front = await h.api('GET', `/stores/slug/${store.slug}/storefront`);
  assert.equal(front.status, 200, front.body?.message);
  const list = await h.api('GET', `/stores?search=${encodeURIComponent(store.name)}`);
  assert.equal(list.status, 200, list.body?.message);
  const row = list.body.data.find((s) => s.id === store.id);
  assert.ok(row, 'the shop is in the directory');
  const page = await h.api('GET', `/products/slug/${product.slug}`);
  assert.equal(page.status, 200, page.body?.message);
  return { front: front.body.data, row, onProduct: page.body.data.store };
};

test('the label and the status a viewer may know', () => {
  const now = Date.now();
  assert.deepEqual(statusAt(null, now), { active: false, activeAt: null });
  assert.equal(statusAt(new Date(now - MIN), now).active, true);
  assert.equal(statusAt(new Date(now - 10 * MIN), now).active, false);
  assert.ok(statusAt(new Date(now - 10 * MIN), now).activeAt);
  assert.deepEqual(statusAt(new Date(now - 25 * 60 * MIN), now), { active: false, activeAt: null });
  assert.equal(activeLabel(new Date(now - MIN), now), 'Active now');
  assert.equal(activeLabel(new Date(now - 12 * MIN), now), 'Active 12m ago');
  assert.equal(activeLabel(new Date(now - 3 * 60 * MIN - 5), now), 'Active 3h ago');
  assert.equal(activeLabel(new Date(now - 2 * 24 * 60 * MIN), now), '');
});

test('a shop whose seller was on a minute ago is active now everywhere buyers see it', async () => {
  const shop = await openShop();
  // Asked once before, so the lists are already cached without it.
  await shopViews(shop);
  await lastActive(shop.seller, ago(MIN));
  const { front, row, onProduct } = await shopViews(shop);
  for (const [where, s] of [['shop page', front], ['directory', row], ['product page', onProduct]]) {
    assert.equal(s.active, true, `active on the ${where}`);
    assert.ok(s.activeAt, `activeAt on the ${where}`);
    assert.ok(Date.now() - Date.parse(s.activeAt) < 3 * MIN, `a recent activeAt on the ${where}`);
  }
  // Only the status: never the owner's raw timestamp.
  assert.equal(front.owner?.lastActiveAt, undefined);
  assert.equal('lastActiveAt' in front, false);
});

test('ten minutes ago: not active, but when they were on; two days ago: nothing', async () => {
  const shop = await openShop();
  await lastActive(shop.seller, ago(10 * MIN));
  let views = await shopViews(shop);
  for (const s of [views.front, views.row, views.onProduct]) {
    assert.equal(s.active, false);
    assert.ok(s.activeAt);
    const age = Date.now() - Date.parse(s.activeAt);
    assert.ok(age >= 9 * MIN && age < 12 * MIN, `about ten minutes (${age} ms)`);
  }

  await lastActive(shop.seller, ago(2 * 24 * 60 * MIN));
  views = await shopViews(shop);
  for (const s of [views.front, views.row, views.onProduct]) {
    assert.equal(s.active, false);
    assert.equal(s.activeAt, null);
  }

  await lastActive(shop.seller, null);
  views = await shopViews(shop);
  assert.equal(views.front.active, false);
  assert.equal(views.front.activeAt, null);
});

test('in chats the buyer sees the seller\'s status and the seller sees the buyer\'s', async () => {
  const { seller, store } = await openShop();
  const buyer = await h.user('BUYER');
  const convo = await retry(() => h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: store.id, lastMessageAt: new Date() } }));
  await retry(() => h.prisma.message.create({ data: { conversationId: convo.id, senderId: buyer.id, body: 'Hello po' } }));

  // The buyer looks: the seller was on a minute ago.
  await lastActive(seller, ago(MIN));
  const list = await h.api('GET', '/messages/conversations', { token: h.token(buyer) });
  assert.equal(list.status, 200, list.body?.message);
  const item = list.body.data.find((c) => c.id === convo.id);
  assert.equal(item.role, 'buyer');
  assert.equal(item.store.active, true);
  assert.ok(item.store.activeAt);
  // Nothing about the buyer themself.
  assert.equal(item.buyer.active, undefined);
  const thread = await h.api('GET', `/messages/conversations/${convo.id}`, { token: h.token(buyer) });
  assert.equal(thread.status, 200, thread.body?.message);
  assert.equal(thread.body.data.store.active, true);
  assert.equal(thread.body.data.buyer.active, undefined);

  // That request marked the buyer active (in the background): wait for it,
  // then put the buyer twelve minutes back.
  await h.eventually(async () => {
    const u = await h.prisma.user.findUnique({ where: { id: buyer.id }, select: { lastActiveAt: true } });
    return u.lastActiveAt && Date.now() - u.lastActiveAt.getTime() < MIN;
  });
  await lastActive(buyer, ago(12 * MIN));

  // The seller looks: the buyer's status, nothing about the shop.
  const sellerList = await h.api('GET', '/messages/conversations', { token: h.token(seller) });
  assert.equal(sellerList.status, 200, sellerList.body?.message);
  const row = sellerList.body.data.find((c) => c.id === convo.id);
  assert.equal(row.role, 'seller');
  assert.equal(row.buyer.active, false);
  assert.ok(row.buyer.activeAt);
  assert.equal(row.store.active, undefined);
  const sellerThread = await h.api('GET', `/messages/conversations/${convo.id}`, { token: h.token(seller) });
  assert.equal(sellerThread.body.data.buyer.active, false);
  assert.ok(sellerThread.body.data.buyer.activeAt);
  assert.equal(sellerThread.body.data.store.active, undefined);

  // And when the buyer is on now, the seller sees it.
  await lastActive(buyer, ago(30e3));
  const later = await h.api('GET', `/messages/conversations/${convo.id}`, { token: h.token(seller) });
  assert.equal(later.body.data.buyer.active, true);
});
