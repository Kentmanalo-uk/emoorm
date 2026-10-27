const counters = require('../lib/securityCounters');

/**
 * Counts failed tries per key (an email, an MFA token id), so a wrong
 * password or code can only be tried so often per account, no matter how
 * many addresses the tries come from. The IP limiters stay; this is the
 * per-account half.
 *
 * Kept in the database (lib/securityCounters), not in this process: a
 * restart or a second server no longer hands out a fresh set of tries.
 * A key is forgotten once its window passes.
 *
 * `name`: what is counted ("login", "mfa-code"…), so two guards on the same
 * key never share a count.
 */
const makeGuard = ({ name, windowMs = 15 * 60 * 1000, limit = 10 } = {}) => {
  if (!name) throw new Error('makeGuard needs a name');
  const counter = (key) => `${name}:${key}`;

  /** How many seconds the key is still locked, 0 if it is not. */
  const lockedFor = async (key) => {
    const row = await counters.peek(counter(key));
    if (!row || row.hits < limit) return 0;
    return Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000));
  };

  /** One more failure; resolves true when the key has just become locked. */
  const fail = async (key) => (await counters.hit(counter(key), windowMs)).hits === limit;

  const clear = async (key) => { await counters.clear(counter(key)); };

  return { lockedFor, fail, clear };
};

module.exports = { makeGuard };
