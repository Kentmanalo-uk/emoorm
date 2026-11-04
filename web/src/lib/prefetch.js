import axios from './axios';
import { writeCache } from './pageCache';

/*
 * A product's page data, fetched the moment a shopper touches its link (or
 * rests the pointer on it on a computer), so the page has it, or has it on
 * the way, by the time it opens: the 100-300 ms between finger down and the
 * tap landing, more on a hover. One listener on the document covers every
 * link to a product (cards, rows, chats, notifications), so no list needs
 * wiring of its own.
 *
 * The page takes over the same request (takePrefetched) rather than asking
 * again, so a touched product costs the server nothing extra: a link only
 * looked at is never fetched (hovers wait a moment, and touches are
 * deliberate). Nothing is fetched on a data saver or a 2G connection.
 */

const TTL_MS = 30 * 1000; // a fetch is the page's answer for this long
const HOVER_MS = 120; // a pointer passing over a card is not a hover
const MAX_KEPT = 20;
const pending = new Map(); // slug -> { at, request }

const PRODUCT_PATH = /^\/product\/([^/?#]+)\/?$/;

const slowConnection = () => {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  return Boolean(c?.saveData || /2g/.test(c?.effectiveType || ''));
};

/** Starts fetching one product's page data (once per TTL_MS). */
export const prefetchProduct = (slug) => {
  if (!slug || slowConnection()) return;
  const known = pending.get(slug);
  if (known && Date.now() - known.at < TTL_MS) return;
  const request = axios.get(`/products/slug/${slug}`, { quiet: true }).then((res) => {
    // Shown at once if the page opens after the answer arrived.
    writeCache(`product:${slug}`, res.data);
    return res;
  });
  request.catch(() => {});
  pending.set(slug, { at: Date.now(), request });
  if (pending.size > MAX_KEPT) pending.delete(pending.keys().next().value);
};

/**
 * The product page's request, if one was started for it in the last
 * TTL_MS (then forgotten: a later visit asks afresh), else null.
 * @returns {Promise|null}
 */
export const takePrefetched = (slug) => {
  const known = pending.get(slug);
  pending.delete(slug);
  if (!known || Date.now() - known.at >= TTL_MS) return null;
  return known.request;
};

const slugOf = (target) => {
  const link = target?.closest?.('a[href]');
  if (!link || link.target === '_blank' || link.origin !== window.location.origin) return null;
  const m = PRODUCT_PATH.exec(link.pathname);
  return m ? decodeURIComponent(m[1]) : null;
};

/** Listens for touches and hovers on product links; call once at start. */
export const watchProductLinks = () => {
  if (typeof document === 'undefined') return;
  let hoverTimer = null;
  document.addEventListener('pointerdown', (e) => {
    const slug = slugOf(e.target);
    if (slug) prefetchProduct(slug);
  }, { capture: true, passive: true });
  document.addEventListener('mouseover', (e) => {
    const slug = slugOf(e.target);
    window.clearTimeout(hoverTimer);
    if (slug) hoverTimer = window.setTimeout(() => prefetchProduct(slug), HOVER_MS);
  }, { passive: true });
  document.addEventListener('mouseout', () => window.clearTimeout(hoverTimer), { passive: true });
};
