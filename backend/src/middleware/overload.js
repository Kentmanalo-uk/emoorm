/**
 * Keeps a rush from turning into timeouts for everyone.
 *
 * With no limit, a rush starts every request at once. They all compete for
 * the CPU and the few database connections, all of them slow down together,
 * and past a point every page waits longer than the hosting proxy will, so
 * everyone gets a 504 at once, even for requests that would have been quick.
 *
 * So only so many run at a time; the rest wait their turn in a line, in
 * order. A request that has waited too long is answered "busy, try again in
 * a moment" (503 + Retry-After), which the web app retries by itself for
 * reads, well before the proxy would give up on it. The line also has a
 * length limit.
 *
 * Reads and writes have separate lanes. Placing an order, sending a message
 * or saving a product should not queue behind a thousand page loads, and a
 * burst of writes (each holding a database connection longer) should not
 * take every slot from the pages people are looking at. The write lane is
 * the narrower one.
 *
 * API_MAX_ACTIVE: reads running at once (about three times the database
 * pool; more only means more waiting on the pool). API_MAX_ACTIVE_WRITES:
 * writes running at once. API_MAX_WAIT_MS: the longest a request waits for
 * its turn. API_MAX_QUEUE: the longest a line gets.
 */
const int = (name, fallback) => Math.max(1, parseInt(process.env[name] || String(fallback), 10) || fallback);
const MAX_WAIT_MS = int('API_MAX_WAIT_MS', 15000);
const MAX_QUEUE = int('API_MAX_QUEUE', 3000);

let turnedAway = 0;

const busy = (res) => {
  turnedAway += 1;
  // 1-3 seconds, so the retries do not all come back together.
  res.set('Retry-After', String(1 + Math.floor(Math.random() * 3)));
  res.status(503).json({ success: false, message: 'The server is busy. Please try again in a moment.' });
};

const makeLane = (maxActive) => {
  const lane = { active: 0, line: [], maxActive };

  const admitNext = () => {
    while (lane.active < lane.maxActive && lane.line.length) {
      const waiting = lane.line.shift();
      clearTimeout(waiting.timer);
      // Gone already (the visitor left the page): skip it.
      if (waiting.res.writableEnded || waiting.res.destroyed) continue;
      start(waiting.req, waiting.res, waiting.next);
    }
  };

  const start = (req, res, next) => {
    lane.active += 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      lane.active -= 1;
      admitNext();
    };
    res.on('finish', finish);
    res.on('close', finish);
    next();
  };

  lane.enter = (req, res, next) => {
    if (lane.active < lane.maxActive && !lane.line.length) return start(req, res, next);
    if (lane.line.length >= MAX_QUEUE) return busy(res);

    const waiting = { req, res, next };
    const leave = () => {
      const at = lane.line.indexOf(waiting);
      if (at === -1) return false;
      lane.line.splice(at, 1);
      clearTimeout(waiting.timer);
      return true;
    };
    waiting.timer = setTimeout(() => {
      if (leave() && !res.destroyed) busy(res);
    }, MAX_WAIT_MS);
    // The visitor left while waiting: give up the place in line.
    res.once('close', leave);
    lane.line.push(waiting);
    return undefined;
  };

  return lane;
};

const reads = makeLane(int('API_MAX_ACTIVE', 24));
const writes = makeLane(int('API_MAX_ACTIVE_WRITES', 12));

const overloadGuard = (req, res, next) => {
  if (req.method === 'OPTIONS' || req.path.endsWith('/health')) return next();
  const lane = req.method === 'GET' || req.method === 'HEAD' ? reads : writes;
  return lane.enter(req, res, next);
};

/** For /health. */
const overloadStats = () => ({
  active: reads.active,
  waiting: reads.line.length,
  maxActive: reads.maxActive,
  writesActive: writes.active,
  writesWaiting: writes.line.length,
  maxActiveWrites: writes.maxActive,
  turnedAway,
});

module.exports = { overloadGuard, overloadStats };
