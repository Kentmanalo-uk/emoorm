/**
 * A photo per option: one variation group may carry `images`
 * ({ option: url }), e.g. Color: Red → its own photo. Options without a
 * photo are absent; the product's own photos stand in for them.
 */

// Variations whatever shape the API gave them in (an array, or its JSON).
const asList = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// A product's first image, whatever shape the API gave it in.
const firstOf = (raw) => {
  if (Array.isArray(raw)) return raw.find(Boolean) || null;
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.find(Boolean) || null : raw;
    } catch {
      return raw;
    }
  }
  return null;
};

/** The group whose options carry photos, or null. */
export const imagedVariation = (variations) => asList(variations)
  .find((v) => v && v.images && typeof v.images === 'object' && Object.keys(v.images).length) || null;

/** The photo of the option picked in `selected` ({ group: option }), or null. */
export const optionImage = (variations, selected) => {
  const group = imagedVariation(variations);
  if (!group || !selected || typeof selected !== 'object') return null;
  const option = selected[group.name];
  const url = option != null ? group.images[option] : null;
  return typeof url === 'string' && url ? url : null;
};

/**
 * A line's picture: the chosen option's photo when it has one, else the
 * product's first image (or `fallback`, e.g. a cart line's saved image).
 * @param {Object} product - anything with `variations` and `images`
 * @param {Object} [selected] - the line's selectedVariations
 * @param {String} [fallback]
 */
export const variationImage = (product, selected, fallback = null) => optionImage(product?.variations, selected)
  || firstOf(product?.images)
  || fallback
  || null;

export default variationImage;
