/**
 * sharp, loaded on first use and kept small.
 *
 * By default libvips runs one thread per CPU core and keeps a large operation
 * cache. On the shared host the account has a cap on processes and threads
 * (a burst of them made `prisma migrate deploy` fail with EAGAIN), and one
 * upload at a time is plenty, so libvips gets SHARP_CONCURRENCY threads (1)
 * and a small cache. Loading it lazily also keeps it out of server start-up.
 *
 * Use it exactly like sharp: `sharp(buffer).resize(...)`, `sharp.cache(...)`.
 */
let lib = null;

const load = () => {
  if (!lib) {
    // eslint-disable-next-line global-require
    lib = require('sharp');
    lib.concurrency(Math.max(1, parseInt(process.env.SHARP_CONCURRENCY || '1', 10) || 1));
    lib.cache({ memory: 32, files: 0, items: 50 });
  }
  return lib;
};

module.exports = new Proxy(function sharpProxy() {}, {
  apply: (_target, _this, args) => load()(...args),
  get: (_target, prop) => load()[prop],
});
