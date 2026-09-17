import axios from './axios';

/**
 * Seller Center tutorial progress is stored on the seller's shop
 * (store.sellerGuides), so it follows the seller to every device.
 * Tutorials only run once a shop exists.
 */
export const shouldShowGuide = (store, key) => {
  if (!store?.id) return false;
  const done = store.sellerGuides;
  if (!done || typeof done !== 'object') return true;
  return !done.all && !done[key];
};

/** Marks a tutorial finished locally right away, then saves it. */
export const completeGuide = (key, setStore) => {
  setStore?.((prev) => (prev
    ? { ...prev, sellerGuides: { ...(prev.sellerGuides || {}), [key]: true } }
    : prev));
  return axios.put('/stores/my/guides', { key })
    .then((res) => {
      setStore?.((prev) => (prev ? { ...prev, sellerGuides: res.data } : prev));
    })
    .catch(() => { /* retried next time the tutorial would show */ });
};
