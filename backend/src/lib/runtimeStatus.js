/**
 * What the running server knows about itself, for /health and the logs:
 * whether the database migrations applied, and when each background job last
 * ran (and whether it failed). Shared in-process state; nothing is stored.
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
const runJob = async (name, run, everyMs) => {
  const entry = status.jobs[name] || { lastRun: null, lastOk: null, lastError: null, every: everyMs, running: false };
  status.jobs[name] = entry;
  entry.every = everyMs;
  // A tick that arrives while the previous run is still going (a slow
  // database) is skipped rather than run alongside it: two copies of the
  // same job would fight over the same rows.
  if (entry.running) return null;
  entry.running = true;
  entry.lastRun = new Date().toISOString();
  try {
    const result = await run();
    entry.lastOk = entry.lastRun;
    entry.lastError = null;
    return result;
  } catch (err) {
    entry.lastError = err?.message || String(err);
    console.error(`[job:${name}] failed:`, entry.lastError);
    return null;
  } finally {
    entry.running = false;
  }
};

/** Jobs that have not run for over twice their interval. */
const lateJobs = (now = Date.now()) => Object.entries(status.jobs)
  .filter(([, j]) => !j.lastRun || now - new Date(j.lastRun).getTime() > 2 * j.every + 60 * 1000)
  .map(([name]) => name);

const snapshot = () => ({
  migrations: status.migrations.state,
  jobs: Object.fromEntries(Object.entries(status.jobs).map(([name, j]) => [name, {
    lastRun: j.lastRun,
    ok: !j.lastError,
  }])),
  lateJobs: lateJobs(),
});

module.exports = { setMigrations, runJob, lateJobs, snapshot };
