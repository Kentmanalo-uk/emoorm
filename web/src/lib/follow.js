import axios from './axios';

/**
 * Store Follow API + cross-tab broadcast helper.
 * Uses BroadcastChannel when available so multiple open tabs stay in sync.
 */

const CHANNEL_NAME = 'emoorm-store-follow';
let channel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL_NAME);
} catch {
  channel = null;
}

const emit = (payload) => {
  if (channel) {
    try { channel.postMessage(payload); } catch { /* noop */ }
  }
  // Also fire a local window event so same-tab listeners react without reload
  try {
    window.dispatchEvent(new CustomEvent('store-follow-change', { detail: payload }));
  } catch { /* noop */ }
};

export const subscribeToFollowChanges = (handler) => {
  const onMessage = (e) => handler(e.data);
  const onLocal = (e) => handler(e.detail);
  if (channel) channel.addEventListener('message', onMessage);
  window.addEventListener('store-follow-change', onLocal);
  return () => {
    if (channel) channel.removeEventListener('message', onMessage);
    window.removeEventListener('store-follow-change', onLocal);
  };
};

export const getFollowStatus = async (storeId) => {
  const res = await axios.get(`/follows/status/${storeId}`);
  return res.data; // { following, followerCount, notificationsEnabled }
};

export const followStore = async (storeId) => {
  const res = await axios.post(`/follows/${storeId}`);
  emit({ type: 'follow', storeId, data: res.data });
  return res.data;
};

export const unfollowStore = async (storeId) => {
  const res = await axios.delete(`/follows/${storeId}`);
  emit({ type: 'unfollow', storeId, data: res.data });
  return res.data;
};

export const setFollowNotifications = async (storeId, enabled) => {
  const res = await axios.patch(`/follows/${storeId}/notifications`, { enabled });
  emit({ type: 'notifications', storeId, data: res.data });
  return res.data;
};

export const listMyFollowing = async ({ search, sort } = {}) => {
  const res = await axios.get('/follows/me', { params: { search, sort } });
  return res.data;
};

export const getSellerFollowerStats = async (storeId) => {
  const res = await axios.get(`/follows/store/${storeId}/stats`);
  return res.data;
};
