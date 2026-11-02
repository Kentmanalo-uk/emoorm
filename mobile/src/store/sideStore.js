import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from './authStore';

const KEY = 'emoorm.activeSide';

/*
 * Which side of the app an account is on: its personal (buyer) side or its
 * shop. A link, a notification, the back button or a restart never changes
 * this; only the explicit ways do: the switch buttons (RoleSwitchOverlay's
 * startAccountSwitch), the Seller Login, and the account picker.
 *
 * Without it the side was only ever which page happened to be open, so
 * anything that opened a page moved someone across. Both shells check it:
 * a page of the other side shows components/SideGate instead of opening.
 *
 * Kept per account, and read before the app opens (authStore.hydrate), so a
 * shop owner who left in their shop comes back to it.
 */
const useSideStore = create((set, get) => ({
  // { [userId]: 'shop' }. Anyone not listed is on their personal side.
  sides: {},

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ sides: raw ? JSON.parse(raw) : {} });
    } catch {
      set({ sides: {} });
    }
  },

  /** 'shop' or 'personal'. */
  setSide: (userId, side) => {
    if (!userId) return;
    const { [userId]: gone, ...rest } = get().sides;
    const sides = side === 'shop' ? { ...rest, [userId]: 'shop' } : rest;
    set({ sides });
    AsyncStorage.setItem(KEY, JSON.stringify(sides)).catch(() => {});
  },
}));

/** Whether this role has a shop to be on the side of. */
export const hasShopSide = (role) => role === 'SELLER' || role === 'SUPER_ADMIN';

/** The signed-in account's side: 'shop' or 'personal'. */
export const useActiveSide = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useSideStore((s) => (userId && s.sides[userId]) || 'personal');
};

export default useSideStore;
