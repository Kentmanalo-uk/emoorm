/**
 * Talking to MoorMove (moormove.emoorm.shop), the rider service that delivers
 * orders for shops. Server to server only, with one shared secret:
 *
 *   MOORMOVE_API_URL  e.g. https://moormove.emoorm.shop/api (locally http://localhost:4000/api)
 *   MOORMOVE_SECRET   the same value as MoorMove's PARTNER_SECRET, 32+ characters
 *
 * Without either, MoorMove is "not configured" and every MoorMove option is
 * simply unavailable. Both are read on each call (not at start-up), so a test
 * can point them at a fake MoorMove.
 */

const TIMEOUT_MS = 8000;
// A delivery photo is a phone picture; anything far bigger is not one.
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
// MoorMove's open/closed state and towns: asked again after 10 seconds. A
// failed ask is remembered as long, so a MoorMove that is down costs one wait
// per 10 seconds, not one per request. The last good answer is kept for an
// hour for callers that can live with an older one (ready-to-sell checks).
const STATUS_CACHE_MS = 10 * 1000;
const STATUS_FAIL_MS = 10 * 1000;
const STATUS_STALE_MS = 60 * 60 * 1000;
const STATUS_TIMEOUT_MS = 4000;
// A price is asked while the buyer waits at checkout.
const QUOTE_TIMEOUT_MS = 6000;

const settings = () => ({
  url: String(process.env.MOORMOVE_API_URL || '').trim().replace(/\/+$/, ''),
  secret: String(process.env.MOORMOVE_SECRET || '').trim(),
});

const isConfigured = () => {
  const { url, secret } = settings();
  return Boolean(url) && secret.length >= 32;
};

/** A failed call to MoorMove: `status` is MoorMove's HTTP status, 0 when it could not be reached. */
class MoorMoveError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'MoorMoveError';
    this.status = status;
  }
}

const call = async (method, path, body, { timeoutMs = TIMEOUT_MS } = {}) => {
  if (!isConfigured()) throw new MoorMoveError('MoorMove is not configured', 0);
  const { url, secret } = settings();
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new MoorMoveError(err.name === 'TimeoutError' ? 'MoorMove took too long to answer' : 'MoorMove could not be reached', 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || (json && json.success === false)) {
    throw new MoorMoveError(json?.message || `MoorMove answered ${res.status}`, res.status || 0);
  }
  return json && 'data' in json ? json.data : json;
};

let statusCache = {
  key: '', at: 0, value: null, failedAt: 0, error: null,
};
let statusAsking = null;

const askStatus = (key) => {
  if (statusAsking?.key === key) return statusAsking.promise;
  const promise = call('GET', '/partner/status', undefined, { timeoutMs: STATUS_TIMEOUT_MS })
    .then((value) => {
      statusCache = {
        key, at: Date.now(), value, failedAt: 0, error: null,
      };
      return value;
    }, (err) => {
      statusCache = {
        ...(statusCache.key === key ? statusCache : { value: null, at: 0 }), key, failedAt: Date.now(), error: err,
      };
      throw err;
    })
    .finally(() => { if (statusAsking?.promise === promise) statusAsking = null; });
  statusAsking = { key, promise };
  return promise;
};

/**
 * { open, towns: [{ id, name, serviceOpen }], maxDistanceKm, maxCod, promos }
 * fresh: always ask. stale: the last good answer (up to an hour old) at
 * once, asking again in the background when it is older than 10 seconds;
 * null when there is none and MoorMove failed just now.
 */
const status = async ({ fresh = false, stale = false } = {}) => {
  const key = settings().url;
  const mine = statusCache.key === key;
  const age = Date.now() - statusCache.at;
  if (!fresh && mine && statusCache.value && age < STATUS_CACHE_MS) return statusCache.value;
  if (stale && mine && statusCache.value && age < STATUS_STALE_MS) {
    askStatus(key).catch(() => {});
    return statusCache.value;
  }
  // MoorMove failed a moment ago: say so at once instead of waiting again.
  if (!fresh && mine && statusCache.error && Date.now() - statusCache.failedAt < STATUS_FAIL_MS) {
    if (stale) return null;
    throw statusCache.error;
  }
  if (stale) {
    try { return await askStatus(key); } catch { return null; }
  }
  return askStatus(key);
};

/** Forget the cached status (tests, the admin's connection check, the switches). */
const clearStatusCache = () => {
  statusCache = {
    key: '', at: 0, value: null, failedAt: 0, error: null,
  };
};

/**
 * { available, reason?, vehicleType, distanceKm, distanceSource, minutes, fee }. townId is the shop's
 * town; dropoffTownId (the buyer's town) and the barangays in pickup/dropoff
 * are optional: MoorMove checks a rider delivers to both ends with them.
 */
const quote = ({
  townId, dropoffTownId, packageSize, pickup, dropoff,
}) => call('POST', '/partner/quote', {
  townId, dropoffTownId: dropoffTownId || undefined, packageSize, pickup, dropoff,
}, { timeoutMs: QUOTE_TIMEOUT_MS });

/**
 * Book a rider: the job (MoorMove answers with the open one if there is one
 * already). MoorMove wraps it as { job }.
 */
const createJob = async (job) => {
  const data = await call('POST', '/partner/jobs', job);
  return data && data.job && typeof data.job === 'object' ? data.job : data;
};

const getJob = (jobId) => call('GET', `/partner/jobs/${encodeURIComponent(jobId)}`);

const cancelJob = (jobId, reason) => call('POST', `/partner/jobs/${encodeURIComponent(jobId)}/cancel`, { reason: reason || null });

const codReturned = (jobId) => call('POST', `/partner/jobs/${encodeURIComponent(jobId)}/cod-returned`, {});

/** A failed delivery's parcel is back with the shop: MoorMove closes the return trip. */
const parcelReturned = (jobId) => call('POST', `/partner/jobs/${encodeURIComponent(jobId)}/parcel-returned`, {});

/** A pickup or delivery photo, as a Buffer. */
const photo = async (uploadId) => {
  if (!isConfigured()) throw new MoorMoveError('MoorMove is not configured', 0);
  const { url, secret } = settings();
  let res;
  try {
    res = await fetch(`${url}/partner/uploads/${encodeURIComponent(uploadId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
  } catch {
    throw new MoorMoveError('The delivery photo could not be fetched', 0);
  }
  if (!res.ok) throw new MoorMoveError(`The delivery photo could not be fetched (${res.status})`, res.status);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_PHOTO_BYTES) throw new MoorMoveError('The delivery photo is too large', 413);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_PHOTO_BYTES) throw new MoorMoveError('The delivery photo is too large', 413);
  return buffer;
};

/** The shared secret, for checking the signature on MoorMove's updates. */
const secret = () => settings().secret;

/** MoorMove's own site (its API address without /api), for links. */
const siteUrl = () => settings().url.replace(/\/api$/, '') || null;

module.exports = {
  isConfigured,
  siteUrl,
  status,
  clearStatusCache,
  quote,
  createJob,
  getJob,
  cancelJob,
  codReturned,
  parcelReturned,
  photo,
  secret,
  MoorMoveError,
};
