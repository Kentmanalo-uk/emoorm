import { API_CONFIG } from '../config/api';
import { beginActivity, endActivity } from './activity';
import { renewSession } from './axios';
import { uploadableImage } from './uploadableImage';

const readToken = () => localStorage.getItem('token') || localStorage.getItem('accessToken');

/**
 * POST a file to an upload route; resolves to the answer's `data`.
 *
 * Raw fetch, so the browser sets the multipart boundary (the shared axios
 * instance sends Content-Type: application/json, which breaks multipart).
 * Like axios it renews a lapsed session once: a page left open past the
 * access token's life (a seller out delivering, say) would otherwise have
 * every photo refused with "Invalid or expired token".
 */
async function send(route, file) {
  const post = (token) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${API_CONFIG.BASE_URL}${route}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  };

  // The activity bar shows while the photo goes up.
  beginActivity();
  let resp;
  let json;
  try {
    const token = readToken();
    resp = await post(token);
    if (resp.status === 401 && token) {
      const fresh = await renewSession().catch(() => null);
      if (fresh) resp = await post(fresh);
    }
    json = await resp.json().catch(() => ({}));
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  } finally {
    endActivity();
  }
  if (resp.status === 401) throw new Error('Your session has ended. Sign in again, then add the photo.');
  if (resp.status === 413) throw new Error('That photo is too large. Choose a smaller one.');
  if (!resp.ok || !json?.success) {
    throw new Error(json?.message || `Upload failed (${resp.status})`);
  }
  return json.data;
}

/**
 * Upload an image file to the backend.
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
  const data = await send('/upload/image', ready);
  if (!data?.url) throw new Error('Upload succeeded but no URL returned');
  return data;
}

/**
 * Upload a business paper or ID photo privately (POST /upload/kyc). Kept
 * sharp enough to read, like an ID. The answer is an opaque fileId, not a
 * URL: only the owner and the reviewing admin can open it.
 *
 * @param {File} file
 * @returns {Promise<{ fileId: string }>}
 */
export async function uploadKycDocument(file) {
  if (!file) throw new Error('No file selected');
  const ready = await uploadableImage(file, { document: true });
  const data = await send('/upload/kyc', ready);
  if (!data?.fileId) throw new Error('Upload succeeded but no file reference returned');
  return data;
}

/**
 * Upload a 3D model of a product (POST /upload/model3d): the GLB or USDZ
 * the 3D view editor built in this browser. The server checks the bytes.
 *
 * @param {Blob} blob
 * @param {'glb'|'usdz'} kind
 * @returns {Promise<{ url: string, filename: string, bytes: number }>}
 */
export async function uploadModel3d(blob, kind) {
  if (!blob) throw new Error('No 3D model to upload');
  const type = kind === 'usdz' ? 'model/vnd.usdz+zip' : 'model/gltf-binary';
  const file = new File([blob], `product.${kind === 'usdz' ? 'usdz' : 'glb'}`, { type });
  const data = await send('/upload/model3d', file);
  if (!data?.url) throw new Error('Upload succeeded but no URL returned');
  return data;
}
