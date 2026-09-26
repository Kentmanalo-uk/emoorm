import {
  PaperPlaneTilt, Storefront, Truck, MapPin, HandCoins, QrCode, Package, IdentificationCard, SealCheck,
} from '@phosphor-icons/react';
import axios from './axios';

/**
 * The new-shop checklist. The API (GET /stores/my/setup) sends only facts:
 * step keys, done flags and what is missing. This file turns them into the
 * words, icons and links sellers see, for the setup page and the dashboard.
 */

export const fetchSellerSetup = () => axios.get('/stores/my/setup').then((res) => res.data);

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const joinWords = (list) => (list.length <= 1
  ? list[0] || ''
  : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

const PROFILE_PARTS = { logo: 'a logo', description: 'a short description', location: 'your map pin' };

/**
 * @param {Object} step - One step from the API
 * @param {{municipality?: String}} context
 * @returns {{title, text, action, to, icon, tone, group, optional}}
 *   tone: 'done' | 'todo' | 'failed' | 'waiting'
 *   group: 'ready' (get the shop ready) | 'live' (go public)
 */
export const describeStep = (step, { municipality } = {}) => {
  const base = { optional: Boolean(step.optional), tone: step.done ? 'done' : 'todo', group: 'ready' };

  switch (step.key) {
    case 'apply':
      return {
        ...base,
        title: 'Apply to sell',
        text: 'Your seller application is in.',
        icon: PaperPlaneTilt,
        to: null,
      };

    case 'profile': {
      const missing = (step.missing || []).map((part) => PROFILE_PARTS[part]).filter(Boolean);
      const onlyLogo = step.missing?.length === 1 && step.missing[0] === 'logo';
      return {
        ...base,
        title: 'Make your shop look good',
        text: step.done
          ? 'Logo, description and map pin are set.'
          : `Add ${joinWords(missing)} so buyers know and find your shop.`,
        action: 'Edit shop profile',
        icon: Storefront,
        to: onlyLogo ? '/seller/store#branding' : '/seller/store#shop-info',
      };
    }

    case 'delivery-fee':
      return {
        ...base,
        title: 'Set your delivery fee',
        text: step.done
          ? (step.fee > 0 ? `${peso(step.fee)} per delivery order.` : 'Free delivery.')
          : 'How much you charge per delivery. Enter 0 for free delivery.',
        action: 'Set delivery fee',
        icon: Truck,
        to: '/seller/fulfillment#delivery-fee',
      };

    case 'delivery-areas':
      return {
        ...base,
        title: 'Choose where you deliver',
        text: step.done
          ? `You deliver to ${plural(step.count, 'area')}.`
          : 'Pick the towns and barangays you can deliver to.',
        action: 'Choose areas',
        icon: MapPin,
        to: '/seller/fulfillment#delivery-areas',
      };

    case 'pickup':
      return {
        ...base,
        title: 'Set your pickup spot',
        text: step.done ? 'Buyers know where to collect their orders.' : 'Tell buyers where to collect their orders.',
        action: 'Set pickup spot',
        icon: HandCoins,
        to: '/seller/fulfillment#pickup',
      };

    case 'payment':
      return {
        ...base,
        title: 'Add your payment QR',
        text: step.done
          ? 'Buyers can pay you by QR.'
          : step.optional
            ? 'Upload your GCash or Maya QR so buyers can pay online. Buyers can still pay cash.'
            : 'Upload your GCash or Maya QR. Cash is off, so this is how buyers pay you.',
        action: 'Add QR code',
        icon: QrCode,
        to: '/seller/fulfillment#payment',
      };

    case 'product':
      return {
        ...base,
        title: 'Add your first product',
        text: step.done
          ? `${plural(step.count, 'product')} added.`
          : 'Photos, a price and how many you have. It takes about two minutes.',
        action: 'Add a product',
        icon: Package,
        to: step.done ? '/seller/products' : '/seller/products/new',
      };

    case 'identity': {
      const failed = !step.done && step.status === 'FAILED';
      const checking = !step.done && step.status === 'PENDING';
      return {
        ...base,
        group: 'live',
        tone: step.done ? 'done' : failed ? 'failed' : checking ? 'waiting' : 'todo',
        title: 'Verify your identity',
        text: step.done
          ? 'Your ID is confirmed.'
          : failed
            ? (step.failureReason || "We couldn't confirm your ID. Please try again.")
            : checking
              ? 'Checking your ID. This takes up to a minute.'
              : 'Scan a valid ID. Admins approve verified shops faster.',
        action: failed ? 'Try again' : 'Verify now',
        icon: IdentificationCard,
        to: '/seller/verification',
      };
    }

    case 'approval': {
      const rejected = !step.done && step.applicationStatus === 'REJECTED';
      const who = municipality ? `The ${municipality} admin` : 'Your municipal admin';
      return {
        ...base,
        group: 'live',
        tone: step.done ? 'done' : rejected ? 'failed' : 'waiting',
        title: step.done ? 'Your shop is public' : 'Get approved',
        text: step.done
          ? 'Buyers can find and order from your shop.'
          : rejected
            ? 'Your application was not approved. Check your notifications for the reason.'
            : `${who} reviews your shop. It goes public once approved, and we'll notify you.`,
        icon: SealCheck,
        to: null,
      };
    }

    default:
      return { ...base, title: step.key, text: '', icon: SealCheck, to: null };
  }
};

/** The one step to do next: the first open, required step the seller can act on. */
export const nextStep = (setup) => (setup?.steps || []).find(
  (step) => !step.done && !step.optional && !step.waiting && !(step.key === 'identity' && step.status === 'PENDING'),
) || null;
