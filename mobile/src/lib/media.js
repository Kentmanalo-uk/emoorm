import { API_BASE_URL } from './config';

// Mirrors web/src/lib/media.js — uploaded files live at <backend origin>/uploads/...,
// while API_BASE_URL points at <backend origin>/api, so strip the /api suffix.
export const BACKEND_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export const resolveImg = (path) => {
  if (!path || typeof path !== 'string') return null;
  // A phone cannot reach the PC's "localhost"; point such links at the backend instead.
  const local = path.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/);
  if (local) return `${BACKEND_URL}${local[1]}`;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export default resolveImg;
