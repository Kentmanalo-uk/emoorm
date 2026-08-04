import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useCartStore = create(
  persist(
    (set, get) => ({
      // State
      items: [],

      // Actions
      addItem: (product, quantity = 1) => {
        const items = get().items;
        const existingItem = items.find(item => item.id === product.id);

        // Validate stock
        if (product.stock !== undefined && product.stock === 0) {
          throw new Error('Product is out of stock');
        }

        if (existingItem) {
          // Check if adding more would exceed stock
          const newQuantity = existingItem.quantity + quantity;
          if (product.stock !== undefined && newQuantity > product.stock) {
            throw new Error(`Only ${product.stock} items available in stock`);
          }

          // Update quantity
          set({
            items: items.map(item =>
              item.id === product.id
                ? { ...item, quantity: newQuantity, stock: product.stock, price: Number(product.price) }
                : item
            ),
          });
        } else {
          // Validate quantity doesn't exceed stock
          if (product.stock !== undefined && quantity > product.stock) {
            throw new Error(`Only ${product.stock} items available in stock`);
          }

          // Add new item — coerce price to Number (Prisma returns Decimal as string)
          set({
            items: [...items, { ...product, price: Number(product.price), quantity }],
          });
        }
      },

      removeItem: (productId) => {
        set({
          items: get().items.filter(item => item.id !== productId),
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }

        const item = get().items.find(item => item.id === productId);

        // Validate stock if available
        if (item && item.stock !== undefined && quantity > item.stock) {
          throw new Error(`Only ${item.stock} items available in stock`);
        }

        set({
          items: get().items.map(item =>
            item.id === productId ? { ...item, quantity } : item
          ),
        });
      },

      clearCart: () => {
        set({ items: [] });
      },

      // Getters
      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + (item.price * item.quantity),
          0
        );
      },

      getItemCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0);
      },

      getItemsByStore: () => {
        const items = get().items;
        const storeMap = {};

        items.forEach(item => {
          const storeId = item.storeId || 'unknown';
          if (!storeMap[storeId]) {
            storeMap[storeId] = {
              storeId,
              storeName: item.storeName || 'Unknown Store',
              items: [],
            };
          }
          storeMap[storeId].items.push(item);
        });

        return Object.values(storeMap);
      },

      // Check if product is in cart
      isInCart: (productId) => {
        return get().items.some(item => item.id === productId);
      },

      // Get specific item from cart
      getItem: (productId) => {
        return get().items.find(item => item.id === productId);
      },
    }),
    {
      name: 'emoorm-cart',
    }
  )
);

export default useCartStore;
