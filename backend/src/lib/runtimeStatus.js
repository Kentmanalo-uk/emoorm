/**
 * What the running server knows about itself, for /health and the logs:
 * whether the database migrations applied, and when each background job last
 * ran (and whether it failed).
 *
 * Jobs are also coordinated through the database (lib/securityCounters), so
 * two copies of the server (the old and the new one during a deploy, or two
 * instances) do not both run them: a job runs under a lock of its own, and
 * one that another copy finished within its interval is not run again.
 */
const status = {
  migrations: { state: 'not-run', at: null }, // not-run | running | ok | failed | skipped
  jobs: {}, // name -> { lastRun, lastOk, lastError, every }
};

const setMigrations = (state) => {
  status.migrations = { state, at: new Date().toISOString() };
};

/**
 * Run a background job once and record the outcome.
 * @param {String} name
 * @param {Function} run - async
 * @param {Number} everyMs - how often it is meant to run (to tell when it is late)
 */
// Every job that ran here, for runDue (an uptime monitor's wake-up call).
const registry = new Map(); // name -> { run, every }
// A lock taken by a copy that then stopped is free again after this.
const LOCK_MS = 30 * 60 * 1000;
const counters = () => require('./securityCounters');

const runJob = async (name, run, everyMs) => {
  const entry = status.jobs[name] || { lastRun: null, lastOk: null, lastError: null, every: everyMs, running: false };
  status.jobs[name] = entry;
  entry.every = everyMs;
  registry.set(name, { run, every: everyMs });
  // A tick that arrives while the previous run is still going (a slow
  // database) is skipped rather than run alongside it: two copies of the
  // same job would fight over the same rows.
  if (entry.running) return null;
  entry.running = true;
  let locked = false;
  try {
    // Another copy of the server ran it within (most of) its interval: not
    // again. It counts as run, for /health.
    if (await counters().peek(`job-done:${name}`)) {
      entry.lastRun = new Date().toISOString();
      entry.lastOk = entry.lastRun;
      return null;
    }
    // Another copy is running it right now.
    if ((await counters().hit(`job-lock:${name}`, LOCK_MS)).hits > 1) {
      entry.lastRun = new Date().toISOString();
      return null;
    }
    locked = true;
  } catch (err) {
    // The database is down: run it here as before (the job finds out soon).
    console.error(`[job:${name}] could not check the lock:`, err.message);
  }
  entry.lastRun = new Date().toISOString();
  try {
    const result = await run();
    entry.lastOk = entry.lastRun;
    entry.lastError = null;
    if (locked) {
      await counters().put(`job-done:${name}`, null, new Date(Date.now() + everyMs * 0.9)).catch(() => {});
    }
    return result;
  } catch (err) {
    entry.lastError = err?.message || String(err);
    console.error(`[job:${name}] failed:`, entry.lastError);
    return null;
  } finally {
    entry.running = false;
    if (locked) await counters().clear(`job-lock:${name}`).catch(() => {});
  }
};

/**
 * Run now every job that is due (not run within its interval anywhere):
 * for an uptime monitor's call (/api/jobs/run-due), which also wakes a
 * server the host had put to sleep. Runs in the background; answers which
 * jobs were started.
 * @returns {String[]}
 */
const runDue = () => {
  const now = Date.now();
  const started = [];
  for (const [name, job] of registry) {
    const entry = status.jobs[name];
    if (entry?.running) continue;
    if (entry?.lastRun && now - new Date(entry.lastRun).getTime() < job.every) continue;
    started.push(name);
    runJob(name, job.run, job.every).catch(() => {});
  }
  return started;
};

/**
 * Jobs that have not run for over twice their interval. A job on its first
 * run (still checking its lock) is not late yet.
 */
const lateJobs = (now = Date.now()) => Object.entries(status.jobs)
  .filter(([, j]) => (j.lastRun
    ? now - new Date(j.lastRun).getTime() > 2 * j.every + 60 * 1000
    : !j.running))
  .map(([name]) => name);

const snapshot = () => ({
  migrations: status.migrations.state,
  jobs: Object.fromEntries(Object.entries(status.jobs).map(([name, j]) => [name, {
    lastRun: j.lastRun,
    ok: !j.lastError,
  }])),
  lateJobs: lateJobs(),
});

module.exports = { setMigrations, runJob, runDue, lateJobs, snapshot };
