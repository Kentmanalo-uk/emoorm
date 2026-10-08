/**
 * One at a time per key, in this process.
 *
 * A daily quota that is read, then acted on, then written ("two announcements
 * a day", "one open deal per listing") can be passed by several requests
 * sent at the same instant: each reads the old count. Running them one
 * after another for the same key (a shop, a buyer) closes that gap with no
 * database lock and no new table.
 *
 * Keys are forgotten as soon as their last caller finishes, so the map holds
 * only what is running right now.
 */
const chains = new Map();

const withKeyedLock = async (key, fn) => {
  const previous = chains.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((resolve) => { release = resolve; });
  const turn = previous.then(() => mine);
  chains.set(key, turn);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (chains.get(key) === turn) chains.delete(key);
  }
};

module.exports = { withKeyedLock };
