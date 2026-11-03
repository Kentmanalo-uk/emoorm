/**
 * The early version of E-MOORM on Google Play (closed testing): what this
 * browser remembers about the /app page's invitation (components/app/
 * PlayEarlyAccess). "Not now" keeps it closed for a week, joining for good.
 */

export const PLAY_JOIN_URL = 'https://play.google.com/apps/testing/shop.emoorm.app';

const KEY = 'emoorm.playEarly';
const LATER_DAYS = 7;

/** { joined, added, email } once joined, { later } after "Not now", or null. */
export const remembered = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};

export const remember = (value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private mode: it asks again next visit */
  }
};

/** Whether the page should open the invitation by itself on this visit. */
export const shouldInvite = () => {
  const saved = remembered();
  if (!saved) return true;
  if (saved.joined) return false;
  return !(saved.later && Date.now() - saved.later < LATER_DAYS * 86400e3);
};
