/**
 * The seller's side of an order, in plain words: the stage tabs, the one next
 * step per status, the badges and the "what to do now" panel. Ported from
 * web/src/pages/SellerOrders.jsx (its constants and helpers), the seller half
 * of web/src/lib/orderProgress.js (SELLER_TABS … sellerNext) and the parts of
 * web/src/lib/orderLines.js the orders page uses (lineKind, countLabel,
 * lineNote, hasPaluto, etaLabel).
 *
 * Dates are written out by hand (as the app's orderProgress.js does), so a
 * phone's JS engine prints what the website's browser prints.
 */
import {
  cancelSummary, fallbackLine, payLabel, peso, rangeLabel, statusLabel, timeLeft,
} from '../../orders/orderProgress';
import { clockLabel, dayName, spanLabel } from '../../../lib/availability';
import { packageItemsLabel, productKind, servesLabel } from '../productKinds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400e3;
const MANILA = 8 * 3600e3;

/** "Oct 9, 2026" (toLocaleDateString en-PH, short month). */
export const shortDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/** "Oct 9, 4:12 PM" (orderProgress shortWhen: en-PH month, day, hour, minute). */
const shortWhen = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const h = d.getHours() % 12 || 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** "Oct 9, 2026, 4:12 PM" (dateStyle medium + timeStyle short, en-PH). */
export const mediumStamp = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const h = d.getHours() % 12 || 12;
  return `${shortDate(d)}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** "1,234.5" for a weight in kg (toLocaleString en-PH, up to 2 decimals). */
export const kgLabel = (grams) => {
  const kg = Math.round((Number(grams) / 1000) * 100) / 100;
  const [whole, frac] = String(kg).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
};

/* ── Order lines (web/src/lib/orderLines.js) ─────────────────────────── */

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

/** What a package holds, or how many a cooked dish serves (the line's small text). */
export const lineNote = (line, { choice = false } = {}) => {
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

/** Whether an order's lines include a paluto. */
export const hasPaluto = (lines) => (Array.isArray(lines) ? lines : []).some((it) => lineKind(it) === 'COOK_TO_ORDER');

// Whether a time is midnight in Manila: the server's day estimates are (web lib/eta.js).
const onDayStart = (d) => (new Date(d).getTime() + MANILA) % DAY === 0;

const whenLabel = (from, to, timed) => {
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

/* ── Stage tabs (web/src/lib/orderProgress.js, the seller's side) ────── */

/** One tab per step, in order. `status` is what the list asks the server for. */
export const SELLER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'New' },
  // Confirmed: being packed (older orders marked "Preparing" are here too).
  { key: 'CONFIRMED', label: 'Confirmed', status: 'CONFIRMED,PREPARING', counts: ['CONFIRMED', 'PREPARING'] },
  { key: 'TO_SHIP', label: 'To ship' },
  { key: 'SHIPPED', label: 'Shipped' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { key: 'DELIVERED', label: 'Delivered', status: 'DELIVERED,PICKED_UP', counts: ['DELIVERED', 'PICKED_UP'] },
  { key: 'COMPLETED', label: 'Completed', final: true },
  { key: 'CANCELLED', label: 'Cancelled', final: true },
];

// Other ways a link may name a tab (older links, Seller Home).
const SELLER_ALIASES = {
  new: 'PENDING', unpaid: 'CONFIRMED', preparing: 'CONFIRMED', to_ship: 'TO_SHIP', shipping: 'SHIPPED', picked_up: 'DELIVERED', ready: 'READY_FOR_PICKUP',
};
export const sellerTabFrom = (value) => {
  const v = String(value || '');
  const hit = SELLER_TABS.find((tab) => tab.key === v.toUpperCase() || tab.key === v);
  if (hit) return hit.key;
  return SELLER_ALIASES[v.toLowerCase()] || 'all';
};

/** The tab an order with this status is listed under. */
export const sellerTabOf = (status) => SELLER_TABS.find((tab) => tab.key !== 'all'
  && (tab.status || tab.key).split(',').includes(status))?.key || 'all';

/** How many orders a tab holds, from the server's per-status counts. */
export const sellerTabCount = (tab, byStatus = {}) => (tab.counts || [tab.key]).reduce((n, st) => n + (byStatus[st] || 0), 0);

/** The count on a chip: open steps only (not All, Completed, Cancelled). */
export const tabCount = (tab, byStatus) => (tab.key === 'all' || tab.final ? 0 : sellerTabCount(tab, byStatus));

const isPickup = (o) => o.fulfillmentMethod === 'PICKUP';
const isQr = (o) => o.paymentMethod && o.paymentMethod !== 'COD';

/* ── MoorMove riders (web/src/lib/moormove.js) ───────────────────────── */

// The buyer chose a MoorMove rider (and the shop has not taken it over).
export const isRiderOrder = (o) => o?.deliveryPartner === 'MOORMOVE' && o?.fulfillmentMethod !== 'PICKUP';
const RIDER_FINAL = ['DELIVERED', 'CANCELLED', 'FAILED'];
/**
 * A rider delivery still under way (a rider is being found, or has the job,
 * or is bringing a parcel that couldn't be delivered back to the shop).
 */
export const riderOpen = (rd) => Boolean(rd) && !RIDER_FINAL.includes(rd.status);
/** The delivery failed after pickup and the rider is bringing the parcel back. */
export const riderReturning = (rd) => rd?.status === 'RETURNING';

/** The seller's line for an order they took over from a MoorMove rider, or ''. */
export const sellerFallbackLine = (o) => fallbackLine(o, 'seller');

/* ── A failed rider trip: who pays its delivery fee ──────────────────── */

/** "Buyer's fault" / "Not the buyer's fault" for a failed trip. */
export const faultLabel = (ft) => (ft?.buyerFault ? "Buyer's fault" : "Not the buyer's fault");

/** What the seller should know before tapping Parcel back, by who pays the trip's fee; '' when unknown. */
export const parcelBackNote = (o) => {
  const ft = o?.failedTrip;
  switch (ft?.outcome) {
    case 'BUYER_OWES':
      return `Pay the rider ${peso(ft.shopPaysRider || ft.fee)}. The buyer pays it back on their next order.`;
    case 'FEE_KEPT':
      return `The rider keeps the ${peso(ft.fee)} fee you paid. The buyer covers it: if you cancel, refund ${peso(o.refundDue)}.`;
    case 'MOORMOVE_PAYS':
      return 'MoorMove pays the rider for this trip.';
    case 'NO_CHARGE':
      return Number(ft.riderGivesBack) > 0 ? `Get back the ${peso(ft.riderGivesBack)} fee you paid the rider.` : 'No one pays for this trip.';
    default:
      return '';
  }
};

/**
 * What a re-delivery (Call a rider again / Deliver it myself) costs the
 * buyer after a failed trip; '' when nothing changes.
 */
export const redeliveryNote = (o, { self = false } = {}) => {
  const ft = o?.failedTrip;
  if (ft?.outcome === 'FEE_KEPT') {
    return self ? "The buyer's fee paid for the failed trip, so they pay nothing more."
      : "The buyer's fee paid for the failed trip, so they pay nothing more. You pay the new rider.";
  }
  const fee = o?.unpaidFee;
  if (ft?.outcome === 'BUYER_OWES' && fee?.status === 'OPEN' && !fee.paidOrderId) {
    return `The ${peso(fee.amount)} unpaid fee is added to this order: the buyer pays ${peso(Number(o.total) + Number(fee.amount))}.`;
  }
  return '';
};

/** The money a cancel of a paid-online order sends back: "Refund ₱X: the ₱Y delivery fee covers the failed trip."; '' for COD. */
export const refundNote = (o) => {
  if (!o || o.paymentMethod === 'COD' || !['PAID', 'PENDING_VERIFICATION'].includes(o.paymentStatus)) return '';
  const due = o.refundDue != null ? Number(o.refundDue) : Number(o.total);
  const kept = Number(o.failedTripKept) || 0;
  return `Refund ${peso(due)}${kept > 0 ? `: the ${peso(kept)} delivery fee covers the failed trip` : ''}.`;
};

/** An unpaid failed-trip fee the shop may still waive (the server refuses once it is paid or on its way). */
export const canWaiveFee = (o) => o?.unpaidFee?.status === 'OPEN';

/** "Rider fee ₱60.00 goes to MoorMove" for an order a MoorMove rider delivers, or ''. */
export const riderFeeNote = (o) => (Number(o?.riderFee) > 0 ? `Rider fee ${peso(o.riderFee)} goes to MoorMove` : '');

/**
 * What the seller does next with an order, in their words.
 * `short` fits under the status in the list; `title` and `text` head the details.
 */
export const sellerNext = (o) => {
  const pickup = isPickup(o);
  const courier = o.courierName || o.courier?.name || null;
  const deadline = o.deadline?.at ? new Date(o.deadline.at) : null;
  const due = deadline ? shortWhen(deadline) : '';
  const collect = o.paymentMethod === 'COD' && o.paymentStatus !== 'PAID' ? ` Collect ${peso(o.total)}.` : '';
  // Paid online, then a rider failed by the buyer's fault: that trip's fee is not sent back.
  const keptNote = Number(o.failedTripKept) > 0 ? ` (the ${peso(o.failedTripKept)} delivery fee covers the failed trip)` : '';
  const refundAmt = isQr(o) && o.refundDue != null ? o.refundDue : o.total;

  if (o.status === 'CANCELLED') {
    if (o.paymentStatus === 'PAID') {
      return { tone: 'red', short: 'Refund due', title: "Cancelled: return the buyer's payment", text: `${cancelSummary(o, 'seller')} Send back ${peso(refundAmt)}${keptNote}, then tap Mark refunded below.`, due: '' };
    }
    if (o.paymentStatus === 'PENDING_VERIFICATION') {
      return { tone: 'amber', short: 'Check for a refund', title: 'Cancelled before you checked the payment', text: `${cancelSummary(o, 'seller')} If ${peso(o.total)} reached you, send back ${peso(refundAmt)}${keptNote}, then tap Mark refunded below.`, due: '' };
    }
    return { tone: 'grey', short: 'Cancelled', title: 'Cancelled', text: `${cancelSummary(o, 'seller')} Its stock is back in your shop.`, due: '' };
  }
  if (o.status === 'COMPLETED') {
    return { tone: 'green', short: 'Done', title: 'Completed', text: 'The buyer has the order. Nothing more to do.', due: '' };
  }
  if (o.status === 'PENDING') {
    return {
      tone: 'amber',
      short: 'Confirm it',
      title: 'New order: confirm it',
      text: `${deadline ? `Confirm by ${shortWhen(deadline)} (${timeLeft(deadline)}), or it is cancelled automatically and the stock comes back. ` : ''}${isQr(o) ? (o.paymentStatus === 'PENDING_VERIFICATION' ? 'The buyer already sent a payment: check it below too.' : 'The buyer pays with your QR after you confirm.') : `The buyer pays cash on ${pickup ? 'pickup' : 'delivery'}.`}`,
      due,
    };
  }
  if (o.paymentStatus === 'PENDING_VERIFICATION') {
    return {
      tone: 'amber',
      short: 'Check payment',
      title: 'Check the payment',
      text: `The buyer says they paid ${peso(o.total)}${o.paymentReference ? ` (ref. ${o.paymentReference})` : ''}. Check your ${payLabel(o.paymentMethod)} app, then confirm or reject it below.`,
      due: '',
    };
  }
  if (o.status === 'CONFIRMED' && isQr(o) && o.paymentStatus === 'FAILED') {
    return { tone: 'blue', short: 'Awaiting new proof', title: 'Waiting for a new payment proof', text: `You rejected the last proof. The buyer can send a new one${deadline ? ` until ${shortWhen(deadline)}` : ''}; the order is cancelled if they don't.`, due };
  }
  if (o.status === 'CONFIRMED' && isQr(o) && o.paymentStatus === 'PENDING') {
    return { tone: 'blue', short: 'Waiting for payment', title: "Waiting for the buyer's payment", text: `The buyer pays ${peso(o.total)} with your QR${deadline ? ` by ${shortWhen(deadline)}` : ''}. You'll be told when they send it; it is cancelled if they don't pay.`, due };
  }
  // A MoorMove rider takes it from packing on. The app can't call a rider
  // yet: that is done in Seller Center on the website.
  if (isRiderOrder(o)) {
    const rd = o.riderDelivery || null;
    const cashHeld = rd?.status === 'DELIVERED' && Number(rd.codAmount) > 0 && !rd.codReturnedAt;
    if (cashHeld && ['DELIVERED', 'COMPLETED'].includes(o.status)) {
      return { tone: 'amber', short: 'Collect cash', title: `Delivered — ${peso(rd.codAmount)} with the rider`, text: 'The rider brings the cash back to your shop. Confirm Cash received in Seller Center on the website once you have it.', due };
    }
    if (['CONFIRMED', 'PREPARING', 'TO_SHIP', 'READY'].includes(o.status)) {
      // The delivery failed: the rider is bringing the parcel back.
      if (riderReturning(rd)) {
        return {
          tone: 'red',
          short: 'Parcel coming back',
          title: 'Delivery failed: the rider is bringing the parcel back',
          text: `${rd.failReason ? `${rd.failReason}. ` : ''}Tap Parcel back once it is at your shop. You can also cancel the order.`,
          due: '',
        };
      }
      // The rider brought it back: call a rider again (on the website) or cancel.
      if (rd?.status === 'FAILED' && rd.returnedAt) {
        return {
          tone: 'amber',
          short: 'Call a rider again',
          title: 'Parcel back at your shop',
          text: `${rd.failReason ? `The delivery failed: ${rd.failReason}. ` : ''}Call a rider again or deliver it yourself from Seller Center on the website. You can also cancel the order.${redeliveryNote(o) ? ` ${redeliveryNote(o)}` : ''}`,
          due: '',
        };
      }
      if (riderOpen(rd)) {
        return { tone: 'blue', short: 'Rider booked', title: 'A MoorMove rider is booked', text: 'Keep the parcel ready at your shop. The order moves on by itself when the rider picks it up.', due: '' };
      }
      return {
        tone: 'amber',
        short: 'Call a rider',
        title: o.status === 'TO_SHIP' ? 'Call a rider' : 'Pack it, then call a rider',
        text: `The buyer chose a MoorMove rider.${rd && ['CANCELLED', 'FAILED'].includes(rd.status) ? ' The last rider booking did not go through.' : ''} When the parcel is packed, call a rider from Seller Center on the website: a rider picks it up at your shop pin.`,
        due: '',
      };
    }
    if (o.status === 'OUT_FOR_DELIVERY') {
      return { tone: 'blue', short: 'With the rider', title: 'With the rider', text: 'The rider is delivering it. This order updates on its own.', due: '' };
    }
  }
  // An older READY delivery going by courier is marked packed (To ship) first: only that can be shipped.
  if (['CONFIRMED', 'PREPARING'].includes(o.status) || (o.status === 'READY' && !pickup && courier)) {
    return {
      tone: 'amber',
      short: pickup ? 'Prepare it' : 'Pack it',
      title: pickup ? 'Prepare the order' : 'Pack the order',
      text: pickup
        ? 'Get it ready, then tap Ready for pickup so the buyer knows to come.'
        : courier
          ? `Pack it, then tap Packed: ready to ship. After that you hand it to ${courier} (the buyer chose ${courier}).`
          : 'Pack it, then tap Packed: ready to ship.',
      due: '',
    };
  }
  if (['TO_SHIP', 'READY'].includes(o.status) && !pickup) {
    return courier
      ? { tone: 'amber', short: `Ship with ${courier}`, title: `Ship it with ${courier}`, text: `Drop it at ${courier} (or book a pickup), then tap Ship with courier and scan the waybill's barcode.`, due: '' }
      : { tone: 'amber', short: 'Deliver it', title: 'Deliver it', text: 'Tap Out for delivery when you set off, so the buyer knows it is coming.', due: '' };
  }
  if (o.status === 'OUT_FOR_DELIVERY') {
    return { tone: 'blue', short: 'Out for delivery', title: 'On the way', text: `When the buyer has it, tap Mark delivered and take a photo.${collect}`, due: '' };
  }
  if (o.status === 'SHIPPED') {
    return { tone: 'blue', short: `With ${courier || 'courier'}`, title: `With ${courier || 'the courier'}`, text: `${o.trackingNumber ? `Tracking ${o.trackingNumber}. ` : ''}It completes when the buyer confirms, or on its own${deadline ? ` on ${shortWhen(deadline)}` : ''}.`, due };
  }
  if (['READY_FOR_PICKUP', 'READY'].includes(o.status)) {
    return { tone: 'blue', short: 'Waiting for pickup', title: 'Waiting for the buyer to pick it up', text: `When they collect it at your pickup spot, tap Mark picked up and take a photo.${collect}`, due: '' };
  }
  if (['DELIVERED', 'PICKED_UP'].includes(o.status)) {
    return { tone: 'green', short: 'Waiting for buyer', title: 'Handed over', text: `The buyer confirms receipt, or it completes on its own${deadline ? ` on ${shortWhen(deadline)}` : ''}.`, due };
  }
  return { tone: 'grey', short: '', title: '', text: '', due: '' };
};

/* ── SellerOrders.jsx ─────────────────────────────────────────────────── */

/** Status words and their colour class (the icons are the desktop table's). */
const STATUS_CLS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  TO_SHIP: 'preparing',
  OUT_FOR_DELIVERY: 'ready',
  SHIPPED: 'ready',
  DELIVERED: 'completed',
  READY: 'ready',
  READY_FOR_PICKUP: 'ready',
  PICKED_UP: 'completed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};
// The tabs' words (orderProgress statusLabel); a new order is "New".
export const STATUS_MAP = Object.fromEntries(Object.entries(STATUS_CLS)
  .map(([status, cls]) => [status, { label: status === 'PENDING' ? 'New' : statusLabel(status), cls }]));
/** A status's words and colour class, READY told apart by how it is handed over. */
export const statusOf = (order) => ({
  cls: STATUS_CLS[order?.status] || '',
  label: order?.status === 'PENDING' ? 'New' : statusLabel(order?.status, order?.fulfillmentMethod),
});

// The one next step for each status, within the backend's transitions
// (order.service.js updateOrderStatus). Delivery orders the buyer sent with a
// courier are shipped with it; the rest the seller delivers. Delivered and
// picked-up orders wait for the buyer (or complete on their own). READY is an
// older status: it is handed over like the newer ones, never completed
// straight away (a courier parcel is marked To ship first, then shipped).
const NEXT_STEP = {
  DELIVERY: {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'TO_SHIP',
    PREPARING: 'TO_SHIP',
    TO_SHIP: (o) => (o.courierId ? 'SHIPPED' : 'OUT_FOR_DELIVERY'),
    OUT_FOR_DELIVERY: 'DELIVERED',
    READY: (o) => (o.courierId ? 'TO_SHIP' : 'OUT_FOR_DELIVERY'),
  },
  PICKUP: {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'READY_FOR_PICKUP',
    PREPARING: 'READY_FOR_PICKUP',
    READY_FOR_PICKUP: 'PICKED_UP',
    READY: 'PICKED_UP',
  },
};
const CANCELLABLE = ['PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'READY'];

export const PAYMENT_LABELS = {
  PENDING: { label: 'Unpaid', cls: 'pending' },
  PENDING_VERIFICATION: { label: 'Payment to verify', cls: 'pending' },
  PAID: { label: 'Paid', cls: 'completed' },
  FAILED: { label: 'Proof rejected — awaiting resubmission', cls: 'cancelled' },
  EXPIRED: { label: 'Payment expired', cls: 'cancelled' },
  REFUNDED: { label: 'Refunded', cls: 'cancelled' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', cls: 'cancelled' },
};

export const PAYMENT_FILTERS = [
  { key: '', label: 'Any payment' },
  ...Object.entries(PAYMENT_LABELS).map(([key, v]) => ({ key, label: v.label })),
];

export const PAGE_SIZE = 20;

// A QR order is paid after the seller confirms it: before that nothing is
// due; after it, the buyer pays from To Pay and the seller confirms it.
export const qrUnpaid = (order) => Boolean(order?.paymentMethod) && order.paymentMethod !== 'COD' && order.paymentStatus === 'PENDING';
export const paymentBadge = (order) => {
  if (qrUnpaid(order) && order.status === 'PENDING') return { label: 'Paid after you confirm', cls: 'pending' };
  if (qrUnpaid(order) && order.status === 'CONFIRMED') return { label: 'Waiting for payment', cls: 'pending' };
  return PAYMENT_LABELS[order?.paymentStatus] || null;
};

// Why a seller cancels; a no-show and a refusal count on the buyer's record.
// After a MoorMove rider couldn't deliver it (back in To ship), the buyer may
// have refused it or not been there (the server accepts those then too).
export const cancelReasonsFor = (status, order = null) => {
  const riderFailed = ['FAILED', 'RETURNING'].includes(order?.riderDelivery?.status) && status === 'TO_SHIP';
  return [
    ['SELLER_CANCELLED', 'I can\'t fill this order'],
    ['OUT_OF_STOCK', 'Out of stock'],
    ...(['READY_FOR_PICKUP', 'READY'].includes(status) ? [['NO_SHOW', 'The buyer didn\'t come to pick it up']] : []),
    ...(status === 'OUT_FOR_DELIVERY' || riderFailed ? [['REFUSED', 'The buyer refused the delivery']] : []),
    ...(riderFailed ? [['NO_SHOW', "The buyer wasn't there for the rider"]] : []),
  ];
};

// A cancelled order the buyer paid for: the shop records the refund once the money is back.
export const canMarkRefunded = (order) => ['PAID', 'PENDING_VERIFICATION'].includes(order?.paymentStatus) && order?.status === 'CANCELLED';

// Prepaid orders cannot move past confirmation until the payment is verified
// (the backend enforces the same rule).
const isAwaitingPayment = (order) => Boolean(order?.paymentMethod)
  && order.paymentMethod !== 'COD'
  && order.paymentStatus !== 'PAID';

/** The one next step, or null (waiting for the buyer's payment, or for the buyer). */
export function nextStep(order) {
  // A MoorMove rider takes it from packing on (and moves it on by itself).
  if (isRiderOrder(order) && order.status !== 'PENDING') return null;
  const step = NEXT_STEP[order?.fulfillmentMethod === 'PICKUP' ? 'PICKUP' : 'DELIVERY'][order?.status];
  const to = typeof step === 'function' ? step(order) : step;
  if (!to) return null;
  // A QR order goes on only once its payment is confirmed.
  if (to !== 'CONFIRMED' && isAwaitingPayment(order)) return null;
  return to;
}
// Not while a rider is on it (cancel the rider first), nor once a rider has
// the parcel; a parcel on its way back after a failed delivery may be cancelled.
export const canCancel = (order) => CANCELLABLE.includes(order?.status)
  && !(isRiderOrder(order) && ((riderOpen(order.riderDelivery) && !riderReturning(order.riderDelivery))
    || order.status === 'OUT_FOR_DELIVERY'));

/** The button for each step and its colour class (.action-*). */
export const ACTION_LABELS = {
  CONFIRMED: { label: 'Confirm order', cls: 'confirm' },
  PREPARING: { label: 'Start packing', cls: 'prepare' },
  TO_SHIP: { label: 'Packed: ready to ship', cls: 'prepare' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', cls: 'ready' },
  SHIPPED: { label: 'Ship with courier', cls: 'ready' },
  DELIVERED: { label: 'Mark delivered', cls: 'complete' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', cls: 'ready' },
  PICKED_UP: { label: 'Mark picked up', cls: 'complete' },
  COMPLETED: { label: 'Mark completed', cls: 'complete' },
  CANCELLED: { label: 'Cancel order', cls: 'cancel' },
};

// Paluto is cooked after the order: when the buyer expects it.
export const cookingFor = (order) => !order?.respondBy && Boolean(order?.etaFrom) && hasPaluto(order.items)
  && !['CANCELLED', 'DELIVERED', 'COMPLETED', 'PICKED_UP'].includes(order.status);

// "×2", or "2 heads" for animals.
export const qtyLabel = (item) => (lineKind(item) === 'LIVESTOCK' ? countLabel(item) : `×${item.quantity}`);

/** "#EM-1234", or the id's last six characters. */
export const orderNo = (order) => order?.orderNumber || String(order?.id || '').slice(-6).toUpperCase();

/** "₱1234.50": the page prints Number(x).toFixed(2), no thousands commas. */
export const money = (n) => `₱${Number(n || 0).toFixed(2)}`;
