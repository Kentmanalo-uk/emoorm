import { create } from 'zustand';

// Transient (non-persisted) bridge for passing a product selected on the dedicated
// "Select a product" page back to the conversation screen that pushed it.
const useChatAttachmentStore = create((set, get) => ({
  pendingProduct: null,
  setPendingProduct: (product) => set({ pendingProduct: product }),
  consumePendingProduct: () => {
    const product = get().pendingProduct;
    if (product) set({ pendingProduct: null });
    return product;
  },
}));

export default useChatAttachmentStore;
