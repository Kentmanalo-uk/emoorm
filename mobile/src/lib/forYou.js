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
 * Explore pages through one feed: its first page's answer carries the
 * signals it was asked with (res.signals), and later pages pass them back
 * (options.signals). Opening a product in between would otherwise reorder
 * the feed, and a product could move above the page boundary and never show.
 *
 * @param {String} [userId] - Whose recently viewed list to read
 * @param {Object} [options] - page, pageSize, skip, signals ({ viewed, terms })
 * @returns {Promise<Object>} The API's { data, pagination }, and signals
 */
export const fetchForYou = async (userId, {
  page = 1, pageSize = 20, skip = 0, signals,
} = {}) => {
  try {
    let asked = signals;
    if (!asked) {
      const [viewed, terms] = await Promise.all([recentlyViewed(userId), loadRecent()]);
      asked = {
        viewed: viewed.slice(0, MAX_VIEWED).map((p) => p.id).join(','),
        terms: terms.slice(0, MAX_TERMS).join('|'),
      };
    }
    const res = await apiClient.get('/products/for-you', {
      params: {
        page, pageSize, skip, ...asked,
      },
    });
    return { ...res, signals: asked };
  } catch {
    return apiClient.get('/products', { params: { page, pageSize, sortBy: 'createdAt', sortOrder: 'desc' } });
  }
};
