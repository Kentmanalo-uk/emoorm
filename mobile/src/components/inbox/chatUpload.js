import { authedFetch } from '../../api/client';
import { uploadableImage } from '../../lib/uploadableImage';

/*
 * A photo for a chat message (web Messenger.jsx handlePickImage + the
 * POST /upload/private-image in sendMessage). Any photo the phone can open is sent:
 * it is made a JPEG the server accepts first (lib/uploadableImage).
 */

const typeOf = (asset) => {
  const type = asset?.mimeType || asset?.file?.type;
  if (type) return type.toLowerCase();
  const ext = String(asset?.fileName || asset?.uri || '').split('?')[0].split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
};

/** Why a picked file cannot be sent, or '' when it can (any picture can). */
export function photoProblem(asset) {
  if (!asset) return 'Choose a photo.';
  const type = String(asset.mimeType || asset.file?.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) return 'Send a photo.';
  return '';
}

/** Uploads the photo and returns its URL. */
export async function uploadChatPhoto(picked) {
  const asset = await uploadableImage(picked, { prefix: 'chat-photo' });
  const type = typeOf(asset);
  const name = asset.fileName || `chat-photo-${Date.now()}.${type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]}`;
  // authedFetch renews a lapsed session once (a fresh form for the retry).
  // Private: only the two sides of the chat see it.
  const response = await authedFetch('/upload/private-image', () => {
    const form = new FormData();
    form.append('file', asset.file || { uri: asset.uri, name, type });
    return { method: 'POST', body: form };
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) throw new Error(json?.message || 'Could not upload the photo');
  const url = json?.data?.url;
  if (!url) throw new Error('Could not upload the photo');
  return url;
}
