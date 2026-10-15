import { Platform } from 'react-native';

/*
 * Buy now (web/src/lib/buyNow.js): checkout with lines of its own, never
 * through the cart. The lines (cartStore standaloneLine) are kept here under
 * an id that goes to /checkout as the `buyNow` param; in the web build a copy
 * also sits in sessionStorage, so a refresh of checkout keeps them. The cart
 * is neither read nor changed: what the buyer saved there stays.
 */

const KEY = 'emoorm-buy-now';
let held = null; // { id, items }

const webStorage = () => {
  if (Platform.OS !== 'web') return null;
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
};

const newId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Keep this checkout's lines (a price refresh, a quantity capped to stock). */
export const saveBuyNow = (id, items) => {
  held = { id, items };
  try {
    webStorage()?.setItem(KEY, JSON.stringify(held));
  } catch {
    // Private browsing: the copy in memory is enough.
  }
};

/** Forget the lines (order placed, or checkout left). */
export const clearBuyNow = () => {
  held = null;
  try {
    webStorage()?.removeItem(KEY);
  } catch {
    // nothing kept
  }
};

/** The lines of the Buy now checkout `id` (the route's `buyNow` param), or null. */
export const buyNowLines = (id) => {
  const key = Array.isArray(id) ? id[0] : id;
  if (!key) return null;
  if (held?.id === key) return held.items;
  try {
    const raw = webStorage()?.getItem(KEY);
    const kept = raw ? JSON.parse(raw) : null;
    if (kept?.id === key && Array.isArray(kept.items)) {
      held = kept;
      return kept.items;
    }
  } catch {
    // unreadable: nothing kept
  }
  // Gone (e.g. the app was restarted on checkout): an empty checkout, which
  // goes back to the cart.
  return [];
};

/** Open checkout with just these lines (cartStore standaloneLine). */
export const startBuyNow = (router, items) => {
  const id = newId();
  saveBuyNow(id, items);
  router.push({ pathname: '/checkout', params: { buyNow: id } });
};
