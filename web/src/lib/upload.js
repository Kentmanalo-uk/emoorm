import { API_CONFIG } from '../config/api';
import { beginActivity, endActivity } from './activity';

/**
 * Upload an image file to the backend. Uses raw fetch so the browser sets the
 * multipart/form-data boundary correctly (the shared axios instance defaults
 * Content-Type: application/json which breaks multipart parsing).
 *
 * @param {File} file
 * @returns {Promise<{ url: string, filename: string }>} the stored path (e.g. /uploads/xxx.jpg)
 */
export async function uploadImage(file) {
  if (!file) throw new Error('No file selected');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB');
  if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are allowed');
  }

  const token =
    localStorage.getItem('token') || localStorage.getItem('accessToken');

  const fd = new FormData();
  fd.append('file', file);

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
