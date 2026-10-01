import {
  PaperPlaneTilt, Storefront, Truck, MapPin, HandCoins, QrCode, Package, IdentificationCard, SealCheck,
  Image as ImageIcon,
} from '@phosphor-icons/react';
import axios from './axios';

/**
 * The new-shop checklist. The API (GET /stores/my/setup) sends only facts:
 * step keys, done flags and what is missing. This file turns them into the
 * words, icons and links sellers see, for the setup page and the dashboard.
 * `label` is the short name the phone Home's "Complete your shop" list uses.
 */

export const fetchSellerSetup = () => axios.get('/stores/my/setup').then((res) => res.data);

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const joinWords = (list) => (list.length <= 1
  ? list[0] || ''
  : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

const BRANDING_PARTS = { logo: 'a logo', banner: 'a cover banner' };
const PROFILE_PARTS = { description: 'a short description', location: 'your map pin' };

/**
 * @param {Object} step - One step from the API
 * @param {{municipality?: String}} context
 * @returns {{title, label, text, action, to, icon, tone, group, optional}}
 *   tone: 'done' | 'todo' | 'failed' | 'waiting'
 *   group: 'ready' (get the shop ready) | 'live' (go public)
 */
export const describeStep = (step, { municipality } = {}) => {
  const base = {
    optional: Boolean(step.optional),
    // Until these are done buyers cannot order from the shop (see the API's
    // shopReadiness.service).
    neededToSell: Boolean(step.neededToSell),
    tone: step.done ? 'done' : 'todo',
    group: 'ready',
  };

  switch (step.key) {
    case 'apply':
      return {
        ...base,
        title: 'Apply to sell',
        label: 'Apply to sell',
        text: 'Your seller application is in.',
        icon: PaperPlaneTilt,
        to: null,
      };

    case 'branding': {
      const missing = (step.missing || []).map((part) => BRANDING_PARTS[part]).filter(Boolean);
      return {
        ...base,
        title: 'Add your logo and banner',
        label: 'Shop logo and banner',
        text: step.done
          ? 'Your logo and cover banner are up.'
          : `Add ${joinWords(missing)} so buyers recognise your shop.`,
        action: 'Add images',
        icon: ImageIcon,
        to: '/seller/store/branding',
      };
    }

    case 'profile': {
      const missing = (step.missing || []).map((part) => PROFILE_PARTS[part]).filter(Boolean);
      return {
        ...base,
        title: 'Describe your shop',
        label: 'Shop description and map pin',
        text: step.done
          ? 'Your description and map pin are set.'
          : `Add ${joinWords(missing)} so buyers know and find your shop.`,
        action: 'Edit shop profile',
        icon: Storefront,
        // The description, or else the map pin, whichever is missing.
        to: (step.missing || []).includes('description') || step.done ? '/seller/store/about' : '/seller/store/location',
      };
    }

    case 'delivery-areas':
      // Couriers only: they go all around Mindoro; nothing to choose.
      if (step.byCourier) {
        return {
          ...base,
          title: 'Choose your courier',
          label: 'Who delivers',
          text: step.done
            ? 'Couriers deliver all around Mindoro.'
            : 'Choose a courier with rates, and add your GCash or QR Ph: courier orders are paid online.',
          action: 'Choose a courier',
          icon: MapPin,
          to: '/seller/fulfillment/delivery#delivery-couriers',
        };
      }
      return {
        ...base,
        title: 'Choose where you deliver',
        label: 'Where you deliver',
        text: step.done
          ? (step.allTowns
            ? 'You deliver all around Mindoro.'
            : step.homeOnly
              ? (step.barangays
                ? `You deliver to ${plural(step.barangays, 'barangay')} in ${municipality || 'your town'}.`
                : `You deliver anywhere in ${municipality || 'your town'}.`)
              : `You deliver to ${plural(step.towns || step.count, 'town')}.`)
          : 'Only in your town, some towns, or all around Mindoro.',
        action: 'Choose where',
        icon: MapPin,
        to: '/seller/fulfillment/delivery',
      };

    case 'delivery-fee': {
      if (step.byCourier) {
        return {
          ...base,
          title: 'Delivery fees',
          label: 'Delivery fees',
          text: "Worked out from each product's weight and the courier's rates.",
          action: 'See couriers',
          icon: Truck,
          to: '/seller/fulfillment/delivery#delivery-couriers',
        };
      }
      const own = step.pricedAreas || 0;
      const ownText = own > 0 ? ` ${plural(own, 'place')} ${own === 1 ? 'has' : 'have'} its own fee.` : '';
      return {
        ...base,
        title: 'Set your delivery fees',
        label: 'Delivery fees',
        text: step.done
          ? (step.fee == null
            ? 'A fee for each place.'
            : `${step.fee > 0 ? `${peso(step.fee)} for every place.` : 'Free delivery.'}${ownText}`)
          : 'Free, the same fee everywhere, or a fee for each place.',
        action: 'Set delivery fees',
        icon: Truck,
        to: '/seller/fulfillment/delivery#delivery-fee',
      };
    }

    case 'pickup':
      return {
        ...base,
        title: 'Set your pickup spot',
        label: 'Pickup spot',
        text: step.done ? 'Buyers know where to collect their orders.' : 'Tell buyers where to collect their orders.',
        action: 'Set pickup spot',
        icon: HandCoins,
        to: '/seller/fulfillment/pickup',
      };

    case 'payment':
      return {
        ...base,
        title: 'Add your payment QR',
        label: 'Payment options',
        text: step.done
          ? 'Buyers can pay you by QR.'
          : step.optional
            ? 'Add your GCash or QR Ph code so buyers can pay online. Buyers can still pay cash.'
            : 'Add your GCash or QR Ph code. Cash is off, so this is how buyers pay you.',
        action: 'Add QR code',
        icon: QrCode,
        to: '/seller/fulfillment/payment',
      };

    case 'product':
      return {
        ...base,
        title: 'Add your first product',
        label: 'Add your first product',
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
        label: 'Verify your identity',
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
        label: 'Admin approval',
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
      return { ...base, title: step.key, label: step.key, text: '', icon: SealCheck, to: null };
  }
};

/**
 * What still keeps the shop's products off the public listings, as
 * { key, label, to } in checklist order; empty once it is ready to sell.
 */
export const sellBlockers = (setup) => {
  if (!setup || setup.readyToSell !== false) return [];
  const context = { municipality: setup.municipality };
  return (setup.steps || [])
    .filter((step) => step.neededToSell && !step.done)
    .map((step) => {
      const meta = describeStep(step, context);
      return { key: step.key, label: meta.label, to: meta.to };
    });
};

/** The one step to do next: the first open, required step the seller can act on. */
export const nextStep = (setup) => (setup?.steps || []).find(
  (step) => !step.done && !step.optional && !step.waiting && !(step.key === 'identity' && step.status === 'PENDING'),
) || null;
