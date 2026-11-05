import apiClient from '../api/client';

/*
 * A product fetched from the moment a finger touches its card (as the
 * website's lib/prefetch.js does on touch): by the time the tap ends and the
 * page opens, the answer is usually already on its way, and the page takes
 * over that request instead of asking again.
 */
const KEEP_MS = 10000;
const inflight = new Map();

export function prefetchProduct(slug) {
  if (!slug) return;
  const hit = inflight.get(slug);
  if (hit && Date.now() - hit.at < KEEP_MS) return;
  const promise = apiClient.get(`/products/slug/${slug}`);
  promise.catch(() => {});
  inflight.set(slug, { at: Date.now(), promise });
  setTimeout(() => {
    if (inflight.get(slug)?.promise === promise) inflight.delete(slug);
  }, KEEP_MS);
}

/** The request a touch started for this product, once; null if there is none. */
export function takePrefetchedProduct(slug) {
  const hit = inflight.get(slug);
  if (!hit || Date.now() - hit.at >= KEEP_MS) return null;
  inflight.delete(slug);
  return hit.promise;
}
