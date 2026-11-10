/**
 * The rule every ML read path follows (ML_DOC.MD §14): if the engine fails,
 * the shop carries on exactly as it did without it. `guard` runs an ML step
 * with a deadline and hands back the fallback (and logs one line) on any
 * error or delay; a buyer never sees an ML stack trace.
 *
 *   const similar = await guard('similar', () => ml.similar(id), null, 800);
 *   if (!similar) ...the existing same-category list...
 *
 * It also keeps, in memory, how long each step took and how often it fell
 * back (ML_DOC.MD §9 resource monitoring): stats() for /admin/ml and /health.
 */
const { withTimeout } = require('../lib/withTimeout');

const DEFAULT_MS = 1000;
const SAMPLES = 200; // the latest timings kept per step

const timings = new Map(); // label -> { calls, fallbacks, timeouts, samples: [] }

const note = (label, ms, outcome) => {
  const t = timings.get(label) || {
    calls: 0, fallbacks: 0, timeouts: 0, samples: [],
  };
  t.calls += 1;
  if (outcome !== 'ok') t.fallbacks += 1;
  if (outcome === 'timeout') t.timeouts += 1;
  t.samples.push(ms);
  if (t.samples.length > SAMPLES) t.samples.shift();
  timings.set(label, t);
};

const guard = async (label, fn, fallback = null, ms = DEFAULT_MS) => {
  const started = Date.now();
  try {
    const value = await withTimeout(Promise.resolve().then(fn), ms, `ml:${label}`);
    note(label, Date.now() - started, 'ok');
    return value === undefined ? fallback : value;
  } catch (err) {
    note(label, Date.now() - started, err?.code === 'TIMEOUT' ? 'timeout' : 'error');
    console.error(`[ml:${label}] fell back:`, err?.code === 'TIMEOUT' ? 'too slow' : err?.message);
    return fallback;
  }
};

const percentile = (values, p) => {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))];
};

/** Each step's calls, fallbacks and timings (ms) since the server started. */
const stats = () => [...timings].map(([label, t]) => ({
  label,
  calls: t.calls,
  fallbacks: t.fallbacks,
  timeouts: t.timeouts,
  p50: percentile(t.samples, 50),
  p95: percentile(t.samples, 95),
  max: t.samples.length ? Math.max(...t.samples) : null,
})).sort((a, b) => b.calls - a.calls);

module.exports = { guard, stats };
