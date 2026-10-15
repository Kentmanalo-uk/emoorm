/*
 * How order lines read for each product kind (web/src/lib/orderLines.js and
 * the parts of web/src/lib/productKinds.js and eta.js it uses): an animal is
 * counted in heads, a package says what it holds, a paluto how many it
 * serves, a livestock deal says its price was agreed in chat, and a paluto
 * order's ready time is a time of day.
 *
 * An order line has its product's productType, listingKind and details on
 * line.product, and a package's items as sold in line.packageContents.
 */

import { clockLabel, dayName, spanLabel } from '../../lib/availability';
import { rangeLabel } from './orderProgress';
import { pricedVariation, priceRange } from '../../lib/variantPricing';

const KIND_KEYS = new Set(['REGULAR', 'LIVESTOCK', 'COOK_TO_ORDER', 'PACKAGE', 'READY_TO_EAT']);
const detailsOf = (value) => (value && typeof value === 'object'
  ? (value.details && typeof value.details === 'object' ? value.details : value)
  : {});

/** A product's kind; Available Today products are ready-to-eat food. REGULAR when unknown. */
export const productKind = (product) => {
  if (product?.listingKind === 'TODAY') return 'READY_TO_EAT';
  return KIND_KEYS.has(product?.productType) ? product.productType : 'REGULAR';
};

/** Live animals are bought by making an offer on their page, never straight into the cart. */
export const isLivestock = (product) => productKind(product) === 'LIVESTOCK';

/** Cooked to order: never out of stock (stock is always 0). */
export const isStockless = (product) => productKind(product) === 'COOK_TO_ORDER';

/** The fewest a buyer may order at once: a paluto's minimum order, else 1. */
export const minOrder = (product) => {
  if (productKind(product) !== 'COOK_TO_ORDER') return 1;
  const n = Number(product?.details?.minOrder);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

/** "2 x Pancit, 1 x Roasted Chicken". */
const packageItemsLabel = (items) => (Array.isArray(items) ? items : [])
  .map((it) => `${it.quantity} x ${it.product?.name || it.name || ''}`.trim())
  .join(', ');

/** "Good for 3-4 people" (as the seller wrote it), or "". */
const servesLabel = (value) => detailsOf(value).serves || '';

// A cart line is its own product; an order line points at one.
const sourceOf = (line) => (line?.productType || line?.listingKind ? line : (line?.product || line || {}));

/** The kind of an order line. */
export const lineKind = (line) => {
  if (Array.isArray(line?.packageContents) && line.packageContents.length) return 'PACKAGE';
  if (line?.availabilityId) return 'READY_TO_EAT';
  return productKind(sourceOf(line));
};

/** "2 heads", "1 package"; other kinds: the number alone. */
export const countLabel = (line, n = line?.quantity) => {
  const kind = lineKind(line);
  const one = Number(n) === 1;
  if (kind === 'LIVESTOCK') return `${n} ${one ? 'head' : 'heads'}`;
  if (kind === 'PACKAGE') return `${n} ${one ? 'package' : 'packages'}`;
  return String(n);
};

/** What the price is for, after the amount: " / head", " / package" or "". */
export const lineUnit = (line) => {
  const kind = lineKind(line);
  if (kind === 'LIVESTOCK') return ' / head';
  if (kind === 'PACKAGE') return ' / package';
  return '';
};

/**
 * The small text under a line: a livestock deal's "Agreed with the seller",
 * what a package holds, or how many a cooked dish serves. With `choice`, a
 * sized dish shows its size instead ("Good for 3-4").
 */
export const lineNote = (line, { choice = false } = {}) => {
  // Livestock: the price agreed with the seller in chat and paid in person.
  if (line?.offerId) return 'Agreed with the seller';
  const kind = lineKind(line);
  if (kind === 'PACKAGE') {
    const list = packageItemsLabel(line.packageContents || line.packageItems || line.product?.packageItems);
    return list ? `Includes: ${list}` : '';
  }
  if (kind === 'COOK_TO_ORDER' || kind === 'READY_TO_EAT') {
    const sized = line.selectedVariations && Object.keys(line.selectedVariations).length > 0;
    if (sized) return choice ? Object.values(line.selectedVariations).join(', ') : '';
    return servesLabel(sourceOf(line).details);
  }
  return '';
};

/** Whether a list of lines has a paluto. */
export const hasPaluto = (lines) => (Array.isArray(lines) ? lines : []).some((it) => lineKind(it) === 'COOK_TO_ORDER');

const DAY = 86400e3;
const MANILA = 8 * 3600e3;
/** Whether a time is midnight in Manila: the server's day estimates are. */
const onDayStart = (d) => (new Date(d).getTime() + MANILA) % DAY === 0;

/** "Today, 3:45 – 4:00 PM" for a time of day, or "Tomorrow – Oct 8" for days. */
export const whenLabel = (from, to, timed) => {
  const end = to || from;
  if (!timed) return rangeLabel({ from: new Date(from), to: new Date(end) });
  if (new Date(from).getTime() === new Date(end).getTime()) return `${dayName(from)}, ${clockLabel(from)}`;
  return spanLabel(from, end);
};

/** When an order is expected (its etaFrom and etaTo), in words; '' when it has none. */
export const etaLabel = (order) => {
  if (!order?.etaFrom) return '';
  const to = order.etaTo || order.etaFrom;
  const timed = Boolean(order.respondBy)
    || (hasPaluto(order.items) && !onDayStart(order.etaFrom) && !onDayStart(to));
  return whenLabel(order.etaFrom, to, timed);
};

/** What a product card's price is for, after the amount: " / head", " / package", or "". */
export const priceUnit = (product) => {
  const kind = productKind(product);
  if (kind === 'LIVESTOCK') return ' / head';
  if (kind === 'PACKAGE') return ' / package';
  return '';
};

/** A paluto priced by size: its price is where the sizes start ("from ₱350"). */
export const startsFrom = (product) => {
  if (productKind(product) !== 'COOK_TO_ORDER' || !pricedVariation(product?.variations)) return false;
  const { min, max } = priceRange(product);
  return min !== max;
};
