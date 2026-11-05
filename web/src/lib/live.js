import axios from './axios';
import { API_CONFIG } from '../config/api';

/*
 * Live selling: the website's door to livestream/ (the module at the root
 * of the repo, which the backend serves at /api/live). The video itself
 * goes through livestream/client (publisher, player); this file is the
 * plain JSON calls and the addresses.
 */

export { LivePublisher, liveSupport } from '../../../livestream/client/publisher';
export { LivePlayer, preloadLive, liveCanPlay } from '../../../livestream/client/player';
export { followLive, heartSender, viewerId } from '../../../livestream/client/events';

/** Where the live module answers (absolute in development, /api/live when built). */
export const LIVE_BASE = `${API_CONFIG.BASE_URL.replace(/\/$/, '')}/live`;

export const liveThumb = (live) => (live?.hasThumb ? `${LIVE_BASE}/${live.id}/thumb.jpg?t=${live.thumbAt || 0}` : null);

/** Lives on now, most watched first (one shop's with `storeId`). */
export const listLives = async (storeId) => {
  const res = await axios.get('/live', { params: storeId ? { storeId } : undefined, quiet: true });
  return res.data || [];
};

export const getLive = async (id) => (await axios.get(`/live/${id}`)).data;

export const startLive = async ({ title, productIds }) => (await axios.post('/live', { title, productIds })).data;

export const endLive = async (id) => (await axios.post(`/live/${id}/end`, {}, { quiet: true })).data;

export const pinProduct = async (id, productId) => (await axios.post(`/live/${id}/pin`, { productId }, { quiet: true })).data;

export const setLiveBag = async (id, productIds) => (await axios.put(`/live/${id}/bag`, { productIds })).data;

export const sendComment = async (id, text) => (await axios.post(`/live/${id}/comments`, { text }, { quiet: true })).data;

export const hideComment = async (id, commentId) => (await axios.post(`/live/${id}/comments/${commentId}/hide`, {}, { quiet: true })).data;

/** "12:05" or "1:02:05" from seconds. */
export const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** 1.2k, 15k. */
export const compact = (n) => {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(v / 1000)}k`;
};
