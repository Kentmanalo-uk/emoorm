const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const webpush = require('web-push');

// Keys of its own, set before the app reads the environment.
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = 'mailto:ci@example.test';

const h = require('./helpers');

after(h.cleanup);

test('a browser subscribes, gets each notification, and is forgotten once it unsubscribed', async () => {
  const buyer = await h.user('BUYER');
  const token = h.token(buyer);
  const config = await h.api('GET', '/push/config');
  assert.equal(config.body.data.enabled, true);

  const browserKeys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
  const endpoint = `https://push.example.test/${h.RUN}`;
  assert.equal((await h.api('POST', '/push/subscribe', { token, body: { subscription: { endpoint: 'http://insecure', keys: browserKeys } } })).status, 400);
  assert.equal((await h.api('POST', '/push/subscribe', { token, body: { subscription: { endpoint, keys: browserKeys } } })).status, 200);

  const sent = [];
  const original = webpush.sendNotification;
  webpush.sendNotification = async (sub, payload) => { sent.push({ sub, payload: JSON.parse(payload) }); return { statusCode: 201 }; };
  try {
    const notices = require('../src/services/notification.service');
    const n = await notices.createNotification({ userId: buyer.id, type: 'ORDER_CONFIRMED', title: 'Order confirmed', message: 'Your order is confirmed.' });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].sub.endpoint, endpoint);
    assert.equal(sent[0].payload.url, `/notifications/${n.id}`);

    // The browser unsubscribed on its side: the push service answers 410.
    webpush.sendNotification = async () => { const e = new Error('Gone'); e.statusCode = 410; throw e; };
    await notices.createNotification({ userId: buyer.id, type: 'ORDER_CONFIRMED', title: 'Again', message: 'x' });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(await h.prisma.pushToken.count({ where: { userId: buyer.id } }), 0);
  } finally {
    webpush.sendNotification = original;
  }
});
