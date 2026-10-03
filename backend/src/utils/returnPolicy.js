/**
 * How many days a buyer has to ask for a return, from a product's return
 * policy. Sellers pick one of the product form's presets or write their own
 * words, so the policy is text; the window is read from it:
 *   - "No returns" (only items wrong or damaged on arrival): 3 days
 *   - "Perishable goods" (report on delivery): 2 days
 *   - Any text naming a number of days ("within 14 days", "30-day"): that
 *     number (1 to 60)
 *   - Anything else, or no policy: 7 days (what Footer and Sell promise)
 * Order items keep a snapshot { text, days } so a later policy edit does
 * not change orders already placed; older snapshots are plain text.
 */
const DEFAULT_RETURN_WINDOW_DAYS = 7;
const MAX_DAYS = 60;

const PRESETS = [
  [/^No returns or refunds accepted unless the item is incorrect or damaged/i, 3],
  [/^For perishable goods, report/i, 2],
];

const daysFromText = (text) => {
  const value = String(text || '').trim();
  if (!value) return DEFAULT_RETURN_WINDOW_DAYS;
  for (const [re, days] of PRESETS) if (re.test(value)) return days;
  const m = value.match(/(\d{1,3})\s*-?\s*(?:days?|araw)\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1) return Math.min(n, MAX_DAYS);
  }
  return DEFAULT_RETURN_WINDOW_DAYS;
};

/** Days to ask for a return, from a policy snapshot (object or text) or policy text. */
const returnWindowDays = (policy) => {
  if (policy && typeof policy === 'object') {
    const n = Number(policy.days ?? policy.daysAllowed);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), MAX_DAYS);
    return daysFromText(policy.text);
  }
  return daysFromText(policy);
};

/** What an order item keeps of its product's return policy. */
const snapshotReturnPolicy = (text) => (text ? { text, days: daysFromText(text) } : null);

/** The policy's words, from a snapshot (object or text). */
const policyText = (snapshot) => (snapshot && typeof snapshot === 'object' ? snapshot.text || null : snapshot || null);

module.exports = { DEFAULT_RETURN_WINDOW_DAYS, returnWindowDays, snapshotReturnPolicy, policyText };
