/**
 * The rule every ML read path follows (ML_DOC.MD §14): if the engine fails,
 * the shop carries on exactly as it did without it. `guard` runs an ML step
 * with a deadline and hands back the fallback (and logs one line) on any
 * error or delay; a buyer never sees an ML stack trace.
 *
 *   const similar = await guard('similar', () => ml.similar(id), null, 800);
 *   if (!similar) ...the existing same-category list...
 */
const { withTimeout } = require('../lib/withTimeout');

const DEFAULT_MS = 1000;

const guard = async (label, fn, fallback = null, ms = DEFAULT_MS) => {
  try {
    const value = await withTimeout(Promise.resolve().then(fn), ms, `ml:${label}`);
    return value === undefined ? fallback : value;
  } catch (err) {
    console.error(`[ml:${label}] fell back:`, err?.code === 'TIMEOUT' ? 'too slow' : err?.message);
    return fallback;
  }
};

module.exports = { guard };
