const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const h = require('./helpers');

const ids = [];
after(async () => {
  await h.prisma.appInstall.deleteMany({ where: { id: { in: ids } } });
  await h.cleanup();
});

const APP_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 EmoormApp/1.3.4';
const newId = () => { const id = crypto.randomUUID(); ids.push(id); return id; };
const ping = (body, { ua = APP_UA, token } = {}) => h.api('POST', '/app/ping', { body, token, headers: { 'User-Agent': ua } });

test('the app reports its install; a browser does not count', async () => {
  const id = newId();
  const browser = await ping({ installId: id, launch: true }, { ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129' });
  assert.equal(browser.status, 202);
  assert.equal(browser.body.recorded, false);
  assert.equal(await h.prisma.appInstall.findUnique({ where: { id } }), null);

  const bad = await ping({ installId: 'x', launch: true });
  assert.equal(bad.body.recorded, false);

  const first = await ping({ installId: id, launch: true });
  assert.equal(first.body.recorded, true);
  const row = await h.prisma.appInstall.findUnique({ where: { id } });
  assert.equal(row.version, '1.3.4');
  assert.equal(row.android, '13');
  assert.equal(row.device, 'SM-A135F');
  assert.equal(row.userId, null);
  assert.equal(row.opens, 1);
});

test('signing in inside the app links the install to the person', async () => {
  const id = newId();
  await ping({ installId: id, launch: true });
  const buyer = await h.user('BUYER');
  const signedIn = await ping({ installId: id }, { token: h.token(buyer) });
  assert.equal(signedIn.body.recorded, true);
  const row = await h.prisma.appInstall.findUnique({ where: { id } });
  assert.equal(row.userId, buyer.id);
  assert.equal(row.opens, 1, 'a sign-in is not another launch');
});

test('only the super admin sees the app numbers', async () => {
  const id = newId();
  const buyer = await h.user('BUYER');
  await ping({ installId: id, launch: true }, { token: h.token(buyer) });

  assert.equal((await h.api('GET', '/app/stats')).status, 401);
  assert.equal((await h.api('GET', '/app/stats', { token: h.token(buyer) })).status, 403);
  const muni = await h.user('MUNICIPAL_ADMIN');
  assert.equal((await h.api('GET', '/app/stats', { token: h.token(muni) })).status, 403);

  const boss = await h.user('SUPER_ADMIN');
  const res = await h.api('GET', '/app/stats', { token: h.token(boss) });
  assert.equal(res.status, 200, res.body?.message);
  const { installs, versions, people } = res.body.data;
  assert.ok(installs.total >= 1 && installs.active7 >= 1);
  assert.ok(versions.some((v) => v.version === '1.3.4' && v.installs >= 1));
  const mine = people.find((p) => p.installId === id);
  assert.equal(mine.user.id, buyer.id);
  assert.equal(mine.device, 'SM-A135F');
});
