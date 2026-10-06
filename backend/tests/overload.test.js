const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

process.env.API_MAX_ACTIVE = '2';
process.env.API_MAX_WAIT_MS = '200';
process.env.API_MAX_QUEUE = '2';
const { overloadGuard, overloadStats } = require('../src/middleware/overload');

const response = () => {
  const res = new EventEmitter();
  res.headers = {};
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.emit('finish'); return res; };
  return res;
};
const run = (method = 'GET') => {
  const req = { method, path: '/products' };
  const res = response();
  const call = { res, started: false };
  overloadGuard(req, res, () => { call.started = true; });
  return call;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('reads past the limit wait their turn, in order; writes never wait', () => {
  const a = run();
  const b = run();
  const c = run();
  const d = run();
  assert.ok(a.started && b.started);
  assert.equal(c.started, false);
  assert.equal(run('POST').started, true);

  a.res.emit('finish');
  assert.equal(c.started, true);
  assert.equal(d.started, false);
  // A dropped connection makes room once, not twice.
  b.res.emit('close');
  b.res.emit('finish');
  assert.equal(d.started, true);
  assert.deepEqual({ active: overloadStats().active, waiting: overloadStats().waiting }, { active: 2, waiting: 0 });
  c.res.emit('finish');
  d.res.emit('finish');
});

test('a read that waits too long, or finds the line full, is told to come back', async () => {
  const a = run();
  const b = run();
  const c = run();
  const d = run();
  const full = run();
  assert.equal(full.res.statusCode, 503);
  assert.ok(Number(full.res.headers['Retry-After']) >= 1);

  // One leaves the line; the other times out.
  d.res.emit('close');
  await sleep(250);
  assert.equal(c.started, false);
  assert.equal(c.res.statusCode, 503);
  assert.equal(overloadStats().waiting, 0);
  a.res.emit('finish');
  b.res.emit('finish');
  assert.equal(overloadStats().active, 0);
});
