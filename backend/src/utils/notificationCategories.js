/**
 * The notification inbox's groups (the app's Chats · Orders · Alerts · Promos
 * bar): every notification type belongs to exactly one. A type not listed
 * here (a new one) counts as an alert.
 */
const NOTIFICATION_CATEGORIES = {
  // Someone wrote: a shop or buyer, support, the admins, a product question or answer, a price offer.
  chats: [
    'STORE_MESSAGE', 'SUPPORT_MESSAGE', 'SUPPORT_RESOLVED', 'ADMIN_MESSAGE',
    'PRODUCT_QUESTION', 'PRODUCT_ANSWER', 'PRICE_OFFER',
  ],
  // An order or a return moved.
  orders: [
    'ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED',
    'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED',
    'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED', 'RETURN_DISPUTED', 'RETURN_DISPUTE_RESOLVED',
  ],
  // Followed shops' news and deals.
  promos: ['STORE_PROMOTION', 'PRICE_DROP', 'STORE_NEW_PRODUCT', 'STORE_ANNOUNCEMENT'],
  // The account itself: approvals, suspensions, reports, low stock, announcements.
  alerts: [
    'SYSTEM_ANNOUNCEMENT', 'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'SELLER_APPROVED', 'SELLER_SUSPENDED',
    'REPORT_SUBMITTED', 'REPORT_RESOLVED', 'SELLER_APPLICATION_SUBMITTED', 'ADMIN_ALERT', 'LOW_STOCK',
  ],
};

const CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES);

/** The group a notification type is in. */
const categoryOfType = (type) => CATEGORY_KEYS.find((key) => NOTIFICATION_CATEGORIES[key].includes(type)) || 'alerts';

/** A Prisma `type` condition for a group (alerts also takes any type no group lists). */
const typeWhereFor = (category) => {
  if (category !== 'alerts') return { in: NOTIFICATION_CATEGORIES[category] };
  const others = CATEGORY_KEYS.filter((key) => key !== 'alerts').flatMap((key) => NOTIFICATION_CATEGORIES[key]);
  return { notIn: others };
};

module.exports = {
  NOTIFICATION_CATEGORIES, CATEGORY_KEYS, categoryOfType, typeWhereFor,
};
