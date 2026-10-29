import { useQuery } from '@tanstack/react-query';
import axios from './axios';
import useAppSettings from '../hooks/useAppSettings';
import { peso } from './format';

/**
 * MoorMove riders: local riders who pick an order up at the shop's pin and
 * bring it to the buyer. The super admin switches it on for the whole site;
 * the server also has to be set up to reach MoorMove. Until both are true,
 * nothing about riders is offered anywhere.
 */

// Same as orderProgress's (kept here so that file can use this one).

/** MoorMove shown like a courier (its name and logo, as CourierMark takes them). */
export const MOORMOVE_COURIER = { name: 'MoorMove', logoUrl: '/couriers/moormove.svg' };

export const MOORMOVE_STATUS_KEY = ['moormove-status'];

/**
 * Whether riders can be offered at all, and MoorMove's free-delivery promos
 * running now: `{ enabled, promos: [{ id, title, endsAt, townIds|null, maxKm|null }] }`.
 */
export function useMoormove() {
  const { settings } = useAppSettings();
  const on = settings?.moormoveEnabled === true;
  const status = useQuery({
    queryKey: MOORMOVE_STATUS_KEY,
    queryFn: async () => {
      const res = await axios.get('/moormove/status', { quiet: true });
      return res.data || { enabled: false };
    },
    enabled: on,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const enabled = on && status.data?.enabled === true;
  return { enabled, promos: enabled && Array.isArray(status.data?.promos) ? status.data.promos : [] };
}

/**
 * The promos that apply to a shop in this town (MoorMove matches a promo to
 * the shop's town; one without towns runs everywhere).
 */
export const promosForTown = (promos, townId) => (promos || []).filter((p) => !Array.isArray(p.townIds)
  || (townId != null && p.townIds.map(String).includes(String(townId))));

/** "Oct 31, 2026": the day a promo ends. */
export const promoUntil = (p) => (p?.endsAt
  ? new Date(p.endsAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '');

export const isRiderOrder = (o) => o?.deliveryPartner === 'MOORMOVE';

/** An order's MoorMove free-delivery promo `{ title }`, or null. */
export const orderPromo = (o) => {
  if (!isRiderOrder(o)) return null;
  if (o.deliveryPromo) return o.deliveryPromo;
  return o.riderDelivery?.promoTitle ? { title: o.riderDelivery.promoTitle } : null;
};

/** The seller's line for a free-delivery promo order (who pays what), or ''. */
export const promoSellerLine = (o) => (orderPromo(o)
  ? `Free delivery promo by MoorMove: the buyer pays no delivery fee and you pay the rider nothing${
    o.paymentMethod === 'COD' ? `; the rider collects only ${peso(o.total)} for the items` : ''}.`
  : '');

const FINAL = ['DELIVERED', 'CANCELLED', 'FAILED'];
/**
 * A rider delivery still under way (a rider is being found, or has the job,
 * or is bringing a parcel that couldn't be delivered back to the shop).
 */
export const riderOpen = (rd) => Boolean(rd) && !FINAL.includes(rd.status);
/** Picked up: the rider has the parcel (also on the way back to the shop). */
export const riderHasParcel = (rd) => ['PICKED_UP', 'AT_DROPOFF', 'DELIVERED', 'RETURNING'].includes(rd?.status);
/** The delivery failed after pickup and the rider is bringing the parcel back. */
export const riderReturning = (rd) => rd?.status === 'RETURNING';

/**
 * The line for an order the shop took over from a MoorMove rider (it
 * delivers it itself; the buyer pays the delivery fee quoted), or ''.
 * @param {Object} o - the order
 * @param {'seller'|'buyer'} who
 */
export const fallbackLine = (o, who = 'buyer') => {
  if (!o?.riderFallbackAt || o.fulfillmentMethod === 'PICKUP') return '';
  const fee = Number(o.deliveryFee || 0);
  if (who === 'seller') {
    return `You're delivering this yourself instead of a MoorMove rider. ${fee > 0
      ? `The buyer pays the ${peso(fee)} delivery fee as quoted, now to you.`
      : 'Delivery stays free for the buyer.'}`;
  }
  return `The shop is delivering this itself. ${fee > 0 ? `Delivery fee ${peso(fee)} as quoted.` : 'Delivery stays free.'}`;
};

/* ── A failed rider trip: who pays its delivery fee ──────────────────
 * order.failedTrip (the newest failed trip, kept after a re-delivery):
 *   BUYER_OWES     buyer's fault, COD: the shop pays the rider at Parcel back, the buyer pays it back
 *   FEE_KEPT       buyer's fault, paid online: the fee the buyer paid covers the trip
 *   MOORMOVE_PAYS  buyer's fault, free-delivery promo: MoorMove pays the rider
 *   NO_CHARGE      not the buyer's fault: the buyer owes nothing
 * order.unpaidFee: the fee the buyer owes for it (BUYER_OWES, from Parcel back on).
 */

/** "Buyer's fault" / "Not the buyer's fault". */
export const faultLabel = (trip) => (trip?.buyerFault ? "Buyer's fault" : "Not the buyer's fault");

/** The failed trip's fee the rider kept, covered by the buyer's online payment. */
const keptFee = (o) => Number(o?.failedTripKept || o?.failedTrip?.fee || 0);

/** The seller's Parcel back line: who pays the rider for the failed trip, or ''. */
export const parcelBackLine = (o) => {
  const t = o?.failedTrip;
  switch (t?.outcome) {
    case 'BUYER_OWES':
      return `Pay the rider ${peso(t.shopPaysRider || t.fee)}. The buyer pays it back on their next order.`;
    case 'FEE_KEPT':
      return `The rider keeps the ${peso(keptFee(o))} fee you paid. The buyer covers it: if you cancel, refund ${peso(o.refundDue)}.`;
    case 'MOORMOVE_PAYS':
      return 'MoorMove pays the rider for this trip.';
    case 'NO_CHARGE':
      return Number(t.riderGivesBack) > 0 ? `Get back the ${peso(t.riderGivesBack)} fee you paid the rider.` : 'No one pays for this trip.';
    default:
      return '';
  }
};

/** The seller's line about the failed trip's fee once the parcel is back, or ''. */
export const failedTripSellerLine = (o) => {
  const t = o?.failedTrip;
  if (!t) return '';
  if (t.status === 'RETURNING') return parcelBackLine(o);
  if (t.outcome === 'FEE_KEPT') return `The ${peso(keptFee(o))} delivery fee the buyer paid covers this trip.`;
  if (t.outcome === 'MOORMOVE_PAYS') return 'MoorMove paid the rider for this trip.';
  if (t.outcome === 'NO_CHARGE') return Number(t.riderGivesBack) > 0 ? `The rider gives back the ${peso(t.riderGivesBack)} fee you paid.` : 'No charge to the buyer.';
  return '';
};

/** Where the buyer's unpaid fee stands: Unpaid, Added to order X, Paid with order X, Waived. */
export const unpaidFeeStatus = (o) => {
  const f = o?.unpaidFee;
  if (!f) return '';
  if (f.status === 'WAIVED') return 'Waived';
  const where = f.paidOrderId && f.paidOrderId === o.id ? 'this order' : `order ${f.paidOrderNumber || ''}`.trim();
  if (f.status === 'PAID') return f.paidOrderId ? `Paid with ${where}` : 'Paid';
  return f.paidOrderId ? `Added to ${where}` : 'Unpaid';
};

/** The seller (or a super admin) can waive the fee while it is open. */
export const canWaiveFee = (o) => o?.unpaidFee?.status === 'OPEN';

/** The order's own unpaid fee a re-delivery adds to it (not added anywhere yet), or 0. */
export const feeToAdd = (o) => (o?.failedTrip?.outcome === 'BUYER_OWES' && o?.unpaidFee?.status === 'OPEN' && !o.unpaidFee.paidOrderId
  ? Number(o.unpaidFee.amount || 0)
  : 0);

/**
 * The note on Call a rider again / Deliver it myself after a failed trip, or ''.
 * @param {Object} o
 * @param {'book'|'self'} action
 */
export const redeliveryLine = (o, action) => {
  const t = o?.failedTrip;
  if (!t) return '';
  if (t.outcome === 'FEE_KEPT') {
    return `The buyer's fee paid for the failed trip, so they pay nothing more.${action === 'self' ? '' : ' You pay the new rider.'}`;
  }
  const add = feeToAdd(o);
  return add > 0 ? `The ${peso(add)} unpaid fee is added to this order: the buyer pays ${peso(Number(o.total || 0) + add)}.` : '';
};

/** The buyer's line about a failed rider trip and its fee, or ''. */
export const failedTripBuyerLine = (o) => {
  const t = o?.failedTrip;
  if (!t) return '';
  const why = `Delivery failed${t.failReason ? `: ${t.failReason}` : ''}.`;
  if (t.outcome === 'BUYER_OWES') {
    const f = o.unpaidFee;
    const amount = Number(f?.amount ?? (t.shopPaysRider || t.fee));
    let state = '';
    if (f?.status === 'WAIVED') state = 'The shop waived it.';
    else if (f?.status === 'PAID') state = f.paidOrderId && f.paidOrderId !== o.id ? `Paid with order ${f.paidOrderNumber}.` : 'Paid.';
    else if (f?.paidOrderId) state = f.paidOrderId === o.id ? "It's added to this order." : `It's added to order ${f.paidOrderNumber}.`;
    else if (f) state = "It's added to your next order from this shop.";
    return `${why} The ${peso(amount)} delivery fee for this trip is charged to you.${state ? ` ${state}` : ''}`;
  }
  if (t.outcome === 'FEE_KEPT') {
    const refund = o.status === 'CANCELLED' && Number(o.refundDue) > 0
      ? (o.paymentStatus === 'REFUNDED' ? ` ${peso(o.refundDue)} refunded.` : ` The shop refunds ${peso(o.refundDue)}.`)
      : '';
    return `${why} The ${peso(keptFee(o))} delivery fee you paid covers this trip.${refund}`;
  }
  return `${why} No charge to you.`;
};

/** "Unpaid delivery fee (order ORD-X)" lines in an order's totals: [{ key, label, amount }]. */
export const carriedFeeLines = (o) => (Array.isArray(o?.carriedFees) ? o.carriedFees : []).map((f) => ({
  key: f.id,
  label: `Unpaid delivery fee (order ${f.orderNumber})`,
  amount: Number(f.amount || 0),
}));

/** What cancelling a paid-online order refunds: refundDue when the server sent one, else the total. */
export const refundAmount = (o) => (Number(o?.refundDue) > 0 ? Number(o.refundDue) : Number(o?.total || 0));

/** The seller's cancel note for a paid-online order: "Refund ₱X: the ₱Y delivery fee covers the failed trip.", or ''. */
export const refundLine = (o) => (Number(o?.refundDue) > 0
  ? `Refund ${peso(o.refundDue)}${Number(o.failedTripKept) > 0 ? `: the ${peso(o.failedTripKept)} delivery fee covers the failed trip` : ''}.`
  : '');

/** "Rider fee ₱60.00 goes to MoorMove" for an order a MoorMove rider delivers, or ''. */
export const riderFeeNote = (o) => (Number(o?.riderFee) > 0 ? `Rider fee ${peso(o.riderFee)} goes to MoorMove` : '');

/** The shop's sale from an order: without a MoorMove rider's fee. */
export const shopTotalOf = (o) => Number(o?.shopTotal ?? o?.total ?? 0);

/** Cash the rider collected for the shop and has not handed over yet. */
export const riderCashHeld = (o) => {
  const rd = o?.riderDelivery;
  return Boolean(rd) && rd.status === 'DELIVERED' && Number(rd.codAmount) > 0 && !rd.codReturnedAt;
};

// Steps where the parcel waits at the shop for a rider.
export const AT_SHOP = ['CONFIRMED', 'PREPARING', 'TO_SHIP'];

/** A QR order is handed over only once its payment is confirmed. */
export const awaitingPayment = (o) => Boolean(o?.paymentMethod) && o.paymentMethod !== 'COD' && o.paymentStatus !== 'PAID';

/**
 * What the seller can do next with a MoorMove order, for the list's action
 * button: 'book' (Call a rider), 'cash' (Cash received), 'parcel' (Parcel
 * back) or null.
 * @param {Object} order
 * @param {Boolean} enabled - riders are on for the site
 */
export const riderNextAction = (order, enabled) => {
  if (!isRiderOrder(order) || order.fulfillmentMethod === 'PICKUP') return null;
  if (riderCashHeld(order)) return 'cash';
  const rd = order.riderDelivery;
  if (riderReturning(rd)) return 'parcel';
  if (enabled && AT_SHOP.includes(order.status) && !riderOpen(rd) && !awaitingPayment(order)) return 'book';
  return null;
};

const VEHICLES = { MOTORCYCLE: 'Motorcycle', TRICYCLE: 'Tricycle', BICYCLE: 'Bicycle' };
export const vehicleLabel = (v) => VEHICLES[v] || (v ? String(v).charAt(0) + String(v).slice(1).toLowerCase() : '');

/** "Juan" from "Juan Dela Cruz", or "The rider". */
const firstName = (rd) => (rd?.riderName ? String(rd.riderName).trim().split(/\s+/)[0] : '');

/**
 * Where a rider delivery stands, in the words of the person reading it.
 * @param {Object} rd - the order's riderDelivery
 * @param {'seller'|'buyer'} who
 * @param {Object} [order] - for the amounts (COD total)
 * @returns {{ title: String, text: String, tone: 'blue'|'green'|'amber'|'red'|'grey' }}
 */
export const riderStatus = (rd, who, order = null) => {
  const name = firstName(rd) || 'The rider';
  const seller = who === 'seller';
  const cod = order?.paymentMethod === 'COD' && order?.paymentStatus !== 'PAID';
  switch (rd?.status) {
    case 'SEARCHING':
      return {
        tone: 'amber',
        title: 'Finding a rider…',
        text: seller ? 'Riders nearby are being asked. Keep the parcel ready at your shop.' : 'The shop called a rider. You will see them here once one takes it.',
      };
    case 'ACCEPTED':
      return {
        tone: 'blue',
        title: seller ? `${name} is coming to your shop` : 'Rider is on the way to the shop',
        text: seller ? 'Have the parcel ready to hand over.' : `${name} will pick up your order and bring it to you.`,
      };
    case 'AT_PICKUP':
      return {
        tone: 'blue',
        title: 'Rider is at the shop',
        text: seller ? `Hand the parcel to ${name}.` : `${name} is picking up your order.`,
      };
    case 'PICKED_UP':
      return {
        tone: 'blue',
        title: seller ? 'Picked up — on the way to the buyer' : 'Picked up — on the way to you',
        text: seller ? `${name} has the parcel.` : (cod && order ? `Have ${peso(order.total)} ready for the rider.` : `${name} is bringing your order.`),
      };
    case 'AT_DROPOFF':
      return {
        tone: 'green',
        title: seller ? "Rider is at the buyer's place" : 'Your rider has arrived',
        text: seller ? `${name} is handing it over.` : (cod && order ? `Pay ${peso(order.total)} to the rider.` : `Meet ${name} to get your order.`),
      };
    case 'DELIVERED':
      if (seller && Number(rd.codAmount) > 0) {
        return rd.codReturnedAt
          ? { tone: 'green', title: 'Delivered', text: `You received the ${peso(rd.codAmount)} cash from the rider.` }
          : { tone: 'amber', title: `Delivered — ${peso(rd.codAmount)} with the rider`, text: `${name} brings the cash back to your shop. Tap Cash received once you have it.` };
      }
      return { tone: 'green', title: 'Delivered', text: seller ? 'The rider handed the order to the buyer.' : 'The rider handed over your order.' };
    case 'RETURNING':
      // Failed after pickup: the rider brings the parcel back to the shop.
      return seller
        ? {
          tone: 'red',
          title: 'Delivery failed: the rider is bringing the parcel back',
          text: `${rd.failReason ? `${rd.failReason}. ` : ''}Tap Parcel back once it is at your shop.`,
        }
        : {
          tone: 'red',
          title: "Delivery didn't go through",
          text: `${rd.failReason ? `${rd.failReason}. ` : ''}The parcel is going back to the shop. The shop will arrange it again.`,
        };
    case 'FAILED':
      // returnedAt: the seller confirmed the parcel is back (after RETURNING).
      if (rd.returnedAt) {
        return seller
          ? {
            tone: 'amber',
            title: 'Parcel back at your shop',
            text: `${rd.failReason ? `The delivery failed: ${rd.failReason}. ` : ''}Call a rider again or deliver it yourself.`,
          }
          : {
            tone: 'red',
            title: "Delivery didn't go through",
            text: `${rd.failReason ? `${rd.failReason}. ` : ''}The parcel is back at the shop. The shop will arrange it again.`,
          };
      }
      return {
        tone: 'red',
        title: "The delivery didn't go through",
        text: seller
          ? `${rd.failReason ? `${rd.failReason}. ` : ''}Once the parcel is back at your shop, call a rider again or deliver it yourself.`
          : `${rd.failReason ? `${rd.failReason}. ` : ''}The shop will arrange it again.`,
      };
    case 'CANCELLED':
      return {
        tone: 'grey',
        title: 'Rider cancelled',
        text: seller
          ? `${rd.cancelReason ? `${rd.cancelReason}. ` : ''}Call another rider or deliver it yourself.`
          : 'The shop will send it with another rider or deliver it themselves.',
      };
    default:
      return { tone: 'grey', title: '', text: '' };
  }
};

/** "just now", "3 min ago", "2 hrs ago". */
export const seenAgo = (date, now = Date.now()) => {
  if (!date) return '';
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr${h === 1 ? '' : 's'} ago`;
};
