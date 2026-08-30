import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Direct port of web/src/store/cartStore.js — cart is client-side only (no backend
// cart endpoints exist), persisted so it survives app restarts while logged in.
const useCartStore = create(
  persist(
(set, get) => ({
      items: [],
      selectedProductIds: [],

      addItem: (product, quantity = 1) => {
        const items = get().items;
        const existingItem = items.find((item) => item.id === product.id);

        if (product.stock !== undefined && product.stock === 0) {
          throw new Error('Product is out of stock');
        }

        if (existingItem) {
          const newQuantity = existingItem.quantity + quantity;
          if (product.stock !== undefined && newQuantity > product.stock) {
            throw new Error(`Only ${product.stock} items available in stock`);
          }
          set({
            items: items.map((item) =>
              item.id === product.id
                ? { ...item, quantity: newQuantity, stock: product.stock, price: Number(product.price) }
                : item
            ),
          });
        } else {
          if (product.stock !== undefined && quantity > product.stock) {
            throw new Error(`Only ${product.stock} items available in stock`);
          }
          set({
            items: [...items, { ...product, price: Number(product.price), quantity }],
          });
        }
      },

removeItem: (productId) => {
        set({
          items: get().items.filter((item) => item.id !== productId),
          selectedProductIds: get().selectedProductIds.filter((id) => id !== productId),
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        const item = get().items.find((item) => item.id === productId);
        if (item && item.stock !== undefined && quantity > item.stock) {
          throw new Error(`Only ${item.stock} items available in stock`);
        }
        set({
          items: get().items.map((item) => (item.id === productId ? { ...item, quantity } : item)),
        });
      },

clearCart: () => set({ items: [], selectedProductIds: [] }),

      toggleItem: (productId) => {
        const { selectedProductIds } = get();
        set({
          selectedProductIds: selectedProductIds.includes(productId)
            ? selectedProductIds.filter((id) => id !== productId)
            : [...selectedProductIds, productId],
        });
      },

      toggleStore: (storeId) => {
        const { items, selectedProductIds } = get();
        const storeItemIds = items
          .filter((item) => (item.storeId || 'unknown') === storeId)
          .map((item) => item.id);
        const allSelected = storeItemIds.every((id) => selectedProductIds.includes(id));
        set({
          selectedProductIds: allSelected
            ? selectedProductIds.filter((id) => !storeItemIds.includes(id))
            : [...new Set([...selectedProductIds, ...storeItemIds])],
        });
      },

      toggleAll: () => {
        const { items, selectedProductIds } = get();
        const allSelected = items.length > 0 && items.every((item) => selectedProductIds.includes(item.id));
        set({ selectedProductIds: allSelected ? [] : items.map((item) => item.id) });
      },

setSelectedItems: (ids) => set({ selectedProductIds: ids }),

      removeSelectedItems: () => {
        const { items, selectedProductIds } = get();
        set({
          items: items.filter((item) => !selectedProductIds.includes(item.id)),
          selectedProductIds: [],
        });
      },

      getTotalPrice: () => get().items.reduce((total, item) => total + item.price * item.quantity, 0),

      getItemCount: () => get().items.reduce((count, item) => count + item.quantity, 0),

      getItemsByStore: () => {
        const items = get().items;
        const storeMap = {};
        items.forEach((item) => {
          const storeId = item.storeId || 'unknown';
          if (!storeMap[storeId]) {
            storeMap[storeId] = { storeId, storeName: item.storeName || 'Unknown Store', items: [] };
          }
          storeMap[storeId].items.push(item);
        });
        return Object.values(storeMap);
      },

      isInCart: (productId) => get().items.some((item) => item.id === productId),

      getItem: (productId) => get().items.find((item) => item.id === productId),
    }),
    {
      name: 'emoorm-cart',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCartStore;
