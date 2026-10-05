/**
 * Buying a product of each kind (lib/productKinds): how many a buyer may
 * pick, the words for the count, and how it reaches them. Used by the product
 * page and its phone sheet.
 */

import {
  productKind, isStockless, minOrder, priceUnit,
} from '../../../lib/productKinds';
import { pricedVariation, priceRange, stockForSelection } from '../../../lib/variantPricing';

/** The most one order line may hold (the server's limit): paluto has no stock to cap it. */
export const MAX_QTY = 9999;

/** How many a buyer may pick for these choices: { least, most }. */
export const quantityBounds = (product, selected) => ({
  least: minOrder(product),
  most: isStockless(product) ? MAX_QTY : stockForSelection(product, selected),
});

/** "1 head", "3 heads", "2 packages", "1 item". */
export const countLabel = (product, n) => {
  const kind = productKind(product);
  const [one, many] = kind === 'LIVESTOCK' ? ['head', 'heads'] : kind === 'PACKAGE' ? ['package', 'packages'] : ['item', 'items'];
  return `${n} ${n === 1 ? one : many}`;
};

/** When none are left: animals and packages are sold out, other goods out of stock. */
export const soldOutLabel = (product) => (['LIVESTOCK', 'PACKAGE'].includes(productKind(product)) ? 'Sold out' : 'Out of stock');

/** A paluto priced by size: its price is where the sizes start ("from ₱350"). */
export const startsFrom = (product) => {
  if (productKind(product) !== 'COOK_TO_ORDER' || !pricedVariation(product?.variations)) return false;
  const { min, max } = priceRange(product);
  return min !== max;
};

/** After the price on the product page: " / head", " / package", or "". */
export const pageUnit = (product) => priceUnit(product);

/**
 * How buyers get it: 'PICKUP', 'DELIVERY' or 'BOTH'. The product's own way
 * when it has one, else the shop's (the server keeps the two compatible).
 */
export const receiveMode = (product) => (['PICKUP', 'DELIVERY'].includes(product?.fulfillment)
  ? product.fulfillment
  : product?.store?.fulfillmentMode || 'DELIVERY');

/** "1 day", "2 days", "6 hours", "36 hours". */
export const aheadLabel = (hours) => {
  const h = Math.max(0, Math.round(Number(hours) || 0));
  if (h >= 24 && h % 24 === 0) return `${h / 24} ${h === 24 ? 'day' : 'days'}`;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};

/** "3:00 PM" from "15:00" (a paluto's order-by time, Manila). */
export const clockLabel = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return '';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** What the seller wrote for "Good for", without the words "Good for": "3-4 people". */
export const servesText = (serves) => {
  const text = String(serves || '').trim();
  return text.replace(/^good\s+for\s*:?\s*/i, '') || text;
};
