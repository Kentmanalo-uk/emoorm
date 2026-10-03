const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// SMS written to the log (no gateway), and cash on delivery needing a verified number.
process.env.SEMAPHORE_API_KEY = '';
process.env.SMS_DEV_LOG = '1';
process.env.COD_REQUIRES_VERIFIED_PHONE = 'true';
const h = require('./helpers');

after(h.cleanup);

// The code, read from the dev SMS log line.
const texts = [];
const warn = console.warn;
console.warn = (...args) => { const line = args.join(' '); if (line.startsWith('[sms:dev]')) texts.push(line); else warn(...args); };
after(() => { console.warn = warn; });
const lastCode = () => texts.at(-1)?.match(/code is (\d{6})/)?.[1];

test('a number is proven with a code by SMS, and cash on delivery then goes through', async () => {
  const seller = await h.user('SELLER');
  const store = await h.prisma.store.update({ where: { id: (await h.shop(seller)).id }, data: { fulfillmentMode: 'PICKUP', pickupAddress: 'Stall 1', acceptsCod: true } });
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const token = h.token(buyer);
  const cod = () => h.api('POST', '/orders', { token, body: { storeId: store.id, fulfillmentMethod: 'PICKUP', paymentMethod: 'COD', contactNumber: '09171234567', items: [{ productId: item.id, quantity: 1 }] } });

  const refused = await cod();
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /Verify your mobile number/);

  assert.equal((await h.api('POST', '/auth/phone/send', { token, body: { number: '12345' } })).status, 400);
  const sent = await h.api('POST', '/auth/phone/send', { token, body: { number: '0917 123 4567' } });
  assert.equal(sent.status, 200, sent.body?.message);
  assert.equal(sent.body.data.sentTo, '0917***567');
  assert.equal((await h.api('POST', '/auth/phone/send', { token, body: { number: '09171234567' } })).status, 429);
  assert.equal((await h.api('POST', '/auth/phone/verify', { token, body: { code: '000000' === lastCode() ? '111111' : '000000' } })).status, 400);
  const ok = await h.api('POST', '/auth/phone/verify', { token, body: { code: lastCode() } });
  assert.equal(ok.status, 200, ok.body?.message);
  assert.equal(ok.body.data.phoneVerifiedNumber, '09171234567');

  assert.equal((await cod()).status, 201);
  const profile = await h.api('GET', '/auth/profile', { token });
  assert.ok(profile.body.data.phoneVerifiedAt);
});
