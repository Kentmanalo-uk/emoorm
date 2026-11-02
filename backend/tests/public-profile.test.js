// /u/:id is the person, whoever they are. A shop owner can be somebody else's
// customer, and that seller asking who bought from them must not be sent to
// the buyer's own shop.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const prisma = require('../src/config/database');

after(async () => { await h.cleanup(); });

const view = (id, viewer) => h.api('GET', `/profiles/${id}`, viewer ? { token: h.token(viewer) } : {});

async function shopOwnerWhoBuys() {
  const buyer = await h.user('SELLER');
  await h.shop(buyer);
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  await h.order(buyer, store, [{ product: item }]);
  return { buyer, seller };
}

test('a buyer who owns a shop comes back as a person, with no shop to redirect to', async () => {
  const { buyer, seller } = await shopOwnerWhoBuys();
  const res = await view(buyer.id, seller);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.id, buyer.id);
  assert.equal(res.body.data.fullName, buyer.fullName);
  assert.equal('store' in res.body.data, false);
  assert.equal('isSeller' in res.body.data, false);
});

test('the avatar they picked comes with them', async () => {
  const buyer = await h.user('BUYER');
  await prisma.user.update({ where: { id: buyer.id }, data: { avatarKey: 'fox' } });
  assert.equal((await view(buyer.id)).body.data.avatarKey, 'fox');
});

test('their seller can chat, even when the buyer owns a shop', async () => {
  const { buyer, seller } = await shopOwnerWhoBuys();
  assert.equal((await view(buyer.id, seller)).body.data.canChat, true);
});

test('nobody else is offered a chat that could not open', async () => {
  const { buyer } = await shopOwnerWhoBuys();
  const stranger = await h.user('BUYER');
  const otherSeller = await h.user('SELLER');
  await h.shop(otherSeller);

  assert.equal((await view(buyer.id, stranger)).body.data.canChat, false);
  assert.equal((await view(buyer.id, otherSeller)).body.data.canChat, false);
  assert.equal((await view(buyer.id)).body.data.canChat, false);
  assert.equal((await view(buyer.id, buyer)).body.data.canChat, false);
});
