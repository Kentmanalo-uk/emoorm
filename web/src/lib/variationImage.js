import { firstImage } from './media';

/**
 * A photo per option (mirror of imageForSelection in
 * backend/src/utils/variantPricing.js).
 *
 * One variation group may carry `images` ({ option: '/uploads/…' }), e.g.
 * Color: Red → a photo of the red one. Options without a photo are absent.
 * A cart line, order item or receipt shows the chosen option's photo when it
 * has one, else the product's first image.
 */

const variationsOf = (product) => {
  let list = product?.variations;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = null; }
  }
  return Array.isArray(list) ? list : [];
};

/** The group whose options have their own photos, or null. */
export const picturedVariation = (variations) => (Array.isArray(variations)
  ? variations.find((v) => v && v.images && typeof v.images === 'object' && Object.keys(v.images).length) || null
  : null);

/** The photo of one option of a group, or null. */
export const optionImage = (group, option) => (group?.images && option != null ? group.images[option] || null : null);

/** The chosen option's photo, or null. */
export const imageForSelection = (product, selected) => {
  const group = picturedVariation(variationsOf(product));
  if (!group || !selected || typeof selected !== 'object') return null;
  return optionImage(group, selected[group.name]);
};

/**
 * The picture for a line: the chosen option's photo, else `fallback`, else
 * the product's first image. Returns the stored path (pass it to resolveImg).
 */
export const lineImage = (product, selected, fallback = null) => (
  imageForSelection(product, selected) || fallback || firstImage(product?.images) || null
);
