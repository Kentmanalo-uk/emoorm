import { isTodayProduct } from '../../../lib/availability';
import { isStockless, productKind } from '../../../lib/productKinds';

/*
 * A product's stock in the seller's words, shared by My products' rows and
 * its quick stock sheet.
 */

/** 'out', 'low' or 'ok'. */
export const stockLevel = (product) => {
  // Available Today: at 0 between posts on purpose, never "out of stock";
  // cooked-to-order food keeps no stock at all.
  if (isTodayProduct(product) || isStockless(product)) return 'ok';
  const stock = Number(product?.stock ?? 0);
  if (stock <= 0) return 'out';
  const threshold = Number(product?.lowStockThreshold ?? 0);
  return stock <= threshold ? 'low' : 'ok';
};

/** Stock kept per size or colour: changed in the product's form, not here. */
export const hasStockPerChoice = (product) => Array.isArray(product?.variations)
  && product.variations.some((v) => v?.stocks && Object.keys(v.stocks).length);

/** A price per size or colour: the one price can't be changed on its own. */
export const hasPricePerChoice = (product) => Array.isArray(product?.variations)
  && product.variations.some((v) => v?.prices && Object.keys(v.prices).length);

// What a product's stock counts, in the words of its kind: live animals by
// the head, packages by the package.
export const stockWords = (product) => {
  const kind = productKind(product);
  if (kind === 'LIVESTOCK') return { add: 'Add heads', now: 'Heads available now', unit: (n) => (n === 1 ? 'head' : 'heads') };
  if (kind === 'PACKAGE') return { add: 'Add packages', now: 'Packages available now', unit: (n) => (n === 1 ? 'package' : 'packages') };
  return { add: 'Add stock', now: 'In stock now', unit: (n) => (n === 1 ? 'item' : 'items') };
};

/** "3 heads", "1 item". */
export const countOf = (product, n) => `${n} ${stockWords(product).unit(n)}`;

// The three ways to change stock: add some, take some away (spoiled,
// sold elsewhere), or say how many there are now (after a count).
export const STOCK_MODES = [
  { key: 'add', label: 'Add' },
  { key: 'remove', label: 'Remove' },
  { key: 'set', label: 'Set to' },
];

/**
 * The change to send (POST /products/:id/stock takes a delta) for a mode and
 * an amount, or null when it is not a change: an empty or negative amount,
 * removing more than there is, or setting the count it already has.
 */
export const stockDelta = (mode, amount, current) => {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 0) return null;
  const now = Number(current) || 0;
  if (mode === 'set') return n === now ? null : n - now;
  if (n === 0) return null;
  if (mode === 'remove') return n > now ? null : -n;
  return n;
};

/** The button's words for a mode: "Add 5 items", "Remove 2 heads", "Set to 12". */
export const stockActionLabel = (product, mode, amount) => {
  const n = Number(amount);
  const ok = Number.isInteger(n) && n >= 0 && String(amount).trim() !== '';
  if (mode === 'set') return ok ? `Set to ${n}` : 'Set the count';
  if (mode === 'remove') return ok && n > 0 ? `Remove ${countOf(product, n)}` : 'Remove';
  return ok && n > 0 ? `Add ${countOf(product, n)}` : stockWords(product).add;
};
