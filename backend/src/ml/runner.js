const store = require('./store');
const settings = require('./settings');
const counters = require('./counters');
const { MODULES, byKey, isBuilt, DAY } = require('./modules');

/**
 * Runs the ML engine's jobs inside the existing server, the way every other
 * background job runs (lib/runtimeStatus.runJob: a database lock across
 * copies of the server, /health knows when one is late). On top of that:
 *
 *   - one ML job at a time in this process (the plan caps threads and RAM);
 *   - a time budget per run (ML_JOB_BUDGET_MS, 20 s): the job is told how
 *     much time is left and is expected to stop between batches; a run that
 *     overruns is recorded as TIMED_OUT and its result is not used;
 *   - every run is written to ml_training_runs (duration, rows, scores,
 *     memory, or a short reason it failed), and a failure never throws into
 *     the server.
 */

const BUDGET_MS = Math.max(2000, Number(process.env.ML_JOB_BUDGET_MS) || 20000);
// A job past its budget gets this long to notice (a quarter of it, at most 5 s).
const GRACE_MS = Math.min(5000, BUDGET_MS / 4);

let busy = null; // the key of the module running now

const errorText = (err) => (err?.code === 'TIMEOUT' ? 'Ran past its time budget' : (err?.message || String(err)));

/**
 * Run one module's job now.
 * @param {String} key - a module key, or 'housekeeping'
 * @param {Object} [opts]
 * @param {'SCHEDULE'|'MANUAL'} [opts.trigger]
 * @param {Function} [opts.job] - the work (defaults to the module's run)
 * @returns {Promise<Object>} the finished run's summary
 */
const runModule = async (key, { trigger = 'SCHEDULE', job } = {}) => {
  const work = job || byKey.get(key)?.run;
  if (typeof work !== 'function') return { status: 'SKIPPED', reason: 'not available yet' };
  if (key !== 'housekeeping' && !(await settings.isOn(key))) return { status: 'SKIPPED', reason: 'switched off' };
  if (busy) return { status: 'SKIPPED', reason: `${busy} is running` };

  busy = key;
  const startedAt = new Date();
  let run = null;
  try {
    run = await store.startRun(key, trigger);
  } catch (err) {
    busy = null;
    console.error(`[ml:${key}] could not record the run:`, err.message);
    return { status: 'FAILED', reason: 'database unavailable' };
  }

  const controller = new AbortController();
  const deadline = Date.now() + BUDGET_MS;
  const ctx = {
    trigger,
    signal: controller.signal,
    timeLeft: () => Math.max(0, deadline - Date.now()),
    budgetMs: BUDGET_MS,
    activeVersion: () => store.getActiveVersion(key),
  };
  const heapBefore = process.memoryUsage().heapUsed;
  let timer;
  let outcome;
  const finished = Promise.resolve().then(() => work(ctx));
  try {
    const result = await Promise.race([
      finished,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
        }, BUDGET_MS + GRACE_MS);
      }),
    ]);
    outcome = {
      status: result?.skipped ? 'SKIPPED' : 'OK',
      modelVersion: result?.modelVersion ?? null,
      rowsRead: result?.rowsRead ?? null,
      rowsWritten: result?.rowsWritten ?? null,
      metrics: { ...(result?.metrics || {}), ...(result?.reason ? { reason: result.reason } : {}) },
    };
  } catch (err) {
    outcome = { status: err?.code === 'TIMEOUT' ? 'TIMED_OUT' : 'FAILED', error: errorText(err) };
    console.error(`[ml:${key}] ${outcome.status.toLowerCase()}:`, outcome.error);
  } finally {
    clearTimeout(timer);
  }
  outcome.metrics = {
    ...(outcome.metrics || {}),
    heapDeltaMb: Math.round(((process.memoryUsage().heapUsed - heapBefore) / 1048576) * 10) / 10,
  };
  try {
    await store.finishRun(run.id, startedAt, outcome);
  } catch (err) {
    console.error(`[ml:${key}] could not record the result:`, err.message);
  }
  // A timed-out job may still be finishing: the next one waits for it.
  finished.catch(() => {}).finally(() => { if (busy === key) busy = null; });
  if (outcome.status !== 'TIMED_OUT') busy = null;
  return { id: run.id, ...outcome, durationMs: Date.now() - startedAt.getTime() };
};

/** Daily tidy-up: counts written, stale results and old runs removed. */
const housekeeping = async () => {
  const { written } = await counters.flush();
  const purged = await store.purgeOld();
  return {
    rowsWritten: written,
    metrics: { purged },
  };
};

const isBusy = () => busy;

/**
 * Start the engine's timers (backend/server.js, after listen). Modules that
 * are not built yet have no job; a built module's job runs on its schedule
 * and does nothing while switched off.
 * @param {Object} runtimeStatus - lib/runtimeStatus
 */
const start = (runtimeStatus) => {
  counters.start();
  const every = (name, fn, ms, firstAfterMs) => {
    const tick = () => runtimeStatus.runJob(name, fn, ms);
    setTimeout(tick, firstAfterMs).unref();
    setInterval(tick, ms).unref();
  };
  every('ml-housekeeping', () => runModule('housekeeping', { job: housekeeping }), DAY, 7 * 60 * 1000);
  MODULES.forEach((m, i) => {
    if (!m.every || !isBuilt(m.key)) return;
    // Spread out after a restart, one every 90 s from the tenth minute.
    every(`ml-${m.key}`, () => runModule(m.key), m.every, (10 * 60 + i * 90) * 1000);
  });
};

module.exports = {
  runModule, housekeeping, start, isBusy, BUDGET_MS,
};
