import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../api/client';
import useAuthStore from '../../store/authStore';
import useWishlistStore from '../../store/wishlistStore';

/*
 * The account's saved wishlist (GET/PUT /me/wishlist), as the website's
 * wishlist store keeps it: the account holds the product ids in order. Items
 * saved on this device by the same account that the account does not have yet
 * are kept and sent; another account's items on a shared phone are not.
 */
const OWNER_KEY = 'emoorm-wishlist-owner';
const idsOf = (items) => items.map((i) => i.id).join(',');

export const saveWishlist = async (items = useWishlistStore.getState().items) => {
  try {
    await apiClient.put('/me/wishlist', { productIds: items.map((i) => i.id) });
  } catch {
    // Sent again with the next change.
  }
};

/** Reads the account's list into the app's wishlist; returns the items. */
export const syncWishlist = async () => {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return useWishlistStore.getState().items;
  let saved;
  try {
    const res = await apiClient.get('/me/wishlist');
    saved = (res.data || []).filter((p) => p && !p.deletedAt);
  } catch {
    return useWishlistStore.getState().items;
  }
  const owner = await AsyncStorage.getItem(OWNER_KEY).catch(() => null);
  const local = useWishlistStore.getState().items;
  const have = new Set(saved.map((p) => p.id));
  const extra = owner === String(userId) ? local.filter((p) => !have.has(p.id)) : [];
  const items = [...saved, ...extra];
  if (idsOf(items) !== idsOf(local)) useWishlistStore.setState({ items });
  AsyncStorage.setItem(OWNER_KEY, String(userId)).catch(() => {});
  if (extra.length) saveWishlist(items);
  return items;
};
