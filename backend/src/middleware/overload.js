/**
 * Keeps a rush from turning into timeouts for everyone.
 *
 * With no limit, a rush starts every request at once. They all compete for
 * the CPU and the few database connections, all of them slow down together,
 * and past a point every page waits longer than the hosting proxy will, so
 * everyone gets a 504 at once, even for requests that would have been quick.
 *
 * So only so many reads run at a time; the rest wait their turn in a line, in
 * order. A read that has waited too long is answered "busy, try again in a
 * moment" (503 + Retry-After), which the web app retries by itself, well
 * before the proxy would give up on it. The line also has a length limit.
 *
 * Only reads wait: placing an order, sending a message or saving a product
 * goes straight through, since the person is waiting on that one action.
 *
 * API_MAX_ACTIVE: reads running at once. API_MAX_WAIT_MS: the longest a read
 * waits for its turn. API_MAX_QUEUE: the longest the line gets.
 */
const int = (name, fallback) => Math.max(1, parseInt(process.env[name] || String(fallback), 10) || fallback);
const MAX_ACTIVE = int('API_MAX_ACTIVE', 48);
const MAX_WAIT_MS = int('API_MAX_WAIT_MS', 15000);
const MAX_QUEUE = int('API_MAX_QUEUE', 3000);

let active = 0;
let turnedAway = 0;
const line = [];

const busy = (res) => {
  turnedAway += 1;
  // 1-3 seconds, so the retries do not all come back together.
  res.set('Retry-After', String(1 + Math.floor(Math.random() * 3)));
  res.status(503).json({ success: false, message: 'The server is busy. Please try again in a moment.' });
};

const start = (req, res, next) => {
  active += 1;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    active -= 1;
    // eslint-disable-next-line no-use-before-define
    admitNext();
  };
  res.on('finish', finish);
  res.on('close', finish);
  next();
};

const admitNext = () => {
  while (active < MAX_ACTIVE && line.length) {
    const waiting = line.shift();
    clearTimeout(waiting.timer);
    // Gone already (the visitor left the page): skip it.
    if (waiting.res.writableEnded || waiting.res.destroyed) continue;
    start(waiting.req, waiting.res, waiting.next);
  }
};

const overloadGuard = (req, res, next) => {
  if (req.method !== 'GET' || req.path.endsWith('/health')) return next();
  if (active < MAX_ACTIVE && !line.length) return start(req, res, next);
  if (line.length >= MAX_QUEUE) return busy(res);

  const waiting = { req, res, next };
  const leave = () => {
    const at = line.indexOf(waiting);
    if (at === -1) return false;
    line.splice(at, 1);
    clearTimeout(waiting.timer);
    return true;
  };
  waiting.timer = setTimeout(() => {
    if (leave() && !res.destroyed) busy(res);
  }, MAX_WAIT_MS);
  // The visitor left while waiting: give up the place in line.
  res.once('close', leave);
  line.push(waiting);
  return undefined;
};

/** For /health. */
const overloadStats = () => ({ active, waiting: line.length, maxActive: MAX_ACTIVE, turnedAway });

module.exports = { overloadGuard, overloadStats };
