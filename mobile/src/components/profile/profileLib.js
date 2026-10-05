/*
 * The account pages' helpers, as the website has them:
 * web/src/lib/profileForm.js, lib/identity.js, lib/supportCategories.js,
 * lib/contact.js and the buyer half of lib/orderProgress.js.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { STORAGE_KEYS } from '../../api/client';

/* ── profileForm ─────────────────────────────────────────────────────── */

export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,19}$/;

// Keep what the person types inside what the server accepts.
export const cleanUsername = (value) => value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);

export const fullNameProblem = (name) => (!name || name.trim().length < 2 ? 'Please enter your full name' : null);

export const usernameProblem = (username) => (
  username && (!USERNAME_RE.test(username) || username.includes('..'))
    ? 'Username must be 3–20 characters: letters, numbers, dot or underscore'
    : null
);

export const contactProblem = (value) => {
  if (!value) return null;
  return /^09\d{9}$/.test(value.replace(/\D/g, '')) ? null : 'Contact number must be 11 digits starting with 09';
};

const PASSWORD_RULES = [
  { re: /.{8,}/, msg: 'Password must be at least 8 characters' },
  { re: /[A-Z]/, msg: 'Password must contain an uppercase letter' },
  { re: /[a-z]/, msg: 'Password must contain a lowercase letter' },
  { re: /[0-9]/, msg: 'Password must contain a number' },
  { re: /[!@#$%^&*(),.?":{}|<>]/, msg: 'Password must contain a special character' },
];

export const passwordProblem = ({ currentPassword, newPassword, confirmPassword }) => {
  if (!currentPassword || !newPassword || !confirmPassword) return 'Fill in all password fields';
  if (newPassword === currentPassword) return 'New password must be different from current password';
  if (newPassword !== confirmPassword) return 'New passwords do not match';
  return PASSWORD_RULES.find((r) => !r.re.test(newPassword))?.msg || null;
};

/** The account's own address on one line: street, barangay, town. */
export const homeAddressLine = (user) => [user?.address, user?.barangay, user?.municipality?.name]
  .map((s) => String(s || '').trim())
  .filter(Boolean)
  .join(', ');

/** Keeps this device signed in after a password change (the server signs out every device). */
export const adoptTokens = async (accessToken, refreshToken) => {
  if (!accessToken) return;
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.ACCESS_TOKEN, accessToken],
    ...(refreshToken ? [[STORAGE_KEYS.REFRESH_TOKEN, refreshToken]] : []),
  ]);
};

/* ── identity ────────────────────────────────────────────────────────── */

export const fetchIdentityStatus = async () => {
  const res = await apiClient.get('/identity-verification');
  return res.data;
};

/* ── support ─────────────────────────────────────────────────────────── */

export const SUPPORT_CATEGORIES = [
  ['ORDER', 'An order'],
  ['PAYMENT', 'A payment'],
  ['DELIVERY', 'Delivery or pickup'],
  ['RETURN', 'A return or refund'],
  ['ACCOUNT', 'My account'],
  ['SELLER', 'A seller or store'],
  ['IDENTITY_VERIFICATION', 'Identity verification'],
  ['APP_EXPERIENCE', 'How the app works'],
  ['FEATURE_REQUEST', 'An idea or request'],
  ['OTHER', 'Something else'],
];
export const CATEGORY_LABELS = Object.fromEntries(SUPPORT_CATEGORIES);
export const CASE_STATUS_LABELS = { OPEN: 'Open', RESOLVED: 'Resolved', CLOSED: 'Closed' };
export const SUBJECT_MAX = 160;
export const MESSAGE_MAX = 4000;

export const SUPPORT_EMAIL = 'support@emoorm.shop';
export const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61593727164885';

/* ── orders (the buyer's My Purchase counts) ─────────────────────────── */

const needsPayment = (o) => o.paymentMethod !== 'COD'
  && ((o.paymentStatus === 'PENDING' && o.status === 'CONFIRMED')
    || (o.paymentStatus === 'FAILED' && ['PENDING', 'CONFIRMED'].includes(o.status)));

const buyerBucket = (o) => {
  if (o.status === 'CANCELLED') return 'cancelled';
  if (o.status === 'COMPLETED') return 'completed';
  if (needsPayment(o)) return 'to_pay';
  const pickup = o.fulfillmentMethod === 'PICKUP';
  if (pickup && ['READY', 'READY_FOR_PICKUP', 'PICKED_UP'].includes(o.status)) return 'to_pickup';
  if (!pickup && ['OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED'].includes(o.status)) return 'to_receive';
  return 'to_ship';
};

export const countBuyerTabs = (orders = []) => orders.reduce((acc, o) => {
  const b = buyerBucket(o);
  acc[b] = (acc[b] || 0) + 1;
  return acc;
}, {});

/* ── small formatting ────────────────────────────────────────────────── */

export const shortDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const longDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  : '—');

export const parseImages = (images) => {
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try { const parsed = JSON.parse(images); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

export const RATING_WORDS = ['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent'];

/** The error text the website's toasts show (its axios unwraps the server's message). */
export const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
