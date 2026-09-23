/**
 * The SupportCategory enum, in the order a person is most likely to need it.
 *
 * Shared by the Help & Support page and the support chat: both open cases, so
 * the list a buyer picks from has to be the same one in both places.
 */
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

/** SupportConversationStatus, as a person reads it. */
export const CASE_STATUS_LABELS = { OPEN: 'Open', RESOLVED: 'Resolved', CLOSED: 'Closed' };

export const SUBJECT_MAX = 160;
export const MESSAGE_MAX = 4000;
