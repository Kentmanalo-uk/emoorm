const { ApiError } = require('../middleware/errorHandler');

/**
 * The super admin's switches and limits for invites (referral.service),
 * stored as one JSON column (app_settings.referral_settings). Null, or any
 * key left out, reads as the default here, and the default is off.
 *
 * No real cash is involved anywhere: a shop pays for its own invite rewards
 * with its own vouchers, and a seller who brings in a seller is paid in
 * visibility. These limits only bound what shops may offer.
 */
const DEFAULTS = Object.freeze({
  // The whole feature. Off until a super admin turns it on.
  enabled: false,
  // Shops' own invite rewards (a welcome voucher for the friend, a thank-you
  // voucher for the inviter, both for that shop only).
  shopInvites: true,
  // A seller who brings in a seller: both shops shown higher for a while.
  sellerInvites: true,
  // A friend's reward waits for a mobile number confirmed by SMS (only while
  // SMS is set up on the server; without it the check cannot be asked for).
  requireVerifiedPhone: true,
  // Rewards one person can earn in a calendar month (Manila).
  inviterMonthlyCap: 10,
  // How long an invite voucher lasts.
  voucherDays: 30,
  // The most a shop may give per invite voucher: pesos off, or percent off.
  maxShopReward: 200,
  maxShopPercent: 50,
  // A new shop counts once this many different buyers completed an order.
  sellerOrdersToQualify: 3,
  // How long both shops are shown higher.
  boostDays: 7,
});

const SWITCHES = ['enabled', 'shopInvites', 'sellerInvites', 'requireVerifiedPhone'];
// Whole numbers, with their bounds.
const NUMBERS = {
  inviterMonthlyCap: [1, 100],
  voucherDays: [1, 365],
  maxShopReward: [1, 5000],
  maxShopPercent: [1, 100],
  sellerOrdersToQualify: [1, 50],
  boostDays: [1, 60],
};
const LABELS = {
  inviterMonthlyCap: 'Rewards per person a month',
  voucherDays: 'Days an invite voucher lasts',
  maxShopReward: 'The most a shop may give (₱)',
  maxShopPercent: 'The most a shop may give (%)',
  sellerOrdersToQualify: 'Orders a new shop needs',
  boostDays: 'Days a shop is shown higher',
};

/** The settings in force: the stored values that are valid, defaults for the rest. */
const read = (stored) => {
  const out = { ...DEFAULTS };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
  for (const key of SWITCHES) if (typeof stored[key] === 'boolean') out[key] = stored[key];
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    const n = stored[key];
    if (Number.isInteger(n) && n >= min && n <= max) out[key] = n;
  }
  return out;
};

/**
 * A change from Settings, checked, on top of what is stored now. Anything
 * not understood is rejected rather than dropped, as the other settings are.
 * @param {Object} current - The stored JSON (or null)
 * @param {Object} input - The keys to change
 * @returns {Object} The full settings to store
 */
const merge = (current, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('referralSettings must be an object', 400);
  }
  const out = read(current);
  for (const [key, value] of Object.entries(input)) {
    if (SWITCHES.includes(key)) {
      if (typeof value !== 'boolean') throw new ApiError(`referralSettings.${key} must be true or false`, 400);
      out[key] = value;
    } else if (NUMBERS[key]) {
      const [min, max] = NUMBERS[key];
      const n = Number(value);
      if (value === null || value === '' || !Number.isInteger(n) || n < min || n > max) {
        throw new ApiError(`${LABELS[key]} must be a whole number from ${min} to ${max}`, 400);
      }
      out[key] = n;
    } else {
      throw new ApiError(`referralSettings.${key} is not a setting`, 400);
    }
  }
  return out;
};

module.exports = { DEFAULTS, read, merge };
