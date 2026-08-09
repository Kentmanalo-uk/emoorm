import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],
      toggleItem: (product) => set((state) => ({
        items: state.items.some((item) => item.id === product.id)
          ? state.items.filter((item) => item.id !== product.id)
          : [...state.items, product],
      })),
      removeItem: (productId) => set((state) => ({ items: state.items.filter((item) => item.id !== productId) })),
      clear: () => set({ items: [] }),
      isInWishlist: (productId) => get().items.some((item) => item.id === productId),
    }),
    { name: 'emoorm-wishlist', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export default useWishlistStore;
