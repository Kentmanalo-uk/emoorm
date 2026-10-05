import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../lib/config';
import { STORAGE_KEYS } from '../../api/client';

/*
 * A photo for a chat message (web Messenger.jsx handlePickImage + the
 * POST /upload/image in sendMessage): the same types, the same 5 MB limit
 * and the same words when a photo will not do.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const typeOf = (asset) => {
  const type = asset?.mimeType || asset?.file?.type;
  if (type) return type.toLowerCase();
  const ext = String(asset?.fileName || asset?.uri || '').split('?')[0].split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
};

/** Why a picked photo cannot be sent, or '' when it can. */
export function photoProblem(asset) {
  if (!IMAGE_TYPES.includes(typeOf(asset))) return 'Send a JPG, PNG, WebP or GIF photo.';
  const size = asset?.fileSize || asset?.file?.size || 0;
  if (size > MAX_IMAGE_BYTES) return 'That photo is over 5 MB. Choose a smaller one.';
  return '';
}

/** Uploads the photo and returns its URL. */
export async function uploadChatPhoto(asset) {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const type = typeOf(asset);
  const form = new FormData();
  form.append('file', asset.file || {
    uri: asset.uri,
    name: asset.fileName || `chat-photo-${Date.now()}.${type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]}`,
    type,
  });
  const response = await fetch(`${API_BASE_URL}/upload/image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) throw new Error(json?.message || 'Could not upload the photo');
  const url = json?.data?.url;
  if (!url) throw new Error('Could not upload the photo');
  return url;
}
