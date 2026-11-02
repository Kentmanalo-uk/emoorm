import apiClient from '../api/client';
import { recentlyViewed } from '../components/profile/recentViews';
import { loadRecent } from './shellSearch';

const MAX_VIEWED = 20;
const MAX_TERMS = 5;

/**
 * Products picked for this person (backend recommendation.service): what they
 * opened and searched for lives on this phone and goes with the request, and
 * the server adds their orders, cart and wishlist. Clearing Recently Viewed or
 * the search history clears those signals too.
 *
 * Never the reason a page is empty: if the feed cannot answer, this is the
 * newest products instead.
 *
 * @param {String} [userId] - Whose recently viewed list to read
 * @param {Object} [options] - page, pageSize, skip (what is already shown above)
 * @returns {Promise<Object>} The API's { data, pagination }
 */
export const fetchForYou = async (userId, { page = 1, pageSize = 20, skip = 0 } = {}) => {
  try {
    const [viewed, terms] = await Promise.all([recentlyViewed(userId), loadRecent()]);
    return await apiClient.get('/products/for-you', {
      params: {
        page,
        pageSize,
        skip,
        viewed: viewed.slice(0, MAX_VIEWED).map((p) => p.id).join(','),
        terms: terms.slice(0, MAX_TERMS).join('|'),
      },
    });
  } catch {
    return apiClient.get('/products', { params: { page, pageSize, sortBy: 'createdAt', sortOrder: 'desc' } });
  }
};
