// Buy now: checkout with lines of its own, never through the cart. The lines
// (cartStore standaloneLine) go to /checkout in the navigation state, and a
// copy is kept in sessionStorage under the same id, so a refresh of checkout
// keeps any change made there (a price refresh, a quantity capped to stock).
// The cart is neither read nor changed: what the buyer saved there stays.

const KEY = 'emoorm-buy-now';

const newId = () => window.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const read = () => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Keep this checkout's lines for a refresh. */
export const saveBuyNow = (id, items) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id, items }));
  } catch {
    // Private browsing: the navigation state still carries the lines.
  }
};

/** Forget the lines (order placed, or checkout left). */
export const clearBuyNow = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
};

/**
 * The lines of a Buy now checkout from its navigation state (`state.buyNow`),
 * the saved copy winning when it is the same checkout. null: a cart checkout.
 */
export const buyNowLines = (state) => {
  const buyNow = state?.buyNow;
  if (!buyNow || !Array.isArray(buyNow.items)) return null;
  const kept = read();
  if (kept && kept.id === buyNow.id && Array.isArray(kept.items)) return kept.items;
  return buyNow.items;
};

/** Open checkout with just these lines (cartStore standaloneLine). */
export const startBuyNow = (navigate, items) => {
  const id = newId();
  saveBuyNow(id, items);
  navigate('/checkout', { state: { buyNow: { id, items } } });
};
