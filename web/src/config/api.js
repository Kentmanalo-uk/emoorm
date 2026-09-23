// API Configuration
import { forLocalNetwork } from './runtimeHost';

/**
 * Where the API lives.
 *
 * A production build defaults to a relative path because the API is served by
 * the same process and origin as this app: relative means the bundle works on
 * whatever hostname it is deployed to, with no rebuild per environment and no
 * CORS. Development keeps the absolute localhost URL, since Vite serves the
 * app on a different port from the API.
 *
 * The default is in code rather than only in .env.production because env
 * files are gitignored here — a checkout that lacks one would otherwise build
 * a production bundle that calls localhost. VITE_API_URL still overrides it,
 * which is what a split frontend/API deployment would set.
 */
const DEFAULT_BASE_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export const API_CONFIG = {
  BASE_URL: forLocalNetwork(import.meta.env.VITE_API_URL || DEFAULT_BASE_URL),
  TIMEOUT: 30000,
};

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    PROFILE: '/auth/profile',
    REFRESH: '/auth/refresh',
    APPLY_SELLER: '/auth/apply-seller',
    PENDING_SELLERS: '/auth/pending-sellers',
    APPROVE_SELLER: (id) => `/auth/approve-seller/${id}`,
    USERS: '/auth/users',
    USER_STATUS: (id) => `/auth/users/${id}/status`,
  },
  
  // Municipalities
  MUNICIPALITIES: {
    LIST: '/municipalities',
    GET: (id) => `/municipalities/${id}`,
    BY_CODE: (code) => `/municipalities/code/${code}`,
  },
  
  // Categories
  CATEGORIES: {
    LIST: '/categories',
    GET: (id) => `/categories/${id}`,
    BY_SLUG: (slug) => `/categories/slug/${slug}`,
  },
  
  // Stores
  STORES: {
    LIST: '/stores',
    CREATE: '/stores',
    GET: (id) => `/stores/${id}`,
    UPDATE: (id) => `/stores/${id}`,
    BY_SELLER: (id) => `/stores/seller/${id}`,
    BY_MUNICIPALITY: (id) => `/stores/municipality/${id}`,
    VERIFY: (id) => `/stores/${id}/verify`,
    STATUS: (id) => `/stores/${id}/status`,
    PRODUCTS: (id) => `/stores/${id}/products`,
  },
  
  // Products
  PRODUCTS: {
    LIST: '/products',
    CREATE: '/products',
    GET: (id) => `/products/${id}`,
    UPDATE: (id) => `/products/${id}`,
    BY_CATEGORY: (id) => `/products/category/${id}`,
    BY_STORE: (id) => `/products/store/${id}`,
    FEATURED: '/products/featured',
    APPROVE: (id) => `/products/${id}/approve`,
    STATUS: (id) => `/products/${id}/status`,
    REVIEWS: (id) => `/products/${id}/reviews`,
  },
  
  // Orders
  ORDERS: {
    LIST: '/orders',
    CREATE: '/orders',
    GET: (id) => `/orders/${id}`,
    BUYER: '/orders/buyer',
    SELLER: '/orders/seller',
    STATUS: (id) => `/orders/${id}/status`,
    CANCEL: (id) => `/orders/${id}/cancel`,
  },
  
  // Reviews
  REVIEWS: {
    LIST: '/reviews',
    CREATE: '/reviews',
    UPDATE: (id) => `/reviews/${id}`,
    BY_PRODUCT: (id) => `/reviews/product/${id}`,
    BY_USER: '/reviews/user',
    STATS: (id) => `/reviews/product/${id}/stats`,
  },
  
  // Reports
  REPORTS: {
    LIST: '/reports',
    CREATE: '/reports',
    GET: (id) => `/reports/${id}`,
    BY_USER: '/reports/user',
    RESOLVE: (id) => `/reports/${id}/resolve`,
  },
  
  // Notifications
  NOTIFICATIONS: {
    LIST: '/notifications',
    GET: (id) => `/notifications/${id}`,
    UNREAD: '/notifications/unread',
    COUNT: '/notifications/count',
    READ: (id) => `/notifications/${id}/read`,
    READ_ALL: '/notifications/read-all',
    DELETE: (id) => `/notifications/${id}`,
  },
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
};
