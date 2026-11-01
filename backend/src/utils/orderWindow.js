/**
 * How long a new order waits for its shop, and how to say it.
 *
 * The number is a setting a super admin changes (Settings -> Orders), so the
 * sweep that cancels, the deadline the apps show, the seller's email and
 * both assistants' guides all ask here rather than each holding a constant.
 * One place to read means they can never quote a person different rules.
 */
const appSettingService = require('../services/appSetting.service');

// Only the fallback: for a database that has not had the column yet, and for
// the moment a settings read fails. The same two days either way.
const FALLBACK_HOURS = Number(process.env.ORDER_PENDING_EXPIRY_HOURS) || 48;

/**
 * A window of hours in the words a person would use for it: 48 hours is
 * "2 days", 36 is "36 hours". Whole days read as days because that is how
 * the rule was set, and "cancelled after 48 hours" makes a buyer count.
 */
const windowLabel = (hours) => {
  const n = Number(hours);
  if (Number.isInteger(n) && n >= 24 && n % 24 === 0) {
    const days = n / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${n} hour${n === 1 ? '' : 's'}`;
};

/** The confirm window in force right now, in hours. */
const confirmWindowHours = async () => {
  try {
    return await appSettingService.getOrderConfirmHours();
  } catch {
    // A settings read must never stop the sweep that frees held stock.
    return FALLBACK_HOURS;
  }
};

/**
 * The rules a guide quotes, in words, for its {{token}} substitutions
 * (assistantCore `fill`). Everything here is safe to show anyone.
 */
const orderCopy = async () => ({ confirmWindow: windowLabel(await confirmWindowHours()) });

module.exports = {
  FALLBACK_HOURS, windowLabel, confirmWindowHours, orderCopy,
};
