/**
 * How cart and order lines read for each product kind (lib/productKinds): an
 * animal is counted in heads, a package says what it holds, a paluto how
 * many it serves, and a paluto order's ready time is a time of day.
 *
 * A cart line carries its product's productType, listingKind and details. An
 * order line has them on line.product, and a package's items as sold in
 * line.packageContents.
 */

import {
  productKind, isStockless, minOrder, packageItemsLabel, servesLabel,
} from './productKinds';
import { onDayStart, rangeLabel } from './eta';
import { clockLabel, dayName, spanLabel } from './availability';

// A cart line is its own product; an order line points at one.
const sourceOf = (line) => (line?.productType || line?.listingKind ? line : (line?.product || line || {}));

/** The kind of a cart line or an order line. */
export const lineKind = (line) => {
  if (Array.isArray(line?.packageContents) && line.packageContents.length) return 'PACKAGE';
  if (line?.availabilityId) return 'READY_TO_EAT';
  return productKind(sourceOf(line));
};

/** A paluto line: cooked when ordered, so never out of stock. */
export const lineStockless = (line) => isStockless(sourceOf(line));

/** The fewest of this line a buyer may order (a paluto's minimum order, else 1). */
export const lineMinimum = (line) => minOrder(sourceOf(line));

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
 * The small text under a line: what a package holds ("Includes: 2 x Pancit,
 * 1 x Roasted Chicken"), or how many a cooked dish serves ("Good for 3-4
 * people") when no size was chosen. With `choice` (pages that do not list the
 * chosen options), a sized dish shows its size instead ("Good for 3-4").
 */
export const lineNote = (line, { choice = false } = {}) => {
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

/** "Only 3 heads left", "Only 4 left": a line running out (none for paluto). */
export const fewLeftLabel = (line, words = 'left') => {
  const stock = Number(line?.stock);
  if (lineStockless(line) || !Number.isFinite(stock) || stock <= 0 || stock >= 10) return '';
  if (lineKind(line) === 'LIVESTOCK') return `Only ${stock} ${stock === 1 ? 'head' : 'heads'} left`;
  return `Only ${stock} ${words}`;
};

/** Whether an order or a list of lines has a paluto. */
export const hasPaluto = (lines) => (Array.isArray(lines) ? lines : []).some((it) => lineKind(it) === 'COOK_TO_ORDER');

/**
 * "Today, 3:45 – 4:00 PM" for a time of day, or "Tomorrow – Oct 8" for days.
 * Available Today and paluto orders are ready at a time; the server's day
 * estimates fall on midnight, so a paluto mixed with goods reads in days.
 */
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

/** "3:00 PM" from an "HH:MM" order-by time. */
export const orderByLabel = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
