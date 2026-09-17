// Small helper to resolve backend-served media URLs (e.g. profile photos, product images).
// Uploaded files are stored on the backend at /uploads/... and served by express.static.
// The Vite dev server does not proxy /uploads, so we must prefix with the backend origin.

import { forLocalNetwork } from '../config/runtimeHost';

export const BACKEND_URL = forLocalNetwork(
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000',
);

export const resolveImg = (path) => {
  if (!path) return null;
  if (typeof path !== 'string') return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  if (path.startsWith('/')) return `${BACKEND_URL}${path}`;
  return `${BACKEND_URL}/${path}`;
};

export default resolveImg;
