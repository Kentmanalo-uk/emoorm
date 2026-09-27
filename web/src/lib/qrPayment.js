import gcashLogo from '../assets/payments/gcash.svg';
import qrphLogo from '../assets/payments/qrph.svg';

/**
 * The QR payments a shop can take: each one's logo, and what its account
 * number is called (a GCash number is the owner's mobile number).
 */
export const QR_METHODS = [
  {
    key: 'GCASH',
    label: 'GCash',
    logo: gcashLogo,
    numberLabel: 'GCash number',
    numberPlaceholder: '0917 123 4567',
  },
  {
    key: 'QRPH',
    label: 'QR Ph',
    logo: qrphLogo,
    numberLabel: 'Account number',
    numberPlaceholder: 'Bank or e-wallet account number',
  },
];

export const qrMethod = (key) => QR_METHODS.find((m) => m.key === key) || QR_METHODS[0];

const MOBILE = /^(?:\+?63|0)(9\d{9})$/;

/**
 * An account number as the server keeps it (spaces and dashes removed, a
 * mobile number as 09XXXXXXXXX), or why it cannot be one. Same rules as
 * store.service's normalizeAccountNumber.
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

/** An account number for reading: a mobile number as 0917 123 4567. */
export const formatAccountNumber = (value) => {
  const text = String(value ?? '');
  return /^09\d{9}$/.test(text) ? `${text.slice(0, 4)} ${text.slice(4, 7)} ${text.slice(7)}` : text;
};
