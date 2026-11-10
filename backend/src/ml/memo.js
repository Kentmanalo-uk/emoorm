/**
 * A small in-process cache with a time limit, for the ML engine's read paths
 * (results change once a run, at most every few hours). Bounded: the oldest
 * entry goes when it is full. Personal data is never put in it.
 */
const memo = ({ ttlMs = 60 * 1000, max = 500 } = {}) => {
  const map = new Map();
  return {
    async get(key, load) {
      const hit = map.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const value = await load();
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(key, { at: Date.now(), value });
      return value;
    },
    clear() { map.clear(); },
  };
};

module.exports = { memo };
