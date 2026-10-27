const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

/** A tiny cookie jar over fetch, as the browser keeps for the website. */
const browser = () => {
  const jar = new Map();
  const call = async (method, path, body) => {
    const base = await h.startApp();
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Session': 'cookie', ...(cookie ? { Cookie: cookie } : {}), ...(call.token ? { Authorization: `Bearer ${call.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at).trim();
      const value = decodeURIComponent(pair.slice(at + 1));
      const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a)) || value === '';
      if (expired) jar.delete(name); else jar.set(name, value);
      assert.ok(attrs.some((a) => /httponly/i.test(a)), `${name} is httpOnly`);
      assert.ok(attrs.some((a) => /samesite=strict/i.test(a)), `${name} is SameSite=Strict`);
    }
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  call.jar = jar;
  call.token = null;
  return call;
};

test('the website keeps its refresh token in an httpOnly cookie, never in the page', async () => {
  const buyer = await h.user('BUYER');
  const web = browser();
  const login = await web('POST', '/auth/login', { email: buyer.email, password: 'Testing#123' });
  assert.equal(login.status, 200, login.body?.message);
  assert.ok(login.body.data.accessToken);
  assert.equal('refreshToken' in login.body.data, false, 'no refresh token in the body');
  assert.ok(web.jar.get('emoorm_rt'), 'the session cookie is set');

  // Renewing from the cookie alone.
  const first = web.jar.get('emoorm_rt');
  const renewed = await web('POST', '/auth/refresh-token', {});
  assert.equal(renewed.status, 200, renewed.body?.message);
  assert.equal('refreshToken' in renewed.body.data, false);
  assert.notEqual(web.jar.get('emoorm_rt'), first, 'rotated');

  // Signing out ends it and clears the cookie.
  web.token = renewed.body.data.accessToken;
  assert.equal((await web('POST', '/auth/logout', {})).status, 200);
  assert.equal(web.jar.has('emoorm_rt'), false);
  web.token = null;
  assert.equal((await web('POST', '/auth/refresh-token', { refreshToken: first })).status, 401);
});

test('switch account keeps each account\'s session in its own cookie', async () => {
  const a = await h.user('BUYER');
  const b = await h.user('BUYER');
  const web = browser();
  await web('POST', '/auth/login', { email: a.email, password: 'Testing#123' });
  const kept = await web('POST', '/auth/sessions/keep', {});
  assert.equal(kept.body.data.userId, a.id);
  assert.equal(web.jar.has('emoorm_rt'), false);
  assert.ok(web.jar.get(`emoorm_rt_${a.id}`));

  await web('POST', '/auth/login', { email: b.email, password: 'Testing#123' });
  const list = await web('GET', '/auth/sessions/kept');
  assert.deepEqual(list.body.data.userIds, [a.id]);

  const switched = await web('POST', '/auth/sessions/switch', { userId: a.id });
  assert.equal(switched.status, 200, switched.body?.message);
  assert.equal('refreshToken' in switched.body.data, false);
  const me = await fetch(`${await h.startApp()}/auth/profile`, { headers: { Authorization: `Bearer ${switched.body.data.accessToken}` } }).then((r) => r.json());
  assert.equal(me.data.id, a.id, 'signed in as A');
  assert.ok(web.jar.get(`emoorm_rt_${b.id}`), 'B is set aside');
  assert.equal(web.jar.has(`emoorm_rt_${a.id}`), false);

  // Forgetting B ends its session.
  const bToken = web.jar.get(`emoorm_rt_${b.id}`);
  assert.equal((await web('POST', '/auth/sessions/forget', { userId: b.id })).status, 200);
  assert.equal(web.jar.has(`emoorm_rt_${b.id}`), false);
  const app = await h.api('POST', '/auth/refresh-token', { body: { refreshToken: bToken } });
  assert.equal(app.status, 401);
});

test('the app (no X-Session) still gets its refresh token in the body', async () => {
  const buyer = await h.user('BUYER');
  const login = await h.api('POST', '/auth/login', { body: { email: buyer.email, password: 'Testing#123' } });
  assert.equal(login.status, 200);
  assert.ok(login.body.data.refreshToken);
  const renewed = await h.api('POST', '/auth/refresh-token', { body: { refreshToken: login.body.data.refreshToken } });
  assert.ok(renewed.body.data.refreshToken);
});
