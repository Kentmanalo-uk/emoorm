import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './config';
import { STORAGE_KEYS } from '../api/client';

export async function uploadImage(asset) {
  if (!asset) throw new Error('No image selected');
  if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB');
  if (asset.mimeType && !/^image\/(jpe?g|png|webp)$/i.test(asset.mimeType)) {
    throw new Error('Only JPEG, PNG, or WebP images are allowed');
  }

  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const form = new FormData();
  form.append(
    'file',
    asset.file || {
      uri: asset.uri,
      name: asset.fileName || `payment-proof-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    }
  );

  const response = await fetch(`${API_BASE_URL}/upload/image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) throw new Error(json?.message || `Upload failed (${response.status})`);
  if (!json?.data?.url) throw new Error('Upload succeeded but no URL was returned');
  return json.data;
}

export async function uploadReview({ productId, orderId, rating, comment, images = [], video }) {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const form = new FormData();
  form.append('productId', productId);
  if (orderId) form.append('orderId', orderId);
  form.append('rating', String(rating));
  if (comment?.trim()) form.append('comment', comment.trim());

  images.slice(0, 5).forEach((asset, index) => {
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

  const response = await fetch(`${API_BASE_URL}/reviews`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) throw new Error(json?.message || `Review upload failed (${response.status})`);
  return json.data;
}
