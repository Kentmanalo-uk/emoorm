import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from '../lib/axios';
import { priceForSelection, pricedVariation, stockForSelection, priceTiersOf } from '../lib/variantPricing';
import { firstImage } from '../lib/media';
import { awayUntil, shortDate } from '../lib/shopHours';
import { isTodayProduct, isOpen as windowOpen } from '../lib/availability';

// Carts are kept per owner (user id or 'guest'). `items` mirrors the active
// owner's bucket so every existing consumer keeps reading `items` directly.
// Options in a fixed order, so one choice always gives the same line id
// (the account's saved cart stores them sorted).
const sortedOptions = (selected) => (selected && typeof selected === 'object'
  ? Object.fromEntries(Object.keys(selected).sort().map((k) => [k, selected[k]]))
  : selected);

/** A cart line's id: the product and its chosen options (Buy Now opens checkout with it). */
export const cartKeyFor = (product) => product.cartKey
  || `${product.id}:${product.selectedVariations ? JSON.stringify(sortedOptions(product.selectedVariations)) : ''}`;

const GUEST = 'guest';
const ownerKey = (userId) => (userId ? String(userId) : GUEST);

// Bulk prices: a line keeps its one-unit price (basePrice) and the product's
// tiers, and its price follows the quantity. The server prices it the same way.
const withTierPrice = (line) => {
  const tiers = Array.isArray(line.priceTiers) ? line.priceTiers : [];
  if (!tiers.length) return line;
  const base = Number(line.basePrice ?? line.price);
  const tier = tiers.filter((t) => line.quantity >= t.minQty).pop();
  const price = tier && tier.price < base ? tier.price : base;
  return price === line.price && line.basePrice != null ? line : { ...line, basePrice: base, price };
};

// A line rebuilt from the account's saved cart (GET /me/cart).
const lineFromSaved = (row) => withTierPrice(savedLine(row));
const savedLine = ({ product, selectedVariations, quantity }) => {
  const stock = stockForSelection(product, selectedVariations);
  const gone = Boolean(product.deletedAt) || product.status !== 'APPROVED';
  return {
    id: cartKeyFor({ id: product.id, selectedVariations }),
    productId: product.id,
    name: product.name,
    slug: product.slug,
    price: priceForSelection(product, selectedVariations) || Number(product.price),
    basePrice: priceForSelection(product, selectedVariations) || Number(product.price),
    priceTiers: priceTiersOf(product),
    image: firstImage(product.images),
    images: product.images,
    stock,
    storeId: product.storeId,
    storeName: product.store?.name,
    storeLogo: product.store?.logo || null,
    categoryId: product.categoryId,
    variations: product.variations,
    selectedVariations: selectedVariations || null,
    quantity,
    unavailable: gone || stock <= 0,
    unavailableReason: gone ? 'This product is not available right now' : stock <= 0 ? 'Out of stock' : null,
  };
};

// The same line on two devices: the larger quantity wins, nothing is added twice.
const unionLines = (saved, local) => {
  const byId = new Map(saved.map((line) => [line.id, line]));
  local.forEach((line) => {
    const id = cartKeyFor({ id: line.productId || line.id, selectedVariations: line.selectedVariations });
    const have = byId.get(id);
    byId.set(id, have ? { ...have, quantity: Math.max(have.quantity, line.quantity) } : { ...line, id });
  });
  return [...byId.values()];
};

// What the account stores of a cart: products, options and quantities. Price
// and stock refreshes change lines without changing this.
const savedShape = (items) => items
  .map((line) => `${line.productId || line.id}|${JSON.stringify(sortedOptions(line.selectedVariations) || null)}|${line.quantity}`)
  .join(',');

// Saving to the account waits for a pause in changes (a few taps on +).
let saveTimer = null;

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
      // Send the signed-in owner's cart to the account.
      const save = async () => {
        const { owner, items } = get();
        if (owner === GUEST) return;
        try {
          await axios.put('/me/cart', {
            items: items.map((line) => ({
              productId: line.productId || line.id,
              selectedVariations: line.selectedVariations || null,
              quantity: line.quantity,
            })),
          });
          // Saved, unless the account changed or the cart moved on meanwhile.
          if (get().owner === owner && savedShape(get().items) === savedShape(items)) {
            set({ unsaved: { ...get().unsaved, [owner]: false } });
          }
        } catch {
          // Stays unsaved: the next change or sign-in sends it again.
        }
      };
      const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 800);
      };

      // Write the active bucket and its mirror in one update. A signed-in
      // owner's change is saved to the account shortly after.
      const commit = (rawItems) => {
        const items = rawItems.map(withTierPrice);
        const { owner, carts, unsaved, items: before } = get();
        set({ items, carts: { ...carts, [owner]: items } });
        if (owner !== GUEST && savedShape(items) !== savedShape(before)) {
          if (!unsaved[owner]) set({ unsaved: { ...unsaved, [owner]: true } });
          scheduleSave();
        }
      };

      // Read the account's saved cart. Changes made here and not yet saved
      // are kept alongside it; otherwise the saved cart is the cart.
      const loadSaved = async (key) => {
        let saved;
        try {
          const res = await axios.get('/me/cart');
          saved = (res.data || []).filter((row) => row?.product).map(lineFromSaved);
        } catch {
          return;
        }
        if (get().owner !== key) return;
        const pending = get().unsaved[key];
        const items = pending ? unionLines(saved, get().items) : saved;
        set({ items, carts: { ...get().carts, [key]: items } });
        if (pending) scheduleSave();
      };

      return {
        // State
        owner: GUEST,
        carts: { [GUEST]: [] },
        items: [],
        // Owners whose cart here has changes the account has not saved yet.
        unsaved: {},

        // Switch the active bucket. Logging in merges the guest cart into the
        // user's cart and brings in the account's saved cart; logging out
        // returns to the (now empty) guest bucket.
        setOwner: (userId) => {
          const key = ownerKey(userId);
          const { owner, carts } = get();
          const nextCarts = { ...carts };
          if (!nextCarts[key]) nextCarts[key] = [];
          const unsaved = { ...get().unsaved };
          if (key !== owner && key !== GUEST && (nextCarts[GUEST] || []).length) {
            nextCarts[key] = mergeLines(nextCarts[key], nextCarts[GUEST]);
            nextCarts[GUEST] = [];
            unsaved[key] = true;
          }
          // A save still waiting belongs to the account being left.
          if (key !== owner) clearTimeout(saveTimer);
          set({ owner: key, carts: nextCarts, items: nextCarts[key], unsaved });
          if (key !== GUEST) loadSaved(key);
        },

        // Actions
        addItem: (product, quantity = 1) => {
          const items = get().items;
          const cartKey = cartKeyFor(product);
          const existingItem = items.find((item) => item.id === cartKey);

          // A shop still setting up shows its products but takes no orders.
          if (product.readyToSell === false || product.store?.readyToSell === false) {
            throw new Error("This shop isn't taking orders yet");
          }

          // Away (Shop Settings): no orders until the date.
          const away = awayUntil(product.store || product);
          if (away) throw new Error(`This shop is away until ${shortDate(away)}`);

          // Available Today: only while its window takes orders (when the
          // caller knows the window; checkout checks it either way).
          if (isTodayProduct(product) && product.availability !== undefined && !windowOpen(product.availability)) {
            throw new Error(`${product.name || 'This item'} isn't taking orders right now`);
          }

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
                ? { ...item, quantity: newQuantity, stock: product.stock, price: Number(product.price), basePrice: Number(product.price), priceTiers: priceTiersOf(product), unavailable: false, unavailableReason: null }
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
              basePrice: Number(product.price),
              priceTiers: priceTiersOf(product),
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
            const away = !gone && awayUntil(product.store);
            // Per-option stock: the line's own option's quantity.
            const stock = gone ? 0 : stockForSelection(product, line.selectedVariations);
            const patch = { unavailable: false, unavailableReason: null };
            if (!gone) {
              patch.name = product.name ?? line.name;
              // The line's chosen option sets its price when the product is
              // priced per option.
              patch.price = priceForSelection(product, line.selectedVariations) || Number(line.price);
              patch.basePrice = patch.price;
              patch.priceTiers = priceTiersOf(product);
              patch.image = firstImage(product.images) || line.image;
              patch.stock = stock;
              patch.slug = product.slug || line.slug;
              patch.storeId = product.storeId || product.store?.id || line.storeId;
              patch.storeName = product.store?.name || line.storeName;
              patch.storeLogo = product.store?.logo || product.store?.logoUrl || line.storeLogo || null;
              patch.categoryId = product.categoryId || line.categoryId;
              patch.listingKind = product.listingKind || 'REGULAR';
              patch.availability = product.availability || null;
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
            } else if (away) {
              patch.unavailable = true;
              patch.unavailableReason = `The shop is away until ${shortDate(away)}`;
            } else if (isTodayProduct(product) && !windowOpen(product.availability)) {
              patch.unavailable = true;
              patch.unavailableReason = 'No longer taking orders today';
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
      partialize: (state) => ({ owner: state.owner, carts: state.carts, unsaved: state.unsaved }),
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
        const unsaved = persisted?.unsaved && typeof persisted.unsaved === 'object' ? persisted.unsaved : {};
        return { ...current, owner, carts, unsaved, items: carts[owner] };
      },
    }
  )
);

export default useCartStore;
