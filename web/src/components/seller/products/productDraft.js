/*
 * The product being added, kept on this device while it is typed, so a
 * closed tab, a dead battery or a tap on the wrong link doesn't lose it:
 * the next "Add a product" offers "Continue your last product?".
 *
 * One draft per shop. Saved only for new products (an edit's changes are
 * the product itself), cleared once the product is saved or the seller
 * starts fresh. Storage can be missing (private windows): every read and
 * write gives up quietly.
 */

const keyFor = (storeId) => (storeId ? `pf:draft:${storeId}` : null);

// A week is plenty; older drafts are dropped rather than offered.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The saved draft ({ form, hasOptions, at }), or null. */
export const readDraft = (storeId) => {
  const key = keyFor(storeId);
  if (!key) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object' || !saved.form || typeof saved.form !== 'object') return null;
    if (!saved.at || Date.now() - saved.at > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
};

export const writeDraft = (storeId, { form, hasOptions }) => {
  const key = keyFor(storeId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ form, hasOptions: Boolean(hasOptions), at: Date.now() }));
  } catch {
    /* full or blocked storage: no draft this time */
  }
};

export const clearDraft = (storeId) => {
  const key = keyFor(storeId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
};

/** Something worth offering back: at least a name, a photo or a price. */
export const draftWorthKeeping = (form) => Boolean(form)
  && Boolean(String(form.name || '').trim() || (form.images || []).length || String(form.price || '').trim()
    || String(form.description || '').trim());
