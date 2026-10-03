import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from '../lib/axios';

// Wishlists are kept per owner (user id or 'guest'), like the cart, so the
// next person to sign in on a shared phone does not see someone else's saved
// items. `items` mirrors the active owner's list for every existing reader.
const GUEST = 'guest';
// Saved before wishlists had owners: given to the first account that signs in.
const LEGACY = '__unowned';
const ownerKey = (userId) => (userId ? String(userId) : GUEST);

// The account stores the product ids; the order is kept, nothing else.
const idsOf = (items) => items.map((i) => i.id).join(',');
let saveTimer = null;

const useWishlistStore = create(
  persist(
    (set, get) => {
      // Send the signed-in owner's list to the account (GET/PUT /me/wishlist).
      const save = async () => {
        const { owner, items } = get();
        if (owner === GUEST) return;
        try {
          await axios.put('/me/wishlist', { productIds: items.map((i) => i.id) });
          if (get().owner === owner && idsOf(get().items) === idsOf(items)) {
            set({ unsaved: { ...get().unsaved, [owner]: false } });
          }
        } catch {
          // Stays unsaved: sent again with the next change or sign-in.
        }
      };
      const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 800);
      };

      const commit = (items) => {
        const { owner, lists, unsaved, items: before } = get();
        set({ items, lists: { ...lists, [owner]: items } });
        if (owner !== GUEST && idsOf(items) !== idsOf(before)) {
          if (!unsaved[owner]) set({ unsaved: { ...unsaved, [owner]: true } });
          scheduleSave();
        }
      };

      // The account's saved list; unsaved changes made here are kept with it.
      const loadSaved = async (key) => {
        let saved;
        try {
          const res = await axios.get('/me/wishlist');
          saved = (res.data || []).filter((p) => p && !p.deletedAt);
        } catch {
          return;
        }
        if (get().owner !== key) return;
        const pending = get().unsaved[key];
        let items = saved;
        if (pending) {
          const have = new Set(saved.map((p) => p.id));
          items = [...saved, ...get().items.filter((p) => !have.has(p.id))];
        }
        set({ items, lists: { ...get().lists, [key]: items } });
        if (pending) scheduleSave();
      };

      return {
        owner: GUEST,
        lists: { [GUEST]: [] },
        items: [],
        // Owners whose list here has changes the account has not saved yet.
        unsaved: {},

        setOwner: (userId) => {
          const key = ownerKey(userId);
          const lists = { ...get().lists };
          if (!lists[key]) lists[key] = [];
          const unsaved = { ...get().unsaved };
          if (key !== GUEST && lists[LEGACY]?.length) {
            const have = new Set(lists[key].map((i) => i.id));
            lists[key] = [...lists[key], ...lists[LEGACY].filter((i) => !have.has(i.id))];
            delete lists[LEGACY];
            unsaved[key] = true;
          }
          if (key !== get().owner) clearTimeout(saveTimer);
          set({ owner: key, lists, items: lists[key], unsaved });
          if (key !== GUEST) loadSaved(key);
        },

        addItem: (product) => {
          if (!get().items.some((i) => i.id === product.id)) commit([...get().items, product]);
        },

        removeItem: (productId) => {
          commit(get().items.filter((i) => i.id !== productId));
        },

        toggleItem: (product) => {
          const items = get().items;
          commit(items.some((i) => i.id === product.id)
            ? items.filter((i) => i.id !== product.id)
            : [...items, product]);
        },

        /** Replace the active owner's list (the account's saved list from the server). */
        replaceItems: (items) => commit(items),

        isInWishlist: (productId) => get().items.some((i) => i.id === productId),

        getCount: () => get().items.length,

        clear: () => commit([]),
      };
    },
    {
      name: 'emoorm-wishlist',
      version: 1,
      partialize: (state) => ({ owner: state.owner, lists: state.lists, unsaved: state.unsaved }),
      migrate: (persisted, version) => {
        if (version === 0 || !persisted?.lists) {
          const legacy = Array.isArray(persisted?.items) ? persisted.items : [];
          return { owner: GUEST, lists: { [GUEST]: [], ...(legacy.length ? { [LEGACY]: legacy } : {}) } };
        }
        return persisted;
      },
      merge: (persisted, current) => {
        const lists = persisted?.lists || current.lists;
        const owner = persisted?.owner || current.owner;
        const unsaved = persisted?.unsaved && typeof persisted.unsaved === 'object' ? persisted.unsaved : {};
        return { ...current, owner, lists, unsaved, items: lists[owner] || [] };
      },
    }
  )
);

export default useWishlistStore;
