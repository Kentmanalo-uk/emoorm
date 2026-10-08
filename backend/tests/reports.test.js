const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const reporters = [];

// Reports are not in the cleanup helper's list; they go first so the users can.
after(async () => {
  await h.prisma.report.deleteMany({ where: { reporterId: { in: reporters } } });
  await h.cleanup();
});

test('a report is checked, and the same open report cannot be sent twice', async () => {
  const buyer = await h.user('BUYER');
  reporters.push(buyer.id);
  const store = await h.shop(await h.user('SELLER'));
  const item = await h.product(store);
  const token = h.token(buyer);
  const report = (extra = {}) => h.api('POST', '/reports', {
    token,
    body: { type: 'PRODUCT', productId: item.id, reason: 'MISLEADING', description: 'The photos are of another item.', ...extra },
  });

  assert.equal((await report({ description: 'x'.repeat(2001) })).status, 400);
  assert.equal((await report({ description: { text: 'not a string' } })).status, 400);
  assert.equal((await report({ evidence: ['https://elsewhere.example/a.png'] })).status, 400);
  assert.equal((await report({ evidence: Array(6).fill('/uploads/a.png') })).status, 400);

  assert.equal((await report({ evidence: ['/uploads/proof-1.jpg'] })).status, 201);
  const again = await report();
  assert.equal(again.status, 409);
  assert.equal(again.body.message, 'You already have an open report about this');
  assert.equal(await h.prisma.report.count({ where: { reporterId: buyer.id } }), 1);
});
