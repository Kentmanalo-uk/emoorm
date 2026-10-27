const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const h = require('./helpers');

const tag = `ci-${h.RUN}`;
after(async () => {
  await h.prisma.securityCounter.deleteMany({ where: { name: { contains: tag } } });
  await h.cleanup();
});

// Two copies of the server (the old and the new during a deploy): the same
// module loaded twice has two separate memories, and one database.
const STATUS = path.join(__dirname, '../src/lib/runtimeStatus.js');
const freshCopy = () => {
  delete require.cache[require.resolve(STATUS)];
  return require(STATUS);
};

test('two copies of the server run a job once, not side by side and not twice in its interval', async () => {
  const one = freshCopy();
  const two = freshCopy();
  const name = `${tag}-daily`;
  let runs = 0;
  const job = async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 300));
  };
  // At the same moment: one runs it, the other sees the lock.
  await Promise.all([one.runJob(name, job, 60000), two.runJob(name, job, 60000)]);
  assert.equal(runs, 1);
  // Later, within its interval: the copy that did not run it does not run it now.
  await two.runJob(name, job, 60000);
  assert.equal(runs, 1);
  // Neither copy counts it as late.
  assert.equal(one.lateJobs().includes(name), false);
  assert.equal(two.lateJobs().includes(name), false);

  // A job that failed is not marked done: it runs again.
  const failing = `${tag}-fails`;
  let tries = 0;
  await one.runJob(failing, async () => { tries += 1; throw new Error('boom'); }, 60000);
  await two.runJob(failing, async () => { tries += 1; }, 60000);
  assert.equal(tries, 2);
});

test('the uptime monitor\'s call starts the jobs that are due, and only with the token', async () => {
  const status = require(STATUS);
  const name = `${tag}-due`;
  let ran = 0;
  await status.runJob(name, async () => { ran += 1; }, 1000);
  assert.equal(ran, 1);
  // Not due yet: nothing.
  assert.equal(status.runDue().includes(name), false);
  // Its interval passed (and its done-mark): started again.
  await new Promise((r) => setTimeout(r, 1100));
  await h.prisma.securityCounter.deleteMany({ where: { name: `job-done:${name}` } });
  assert.ok(status.runDue().includes(name));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(ran, 2);

  // Over HTTP: not for a stranger behind the proxy (no token).
  const site = (await h.startApp()).replace(/\/api$/, '');
  const stranger = await fetch(`${site}/health/run-jobs`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
  assert.equal(stranger.status, 404);
  process.env.HEALTH_TOKEN = 'ci-health-token-0123456789';
  try {
    const monitor = await fetch(`${site}/health/run-jobs?token=ci-health-token-0123456789`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    assert.equal(monitor.status, 200);
    assert.ok(Array.isArray((await monitor.json()).started));
  } finally {
    delete process.env.HEALTH_TOKEN;
  }
});
