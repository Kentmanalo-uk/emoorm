import { create } from 'zustand';
import useAuthStore from './authStore';
import useCartStore from './cartStore';

/**
 * Drives the account-switching overlay (personal ⇄ seller).
 * `request` is { id, target: 'seller' | 'personal', path } while a switch runs.
 * `shop` caches the seller's shop name/logo so the overlay can show it
 * immediately when entering the Seller Center.
 */
const SHOP_KEY = 'emoorm.sellerShop';

const readShop = () => {
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

let nextId = 1;

const useAccountSwitchStore = create((set, get) => ({
  request: null,
  shop: readShop(),
  start: (target, path) => {
    if (get().request) return;
    // Re-point the cart at the signed-in account so no other bucket leaks across the switch.
    useCartStore.getState().setOwner(useAuthStore.getState().user?.id || null);
    set({ request: { id: nextId++, target, path } });
  },
  finish: () => set({ request: null }),
  setShop: (shop) => {
    const next = shop ? { ownerId: shop.ownerId || null, name: shop.name || '', logo: shop.logo || null } : null;
    const current = get().shop;
    if (current?.ownerId === next?.ownerId && current?.name === next?.name && current?.logo === next?.logo) return;
    set({ shop: next });
    try {
      if (next) localStorage.setItem(SHOP_KEY, JSON.stringify(next));
      else localStorage.removeItem(SHOP_KEY);
    } catch {
      /* storage unavailable */
    }
  },
}));

export default useAccountSwitchStore;
