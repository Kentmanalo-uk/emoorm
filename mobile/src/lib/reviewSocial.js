import apiClient from '../api/client';

/**
 * Marking reviews helpful, and the comments under them — the actions in
 * the review photo viewer (web/src/lib/reviewSocial.js).
 *
 * Whether *you* liked a review is asked for separately from the reviews
 * themselves: the product's review list is publicly cacheable, so nothing
 * that differs per viewer can ride along in it.
 */

/** Mark helpful, or take the mark back. One call either way. */
export const toggleReviewLike = async (reviewId) => {
  const res = await apiClient.post(`/reviews/${reviewId}/like`);
  return res.data; // { liked, likeCount }
};

/**
 * Which of these reviews I have already marked helpful.
 * @param {String[]} reviewIds - the page in front of the viewer
 * @returns {Promise<String[]>} the ids they liked
 */
export const likedReviewIds = async (reviewIds) => {
  const ids = (reviewIds || []).filter(Boolean);
  if (!ids.length) return [];
  const res = await apiClient.get('/reviews/my/likes', { params: { ids: ids.join(',') } });
  return res.data?.liked || [];
};

export const listReviewComments = async (reviewId, { page = 1, pageSize = 20 } = {}) => {
  const res = await apiClient.get(`/reviews/${reviewId}/comments`, { params: { page, pageSize } });
  return { comments: res.data || [], pagination: res.pagination };
};

export const addReviewComment = async (reviewId, body) => {
  const res = await apiClient.post(`/reviews/${reviewId}/comments`, { body });
  return res.data;
};

export const deleteReviewComment = async (commentId) => {
  const res = await apiClient.delete(`/reviews/comments/${commentId}`);
  return res.data;
};

/**
 * Every photo and video across these reviews, flattened into the one list
 * the viewer pages through, each item remembering the review it came
 * from. That is what makes the counter read "3/22" across a product
 * rather than restarting at every review.
 */
export const reviewMediaItems = (reviews) => {
  const items = [];
  for (const review of reviews || []) {
    const images = Array.isArray(review.images) ? review.images : [];
    for (const src of images) items.push({ src, kind: 'image', review });
    if (review.videoUrl) items.push({ src: review.videoUrl, kind: 'video', review });
  }
  return items;
};
