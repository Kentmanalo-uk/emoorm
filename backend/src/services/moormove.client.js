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
const STATUS_CACHE_MS = 60 * 1000;

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

const call = async (method, path, body) => {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

// MoorMove's open/closed state and towns change rarely: asked once a minute.
let statusCache = { key: '', at: 0, value: null };

/** { open, towns: [{ id, name, serviceOpen }], maxDistanceKm, maxCod } */
const status = async ({ fresh = false } = {}) => {
  const key = settings().url;
  if (!fresh && statusCache.key === key && statusCache.value && Date.now() - statusCache.at < STATUS_CACHE_MS) {
    return statusCache.value;
  }
  const value = await call('GET', '/partner/status');
  statusCache = { key, at: Date.now(), value };
  return value;
};

/** Forget the cached status (tests, and the admin's connection check). */
const clearStatusCache = () => { statusCache = { key: '', at: 0, value: null }; };

/** { available, reason?, vehicleType, distanceKm, fee } */
const quote = ({ townId, packageSize, pickup, dropoff }) => call('POST', '/partner/quote', {
  townId, packageSize, pickup, dropoff,
});

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

module.exports = {
  isConfigured,
  status,
  clearStatusCache,
  quote,
  createJob,
  getJob,
  cancelJob,
  codReturned,
  photo,
  secret,
  MoorMoveError,
};
