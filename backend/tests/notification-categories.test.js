// The notification inbox's groups (the app's Chats · Orders · Alerts · Promos
// bar): ?category= narrows the list to one group, and the list says how many
// unread notifications each group has.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { categoryOfType } = require('../src/utils/notificationCategories');

after(() => h.cleanup());

test('?category= lists one group, and each group reports its unread count', async () => {
  const buyer = await h.user('BUYER');
  const token = h.token(buyer);
  const notice = (type, isRead = false) => ({
    userId: buyer.id, type, audience: 'BUYER', title: `ci ${type}`, message: 'ci', isRead,
  });
  await h.prisma.notification.createMany({
    data: [
      notice('STORE_MESSAGE'), notice('PRICE_OFFER', true), // chats: 1 unread
      notice('ORDER_CONFIRMED'), notice('ORDER_READY'), notice('RETURN_REFUNDED', true), // orders: 2 unread
      notice('PRICE_DROP'), // promos: 1 unread
      notice('SYSTEM_ANNOUNCEMENT', true), notice('LOW_STOCK'), // alerts: 1 unread
    ],
  });

  const all = await h.api('GET', '/notifications?audience=BUYER&pageSize=50', { token });
  assert.equal(all.status, 200);
  assert.equal(all.body.data.length, 8);
  assert.deepEqual(all.body.unreadByCategory, { chats: 1, orders: 2, promos: 1, alerts: 1 });
  assert.equal(all.body.unreadCount, 5);

  const want = { chats: 2, orders: 3, promos: 1, alerts: 2 };
  for (const [category, n] of Object.entries(want)) {
    const res = await h.api('GET', `/notifications?audience=BUYER&pageSize=50&category=${category}`, { token });
    assert.equal(res.status, 200, category);
    assert.equal(res.body.data.length, n, category);
    assert.ok(res.body.data.every((x) => categoryOfType(x.type) === category), category);
    assert.equal(res.body.pagination.total, n, category);
  }

  // With unread only, in a group.
  const unreadOrders = await h.api('GET', '/notifications?audience=BUYER&category=orders&isRead=false', { token });
  assert.equal(unreadOrders.body.data.length, 2);

  // An unknown group is ignored (the whole list), not an error.
  const odd = await h.api('GET', '/notifications?audience=BUYER&pageSize=50&category=nonsense', { token });
  assert.equal(odd.status, 200);
  assert.equal(odd.body.data.length, 8);
});
