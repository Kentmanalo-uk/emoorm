import apiClient from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getCachedData, refreshCachedData, invalidateCachedData } from './dataCache';

/**
 * Shared reads for the reference data several screens need.
 *
 * Municipalities were being fetched independently by register, addresses,
 * checkout and seller-apply, and categories by home, products, seller and
 * seller-apply — so moving between tabs re-downloaded lists that change a few
 * times a year. These helpers route all of them through the existing
 * dataCache, which already de-duplicates concurrent callers (`pending`) and is
 * cleared on login and logout, so nothing survives an account switch.
 *
 * Only public reference data belongs here. Anything user-specific — cart,
 * orders, messages, profile — is deliberately absent and stays a live request.
 */

export const REFERENCE_KEYS = {
  municipalities: 'reference:municipalities',
  categories: 'reference:categories',
};

/** Matches the server-side TTLs in backend/src/config/env.js. */
const TTL = {
  municipalities: 30 * 60 * 1000,
  categories: 15 * 60 * 1000,
};

/**
 * Municipalities served by the platform.
 * @param {Object} [options]
 * @param {Boolean} [options.force] - Bypass the cached copy
 * @returns {Promise<Array>} Municipalities
 */
export const fetchMunicipalities = async ({ force = false } = {}) => {
  if (!force) {
    const cached = getCachedData(REFERENCE_KEYS.municipalities, TTL.municipalities);
    if (cached) return cached;
  }
  return refreshCachedData(
    REFERENCE_KEYS.municipalities,
    () => apiClient.get(ENDPOINTS.MUNICIPALITIES).then((res) => res.data || [])
  );
};

/**
 * Product categories.
 * @param {Object} [options]
 * @param {Boolean} [options.force] - Bypass the cached copy
 * @returns {Promise<Array>} Categories
 */
export const fetchCategories = async ({ force = false } = {}) => {
  if (!force) {
    const cached = getCachedData(REFERENCE_KEYS.categories, TTL.categories);
    if (cached) return cached;
  }
  return refreshCachedData(
    REFERENCE_KEYS.categories,
    () => apiClient.get(ENDPOINTS.CATEGORIES).then((res) => res.data || [])
  );
};

/** Drop the cached reference data, e.g. after an admin edit. */
export const invalidateReferenceData = () => invalidateCachedData('reference:');
