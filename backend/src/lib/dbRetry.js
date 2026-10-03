/**
 * Run a transaction again when MySQL picked it as the loser of a deadlock
 * (two writes locking the same rows in a different order); it then just runs
 * again, after a short random wait.
 */
const DEADLOCK_CODES = new Set(['P2034']);

const isDeadlock = (err) => DEADLOCK_CODES.has(err?.code)
  || /deadlock|1213|write conflict/i.test(String(err?.message || ''));

const withDeadlockRetry = async (run, tries = 3) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= tries || !isDeadlock(err)) throw err;
      await new Promise((r) => setTimeout(r, 40 * attempt + Math.floor(Math.random() * 40)));
    }
  }
};

module.exports = { isDeadlock, withDeadlockRetry };
