// Small helper to resolve backend-served media URLs (e.g. profile photos, product images).
// Uploaded files are stored on the backend at /uploads/... and served by express.static.
// The Vite dev server does not proxy /uploads, so we must prefix with the backend origin.

import { forLocalNetwork } from '../config/runtimeHost';

/**
 * In production the API process serves this app too, so /uploads is on the
 * same origin and an empty prefix keeps every image URL relative — correct on
 * any hostname, and unaffected by a missing env file. In development the Vite
 * dev server runs on a different port and does not proxy /uploads, so the
 * absolute backend origin is required.
 *
 * Without this, a production build asked every visitor's browser for images
 * from http://localhost:3000 and none of them loaded.
 */
const DEFAULT_BACKEND_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';

export const BACKEND_URL = forLocalNetwork(
  import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL,
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

/**
 * A product's images as a list, whatever shape the API gave them in: a list,
 * a JSON list in a string (older rows), or one plain path.
 */
export const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
};

/** A product's first image (any of the shapes above), or null. */
export const firstImage = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] || null : raw;
    } catch {
      return raw;
    }
  }
  return null;
};
