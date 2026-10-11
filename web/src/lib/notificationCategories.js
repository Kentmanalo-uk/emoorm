/**
 * The notification inbox's groups (Chats · Orders · Alerts · Promos), as the
 * server has them (backend/src/utils/notificationCategories.js): every
 * notification type is in exactly one, and a type no group lists is an alert.
 * GET /notifications?category=<key> lists one group, and every list answer
 * carries `unreadByCategory: { chats, orders, alerts, promos }`.
 */

export const NOTIFICATION_CATEGORIES = [
  { key: 'chats', label: 'Chats', colors: ['#86efac', '#16a34a'] },
  { key: 'orders', label: 'Orders', colors: ['#a5b4fc', '#4f46e5'] },
  { key: 'alerts', label: 'Alerts', colors: ['#fde68a', '#f59e0b'] },
  { key: 'promos', label: 'Promos', colors: ['#f5d0fe', '#c026d3'] },
];

// The types each group holds (alerts: any type not listed here).
const GROUP_TYPES = {
  chats: [
    'STORE_MESSAGE', 'SUPPORT_MESSAGE', 'SUPPORT_RESOLVED', 'ADMIN_MESSAGE',
    'PRODUCT_QUESTION', 'PRODUCT_ANSWER', 'PRICE_OFFER',
  ],
  orders: [
    'ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED',
    'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED',
    'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED', 'RETURN_DISPUTED', 'RETURN_DISPUTE_RESOLVED',
  ],
  promos: ['STORE_PROMOTION', 'PRICE_DROP', 'STORE_NEW_PRODUCT', 'STORE_ANNOUNCEMENT'],
};

/** The group a notification type is in. */
export const categoryOfType = (type) => (
  Object.keys(GROUP_TYPES).find((key) => GROUP_TYPES[key].includes(type)) || 'alerts'
);

/** A group's name ("Orders"), or '' for none. */
export const categoryLabel = (key) => NOTIFICATION_CATEGORIES.find((c) => c.key === key)?.label || '';

/** The unread counts after one notification of `type` was read. */
export const minusOne = (counts, type) => {
  const key = categoryOfType(type);
  return { ...counts, [key]: Math.max(0, (counts?.[key] || 0) - 1) };
};
