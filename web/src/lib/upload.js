import { API_CONFIG } from '../config/api';
import { beginActivity, endActivity } from './activity';
import { uploadableImage } from './uploadableImage';

/**
 * Upload an image file to the backend. Uses raw fetch so the browser sets the
 * multipart/form-data boundary correctly (the shared axios instance defaults
 * Content-Type: application/json which breaks multipart parsing).
 *
 * Any photo goes: the browser shrinks what it can open to a sensible JPEG and
 * sends the rest (HEIC, TIFF...) as it is for the server to convert. When the
 * server refuses one, its own message is what gets thrown.
 *
 * @param {File} file
 * @param {{ document?: Boolean }} [options] - document: an ID/KYC photo, kept larger and sharper
 * @returns {Promise<{ url: string, filename: string }>} the stored path (e.g. /uploads/xxx.jpg)
 */
export async function uploadImage(file, options) {
  if (!file) throw new Error('No file selected');
  const ready = await uploadableImage(file, options);

  const token =
    localStorage.getItem('token') || localStorage.getItem('accessToken');

  const fd = new FormData();
  fd.append('file', ready);

  // The activity bar shows while the photo goes up.
  beginActivity();
  let resp;
  let json;
  try {
    resp = await fetch(`${API_CONFIG.BASE_URL}/upload/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    json = await resp.json().catch(() => ({}));
  } finally {
    endActivity();
  }
  if (!resp.ok || !json?.success) {
    throw new Error(json?.message || `Upload failed (${resp.status})`);
  }
  if (!json?.data?.url) throw new Error('Upload succeeded but no URL returned');
  return json.data;
}
