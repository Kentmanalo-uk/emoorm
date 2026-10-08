/**
 * Counts failed tries per key (an email, an MFA token id) in this process,
 * so a wrong password or code can only be tried so often per account, no
 * matter how many addresses the tries come from. The IP limiters stay; this
 * is the per-account half.
 *
 * Bounded: the oldest keys are dropped past `max`, and a key is forgotten
 * once its window passes.
 */
const makeGuard = ({ max = 10000, windowMs = 15 * 60 * 1000, limit = 10 } = {}) => {
  const tries = new Map(); // key -> { count, until }

  const sweep = (now) => {
    if (tries.size < max) return;
    for (const [key, entry] of tries) {
      if (entry.until <= now) tries.delete(key);
      if (tries.size < max * 0.9) break;
    }
    while (tries.size >= max) tries.delete(tries.keys().next().value);
  };

  /** How many seconds the key is still locked, 0 if it is not. */
  const lockedFor = (key) => {
    const entry = tries.get(key);
    if (!entry) return 0;
    if (entry.until <= Date.now()) { tries.delete(key); return 0; }
    return entry.count >= limit ? Math.ceil((entry.until - Date.now()) / 1000) : 0;
  };

  /** One more failure; returns true when the key has just become locked. */
  const fail = (key) => {
    const now = Date.now();
    sweep(now);
    const entry = tries.get(key);
    if (!entry || entry.until <= now) {
      tries.set(key, { count: 1, until: now + windowMs });
      return limit <= 1;
    }
    entry.count += 1;
    return entry.count === limit;
  };

  const clear = (key) => { tries.delete(key); };

  return { lockedFor, fail, clear, size: () => tries.size };
};

module.exports = { makeGuard };
