// Mirrors web/src/config/api.js — grows incrementally as each phase is implemented.
export const ENDPOINTS = {
  HEALTH: '/health',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH_TOKEN: '/auth/refresh-token',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    PROFILE: '/auth/profile',
  },
  MUNICIPALITIES: '/municipalities',
  CATEGORIES: '/categories',
  PRODUCTS: '/products',
  PRODUCT_BY_SLUG: (slug) => `/products/slug/${slug}`,
  STORES: {
    LIST: '/stores',
    BY_ID: (id) => `/stores/${id}`,
    BY_SLUG: (slug) => `/stores/slug/${slug}`,
    COVERAGE: (id) => `/stores/${id}/coverage`,
  },
  REVIEWS: {
    BY_PRODUCT: (productId) => `/reviews/product/${productId}`,
    CREATE: '/reviews',
    MY_REVIEWS: '/reviews/my/reviews',
  },
  UPLOAD: {
    IMAGE: '/upload/image',
  },
  ORDERS: {
    CREATE: '/orders',
    MY_ORDERS: '/orders/my/orders',
    BY_ID: (id) => `/orders/${id}`,
    CANCEL: (id) => `/orders/${id}/cancel`,
  },
  NOTIFICATIONS: {
    LIST: '/notifications',
    UNREAD_COUNT: '/notifications/unread/count',
    MARK_READ: (id) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
    DELETE: (id) => `/notifications/${id}`,
  },
  MESSAGES: {
    CONVERSATIONS: '/messages/conversations',
    CONVERSATION: (id) => `/messages/conversations/${id}`,
    SEND: (id) => `/messages/conversations/${id}/messages`,
    MARK_READ: (id) => `/messages/conversations/${id}/read`,
  },
};
