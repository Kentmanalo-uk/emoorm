import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './config';
import { STORAGE_KEYS, refreshTokens } from '../api/client';
import { ID_PHOTO, uploadableImage } from './uploadableImage';

/*
 * POST a multipart form to the API; resolves to the answer's JSON.
 *
 * `fill(form)` adds the fields (called again for a retry, as a sent form
 * can't be reused everywhere). Like apiClient it renews a lapsed session
 * once: an app left open past the access token's life (a seller out
 * delivering, say) would otherwise have every photo refused with "Invalid or
 * expired token", since only apiClient calls renewed it.
 */
async function send(route, fill, failure = 'Upload failed') {
  const post = (token) => {
    const form = new FormData();
    fill(form);
    return fetch(`${API_BASE_URL}${route}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  };
  let response;
  let json;
  try {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    response = await post(token);
    if (response.status === 401 && token) {
      const fresh = await refreshTokens().catch(() => null);
      if (fresh) response = await post(fresh);
    }
    json = await response.json().catch(() => ({}));
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  if (response.status === 401) throw new Error('Your session has ended. Sign in again, then try once more.');
  if (response.status === 413) throw new Error('That photo is too large. Choose a smaller one.');
  if (!response.ok || !json?.success) throw new Error(json?.message || `${failure} (${response.status})`);
  return json;
}

const filePart = (asset, prefix) => asset.file || {
  uri: asset.uri,
  name: asset.fileName || `${prefix}-${Date.now()}.jpg`,
  type: asset.mimeType || 'image/jpeg',
};

// Any photo the phone can open: made a JPEG the server accepts first.
export async function uploadImage(picked) {
  if (!picked) throw new Error('No image selected');
  const asset = await uploadableImage(picked);
  const json = await send('/upload/image', (form) => form.append('file', filePart(asset, 'photo')));
  if (!json?.data?.url) throw new Error('Upload succeeded but no URL was returned');
  return json.data;
}

// A private photo (POST /upload/private-image): a payment or delivery proof,
// a chat or return photo. Never public: the API shows it through signed links
// to the people the order, chat or return is theirs. `url` is the reference
// to send; `previewUrl` shows it now.
export async function uploadPrivateImage(picked) {
  if (!picked) throw new Error('No image selected');
  const asset = await uploadableImage(picked);
  const json = await send('/upload/private-image', (form) => form.append('file', filePart(asset, 'photo')));
  if (!json?.data?.url) throw new Error('Upload succeeded but no URL was returned');
  return json.data;
}

// Uploads a sensitive KYC document (ID front/back, selfie) to a private,
// non-public storage location. The returned fileId is an opaque token, not a
// browsable URL — the document can only be viewed later via the authenticated
// GET /auth/users/:id/kyc-photo/:field endpoint.
export async function uploadKycDocument(picked) {
  if (!picked) throw new Error('No image selected');
  // Kept sharper: the ID's text is read from it.
  const asset = await uploadableImage(picked, { ...ID_PHOTO, prefix: 'kyc-document' });
  const json = await send('/upload/kyc', (form) => form.append('file', filePart(asset, 'kyc-document')));
  if (!json?.data?.fileId) throw new Error('Upload succeeded but no file reference was returned');
  return json.data;
}

export async function uploadReview({ productId, orderId, rating, comment, images = [], video }) {
  const photos = await Promise.all(images.slice(0, 5).map((picked) => uploadableImage(picked, { prefix: 'review-photo' })));
  const json = await send('/reviews', (form) => {
    form.append('productId', productId);
    if (orderId) form.append('orderId', orderId);
    form.append('rating', String(rating));
    if (comment?.trim()) form.append('comment', comment.trim());
    photos.forEach((asset, index) => {
      form.append('images', asset.file || {
        uri: asset.uri,
        name: asset.fileName || `review-photo-${Date.now()}-${index}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
    });
    if (video) {
      form.append('video', video.file || {
        uri: video.uri,
        name: video.fileName || `review-video-${Date.now()}.mp4`,
        type: video.mimeType || 'video/mp4',
      });
    }
  }, 'Review upload failed');
  return json.data;
}
