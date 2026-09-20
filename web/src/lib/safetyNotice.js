// One source of truth for the scam-prevention copy shown inside every
// conversation — buyer, seller and admin support alike. The mobile app carries
// a matching copy at mobile/src/lib/safetyNotice.js; change the two together.
//
// The summary stays on one line so the strip never pushes the composer down;
// the tips are the detail behind it, revealed on demand.
export const SAFETY_SUMMARY = 'Keep payments and chats on E-MOORM.';

export const SAFETY_TIPS = [
  'Pay through E-MOORM checkout or on pickup. Never send money off-platform to reserve an item.',
  'Do not open links, QR codes or files sent by someone you do not know.',
  'Never share your password, OTP, PIN or ID details. E-MOORM staff will never ask for them.',
  'Payment and refund screenshots are easy to fake. Confirm in Orders, not in chat.',
  'Never pay a fee up front to claim a prize, a discount or to release a delivery.',
];
