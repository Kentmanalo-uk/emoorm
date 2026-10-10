import { useQuery } from '@tanstack/react-query';
import axios from './axios';
import useAppSettings from '../hooks/useAppSettings';

/**
 * MoorMove riders: local riders who pick an order up at the shop's pin and
 * bring it to the buyer. The super admin switches it on for the whole site;
 * the server also has to be set up to reach MoorMove. Until both are true,
 * nothing about riders is offered anywhere.
 */

// Same as orderProgress's (kept here so that file can use this one).
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const MOORMOVE_STATUS_KEY = ['moormove-status'];

/** Whether riders can be offered at all: `{ enabled }`. */
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
  return { enabled: on && status.data?.enabled === true };
}

export const isRiderOrder = (o) => o?.deliveryPartner === 'MOORMOVE';

const FINAL = ['DELIVERED', 'CANCELLED', 'FAILED'];
/** A rider delivery still under way (a rider is being found, or has the job). */
export const riderOpen = (rd) => Boolean(rd) && !FINAL.includes(rd.status);
/** Picked up: the rider has the parcel. */
export const riderHasParcel = (rd) => ['PICKED_UP', 'AT_DROPOFF', 'DELIVERED'].includes(rd?.status);

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
 * button: 'book' (Call a rider), 'cash' (Cash received) or null.
 * @param {Object} order
 * @param {Boolean} enabled - riders are on for the site
 */
export const riderNextAction = (order, enabled) => {
  if (!isRiderOrder(order) || order.fulfillmentMethod === 'PICKUP') return null;
  if (riderCashHeld(order)) return 'cash';
  const rd = order.riderDelivery;
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
    case 'FAILED':
      return {
        tone: 'red',
        title: "The delivery didn't go through",
        text: seller
          ? `${rd.failReason ? `${rd.failReason}. ` : ''}The rider is bringing the parcel back to your shop.`
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
