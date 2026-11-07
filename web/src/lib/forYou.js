import axios from './axios';
import { recentlyViewed } from './recentlyViewed';
import { loadRecent } from './buyerSearch';

const MAX_VIEWED = 20;
const MAX_TERMS = 5;

/**
 * Products picked for this person (backend recommendation.service), as the
 * app asks for them: what they opened and searched for lives in this browser
 * and goes with the request; the server adds their orders, cart and wishlist.
 * Clearing Recently Viewed or the search history clears those signals too.
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
    const asked = signals || {
      viewed: recentlyViewed(userId).slice(0, MAX_VIEWED).map((p) => p.id).join(','),
      terms: loadRecent().slice(0, MAX_TERMS).join('|'),
    };
    const res = await axios.get('/products/for-you', {
      quiet: true,
      params: {
        page, pageSize, skip, ...asked,
      },
    });
    return { ...res, signals: asked };
  } catch {
    return axios.get('/products', { params: { page, pageSize, sortBy: 'createdAt', sortOrder: 'desc' } });
  }
};
