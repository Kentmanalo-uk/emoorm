import { GCASH_LOGO, QRPH_LOGO } from './paymentLogos';
import { SERVICE_MUNICIPALITIES, SERVICE_PROVINCE, normalizeName as normalizeTown } from '../../checkout/CheckoutAddressPicker';

/*
 * The rules and wording of the seller's Delivery & payment pages
 * (web/src/pages/SellerFulfillment.jsx, lib/qrPayment.js and
 * lib/pickupAddress.js), shared by the list and each part's page.
 */

export const PARTS = ['method', 'pickup', 'delivery', 'payment'];
export const partPath = (part) => `/seller/fulfillment/${part}`;

export const MODE_LABELS = {
  DELIVERY: 'Delivery only',
  PICKUP: 'Pickup only',
  BOTH: 'Delivery and pickup',
};

export const MODES = [
  { key: 'DELIVERY', label: 'Delivery only', desc: 'Buyers get orders delivered to their address.' },
  { key: 'PICKUP', label: 'Pickup only', desc: 'Buyers collect orders at your store.' },
  { key: 'BOTH', label: 'Both', desc: 'Buyers can choose delivery or pickup.' },
];

// PSGC (Philippine Standard Geographic Code): free public API for Philippine locations.
export const PSGC_BASE = 'https://psgc.gitlab.io/api';
export const ORIENTAL_MINDORO_CODE = '175200000';

/** A fee as the form holds it: '' (none set) or the amount as text. */
export const feeText = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value)));

/** A form fee for the API: null (none set), a number, or undefined if invalid. */
export const parseFee = (text) => {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return undefined;
  return Math.round(n * 100) / 100;
};

export const pesos = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A town's delivery details: all its barangays or some, and the fees used when the fee depends on the place. */
export const emptyTown = () => ({ whole: true, fee: '', barangays: [] });

// "from ₱85": a courier's cheapest fee, for the seller to compare.
export const courierFrom = (c) => {
  const b = c?.rates?.brackets;
  if (!Array.isArray(b) || b.length === 0) return null;
  return Math.min(...b.map((x) => Math.min(Number(x.sameTown), Number(x.otherTown))));
};

// The website's own name matching for PSGC towns (SellerFulfillment.jsx).
export const normalizeName = (s) => (s || '')
  .toLowerCase()
  .replace(/\bcity of\b/g, '')
  .replace(/\bcity\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * The QR payments a shop can take: each one's logo, and what its account
 * number is called (a GCash number is the owner's mobile number).
 */
export const QR_METHODS = [
  {
    key: 'GCASH', label: 'GCash', logo: GCASH_LOGO, numberLabel: 'GCash number', numberPlaceholder: '0917 123 4567',
  },
  {
    key: 'QRPH', label: 'QR Ph', logo: QRPH_LOGO, numberLabel: 'Account number', numberPlaceholder: 'Bank or e-wallet account number',
  },
];

export const qrMethod = (key) => QR_METHODS.find((m) => m.key === key) || QR_METHODS[0];

const MOBILE = /^(?:\+?63|0)(9\d{9})$/;

/**
 * An account number as the server keeps it, or why it cannot be one. Same
 * rules as store.service's normalizeAccountNumber.
 * @returns {{ value: String|null, error: String|null }}
 */
export const checkAccountNumber = (text, qrType) => {
  const clean = String(text ?? '').replace(/[\s-]/g, '');
  if (!clean) return { value: null, error: null };
  const mobile = clean.match(MOBILE);
  if (qrType === 'GCASH') {
    return mobile
      ? { value: `0${mobile[1]}`, error: null }
      : { value: null, error: 'Enter your GCash number, like 0917 123 4567' };
  }
  if (mobile) return { value: `0${mobile[1]}`, error: null };
  return /^\d{6,20}$/.test(clean)
    ? { value: clean, error: null }
    : { value: null, error: 'Account number must be 6 to 20 digits' };
};

/**
 * The pickup address as one line, the way checkout writes addresses:
 * street, barangay, town, province.
 */
export const joinPickup = (p) => [p.street, p.barangay, p.municipalityName, SERVICE_PROVINCE.name]
  .map((s) => String(s || '').trim())
  .filter(Boolean)
  .join(', ');

/**
 * A saved pickup address split back into the picker's town, barangay and
 * street. Text typed before the picker keeps its words on the street line,
 * with the shop's own town chosen.
 */
export const splitPickup = (text, shopTown) => {
  const findTown = (name) => SERVICE_MUNICIPALITIES.find((m) => normalizeTown(m.name) === normalizeTown(name));
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length && normalizeTown(parts[parts.length - 1]) === normalizeTown(SERVICE_PROVINCE.name)) parts.pop();
  let town = parts.length ? findTown(parts[parts.length - 1]) : null;
  let barangay = '';
  if (town) {
    parts.pop();
    barangay = parts.length ? parts.pop().replace(/^(brgy\.?|barangay)\s+/i, '') : '';
  } else {
    town = findTown(shopTown) || null;
  }
  return {
    province: SERVICE_PROVINCE.name,
    provinceCode: '',
    municipalityId: '',
    municipalityName: town?.name || '',
    municipalityCode: town?.code || '',
    barangay,
    barangayCode: '',
    street: parts.join(', '),
  };
};

/** What a pickup address chosen with the picker still needs, or null. */
export const pickupGap = (parts) => {
  if (!parts?.municipalityName) return 'Choose the town of your pickup spot.';
  if (!String(parts.barangay || '').trim()) return 'Choose the barangay of your pickup spot.';
  if (!String(parts.street || '').trim()) return 'Add the street, building or landmark so buyers can find your pickup spot.';
  return null;
};
