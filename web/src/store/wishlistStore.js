import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product) => {
        const exists = get().items.find((i) => i.id === product.id);
        if (!exists) {
          set((state) => ({ items: [...state.items, product] }));
        }
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((i) => i.id !== productId) }));
      },

      toggleItem: (product) => {
        const exists = get().items.find((i) => i.id === product.id);
        if (exists) {
          set((state) => ({ items: state.items.filter((i) => i.id !== product.id) }));
        } else {
          set((state) => ({ items: [...state.items, product] }));
        }
      },

      isInWishlist: (productId) => get().items.some((i) => i.id === productId),

      getCount: () => get().items.length,

      clear: () => set({ items: [] }),
    }),
    { name: 'emoorm-wishlist' }
  )
);

export default useWishlistStore;
