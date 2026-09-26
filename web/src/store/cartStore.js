import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from '../lib/axios';
import { priceForSelection, pricedVariation } from '../lib/variantPricing';

// Carts are kept per owner (user id or 'guest'). `items` mirrors the active
// owner's bucket so every existing consumer keeps reading `items` directly.
const GUEST = 'guest';
const ownerKey = (userId) => (userId ? String(userId) : GUEST);

// The DB stores `images` as JSON; some rows come back stringified.
const firstImage = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] || null : raw;
    } catch {
      return raw;
    }
  }
  return null;
};

// Merge two line lists by line id, summing quantities (capped to known stock).
const mergeLines = (base, incoming) => {
  const byId = new Map(base.map((line) => [line.id, { ...line }]));
  incoming.forEach((line) => {
    const existing = byId.get(line.id);
    if (!existing) {
      byId.set(line.id, { ...line });
      return;
    }
    let quantity = existing.quantity + line.quantity;
    const stock = line.stock ?? existing.stock;
    if (stock !== undefined && stock !== null && quantity > stock) quantity = Math.max(1, stock);
    byId.set(line.id, { ...existing, ...line, quantity });
  });
  return [...byId.values()];
};

const useCartStore = create(
  persist(
    (set, get) => {
      // Write the active bucket and its mirror in one update.
      const commit = (items) => {
        const { owner, carts } = get();
        set({ items, carts: { ...carts, [owner]: items } });
      };

      return {
        // State
        owner: GUEST,
        carts: { [GUEST]: [] },
        items: [],

        // Switch the active bucket. Logging in merges the guest cart into the
        // user's cart; logging out returns to the (now empty) guest bucket.
        setOwner: (userId) => {
          const key = ownerKey(userId);
          const { owner, carts } = get();
          const nextCarts = { ...carts };
          if (!nextCarts[key]) nextCarts[key] = [];
          if (key !== owner && key !== GUEST && (nextCarts[GUEST] || []).length) {
            nextCarts[key] = mergeLines(nextCarts[key], nextCarts[GUEST]);
            nextCarts[GUEST] = [];
          }
          set({ owner: key, carts: nextCarts, items: nextCarts[key] });
        },

        // Actions
        addItem: (product, quantity = 1) => {
          const items = get().items;
          const variationKey = product.selectedVariations
            ? JSON.stringify(product.selectedVariations)
            : '';
          const cartKey = product.cartKey || `${product.id}:${variationKey}`;
          const existingItem = items.find((item) => item.id === cartKey);

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

            commit(items.map((item) => (
              item.id === cartKey
                ? { ...item, quantity: newQuantity, stock: product.stock, price: Number(product.price), unavailable: false, unavailableReason: null }
                : item
            )));
          } else {
            // Validate quantity doesn't exceed stock
            if (product.stock !== undefined && quantity > product.stock) {
              throw new Error(`Only ${product.stock} items available in stock`);
            }

            // Add new item — coerce price to Number (Prisma returns Decimal as string)
            commit([...items, {
              ...product,
              id: cartKey,
              productId: product.productId || product.id,
              price: Number(product.price),
              quantity,
              unavailable: false,
              unavailableReason: null,
            }]);
          }
        },

        removeItem: (productId) => {
          commit(get().items.filter((item) => item.id !== productId && item.productId !== productId));
        },

        updateQuantity: (productId, quantity) => {
          if (quantity <= 0) {
            get().removeItem(productId);
            return;
          }

          const item = get().items.find((line) => line.id === productId);

          // Validate stock if available
          if (item && item.stock !== undefined && quantity > item.stock) {
            throw new Error(`Only ${item.stock} items available in stock`);
          }

          commit(get().items.map((line) => (
            line.id === productId ? { ...line, quantity } : line
          )));
        },

        // Apply partial updates to several lines at once: { [lineId]: patch }.
        patchItems: (patches) => {
          if (!patches || Object.keys(patches).length === 0) return;
          commit(get().items.map((line) => (
            patches[line.id] ? { ...line, ...patches[line.id] } : line
          )));
        },

        clearCart: () => {
          commit([]);
        },

        // Refresh every line against GET /products/:id. Updates price, name,
        // image, stock and store name; flags lines that are gone, not APPROVED
        // or out of stock as `unavailable`; caps quantity to stock.
        // Resolves to { capped: [names], unavailable: [names] }.
        revalidate: async () => {
          const items = get().items;
          const productIds = [...new Set(items.map((line) => line.productId || line.id))];
          if (productIds.length === 0) return { capped: [], unavailable: [] };

          const results = await Promise.allSettled(productIds.map((id) => axios.get(`/products/${id}`)));
          const products = new Map();
          results.forEach((result, index) => {
            const id = productIds[index];
            if (result.status === 'fulfilled') {
              products.set(id, { product: result.value?.data || null });
            } else {
              products.set(id, { product: null, status: result.reason?.status });
            }
          });

          const patches = {};
          const capped = [];
          const unavailable = [];
          get().items.forEach((line) => {
            const entry = products.get(line.productId || line.id);
            if (!entry) return;
            const { product, status } = entry;
            // Network / server failures leave the line as it was.
            if (!product && status !== 404) return;

            const gone = !product || status === 404;
            const notApproved = !gone && product.status !== 'APPROVED';
            const stock = gone ? 0 : Number(product.stock ?? 0);
            const patch = { unavailable: false, unavailableReason: null };
            if (!gone) {
              patch.name = product.name ?? line.name;
              // The line's chosen option sets its price when the product is
              // priced per option.
              patch.price = priceForSelection(product, line.selectedVariations) || Number(line.price);
              patch.image = firstImage(product.images) || line.image;
              patch.stock = stock;
              patch.slug = product.slug || line.slug;
              patch.storeId = product.storeId || product.store?.id || line.storeId;
              patch.storeName = product.store?.name || line.storeName;
              patch.storeLogo = product.store?.logo || product.store?.logoUrl || line.storeLogo || null;
              patch.categoryId = product.categoryId || line.categoryId;
            }
            // The chosen option may have been removed since it was added.
            const group = !gone ? pricedVariation(product.variations) : null;
            const optionGone = group && line.selectedVariations
              && !group.options.includes(line.selectedVariations[group.name]);
            if (gone) {
              patch.unavailable = true;
              patch.unavailableReason = 'This product is no longer available';
            } else if (optionGone) {
              patch.unavailable = true;
              patch.unavailableReason = 'This option is no longer available';
            } else if (notApproved) {
              patch.unavailable = true;
              patch.unavailableReason = 'This product is not available right now';
            } else if (stock <= 0) {
              patch.unavailable = true;
              patch.unavailableReason = 'Out of stock';
            } else if (line.quantity > stock) {
              patch.quantity = stock;
              capped.push(line.name);
            }
            if (patch.unavailable) unavailable.push(line.name);
            patches[line.id] = patch;
          });
          get().patchItems(patches);
          return { capped, unavailable };
        },

        // Getters (unavailable lines never count toward totals)
        getTotalPrice: () => {
          return get().items.reduce(
            (total, item) => (item.unavailable ? total : total + (item.price * item.quantity)),
            0
          );
        },

        getItemCount: () => {
          return get().items.reduce((count, item) => (item.unavailable ? count : count + item.quantity), 0);
        },

        getItemsByStore: () => {
          const items = get().items;
          const storeMap = {};

          items.forEach((item) => {
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
          return get().items.some((item) => item.id === productId || item.productId === productId);
        },

        // Get specific item from cart
        getItem: (productId) => {
          return get().items.find((item) => item.id === productId || item.productId === productId);
        },
      };
    },
    {
      name: 'emoorm-cart',
      version: 1,
      partialize: (state) => ({ owner: state.owner, carts: state.carts }),
      // v0 stored a single `{ items }` list: it becomes the guest bucket.
      migrate: (persisted, version) => {
        if (version === 0 || !persisted?.carts) {
          return { owner: GUEST, carts: { [GUEST]: Array.isArray(persisted?.items) ? persisted.items : [] } };
        }
        return persisted;
      },
      merge: (persisted, current) => {
        const owner = persisted?.owner || GUEST;
        const carts = persisted?.carts && typeof persisted.carts === 'object' ? persisted.carts : { [GUEST]: [] };
        if (!carts[owner]) carts[owner] = [];
        return { ...current, owner, carts, items: carts[owner] };
      },
    }
  )
);

export default useCartStore;
