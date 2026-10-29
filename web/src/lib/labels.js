/*
 * Words for the codes the API sends (statuses, reasons, roles), the same on
 * every admin and seller screen, so nobody reads "INAPPROPRIATE_CONTENT" or
 * "Ready_for_pickup". Order statuses keep their own wording in
 * lib/orderProgress (statusLabel); everything else is here.
 *
 *   words('READY_FOR_PICKUP')           "Ready for pickup"   (any code)
 *   reportReason('SPAM', 'PRODUCT')     "Spam or duplicate listing"
 *   returnStatus('AWAITING_SHIPMENT')   "Waiting for the item"
 *   paymentStatus('PENDING_VERIFICATION') "Payment to check"
 *   roleLabel('MUNICIPAL_ADMIN')        "Municipal admin"
 */

/** Any SHOUTING_CODE as a sentence-case phrase; '' for nothing. */
export const words = (code) => {
  const text = String(code ?? '').trim();
  if (!text) return '';
  const spaced = text.replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

// What reporters chose (components/ReportModal.jsx offers the same choices).
const REPORT_REASONS = {
  PRODUCT: {
    COUNTERFEIT: 'Counterfeit or fake product',
    INAPPROPRIATE_CONTENT: 'Prohibited or illegal item',
    MISLEADING: 'Misleading description or photos',
    SPAM: 'Spam or duplicate listing',
  },
  SELLER: {
    FRAUD: 'Fraud or scam',
    ABUSIVE_BEHAVIOR: 'Harassment or abusive behaviour',
    INAPPROPRIATE_CONTENT: 'Selling prohibited items',
    MISLEADING: 'Item never arrived or was not as described',
    SPAM: 'Impersonation or spam',
  },
  BUYER: {
    NON_PAYMENT: 'Did not pay for the order',
    FAKE_ORDER: 'Fake or repeated bogus orders',
    ABUSIVE_BEHAVIOR: 'Harassment or abusive behaviour',
    FRAUD: 'Fraud or chargeback abuse',
    SPAM: 'Spam messages',
  },
};
const ANY_REASON = {
  COUNTERFEIT: 'Counterfeit or fake',
  INAPPROPRIATE_CONTENT: 'Prohibited or inappropriate',
  MISLEADING: 'Misleading',
  SPAM: 'Spam',
  FRAUD: 'Fraud or scam',
  ABUSIVE_BEHAVIOR: 'Abusive behaviour',
  NON_PAYMENT: 'Did not pay',
  FAKE_ORDER: 'Fake orders',
  OTHER: 'Something else',
};
export const reportReason = (reason, type) => REPORT_REASONS[type]?.[reason] || ANY_REASON[reason] || words(reason);

const REPORT_STATUS = {
  PENDING: 'New', UNDER_REVIEW: 'Being checked', RESOLVED: 'Resolved', DISMISSED: 'Dismissed',
};
export const reportStatus = (s) => REPORT_STATUS[s] || words(s);

const RETURN_STATUS = {
  REQUESTED: 'Waiting for the seller',
  APPROVED: 'Approved',
  AWAITING_SHIPMENT: 'Waiting for the item',
  RECEIVED: 'Item received',
  REFUNDED: 'Refunded',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
  DISPUTED: 'Disputed: admin decides',
};
export const returnStatus = (s) => RETURN_STATUS[s] || words(s);

const RETURN_REASON = {
  DAMAGED: 'Damaged', WRONG_ITEM: 'Wrong item', NOT_AS_DESCRIBED: 'Not as described', MISSING: 'Missing items', OTHER: 'Other',
};
export const returnReason = (r) => RETURN_REASON[r] || words(r);

const PAYMENT_STATUS = {
  PENDING: 'Not paid yet',
  PENDING_VERIFICATION: 'Payment to check',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  EXPIRED: 'Payment expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};
export const paymentStatus = (s) => PAYMENT_STATUS[s] || words(s);

const ROLES = {
  BUYER: 'Buyer', SELLER: 'Seller', MUNICIPAL_ADMIN: 'Municipal admin', SUPER_ADMIN: 'Super admin',
};
export const roleLabel = (r) => ROLES[r] || words(r);

const PRODUCT_STATUS = {
  PENDING: 'Waiting for approval', APPROVED: 'Approved', HIDDEN: 'Hidden', SUSPENDED: 'Suspended', ARCHIVED: 'Archived',
};
export const productStatus = (s) => PRODUCT_STATUS[s] || words(s);

const SUPPORT_STATUS = { OPEN: 'Open', RESOLVED: 'Resolved', CLOSED: 'Closed' };
export const supportStatus = (s) => SUPPORT_STATUS[s] || words(s);
