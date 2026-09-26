/**
 * Per-option pricing (mirror of backend/src/utils/variantPricing.js).
 *
 * One variation group may carry `prices` ({ option: price }), e.g. Weight:
 * 250g ₱100, 1kg ₱300. product.price is the lowest of them. The server charges
 * the chosen option's price at checkout; these helpers show the same number.
 */

export const pricedVariation = (variations) => (Array.isArray(variations)
  ? variations.find((v) => v && v.prices && typeof v.prices === 'object' && Object.keys(v.prices).length) || null
  : null);

/** Price of one unit for the chosen options; product.price when none apply. */
export const priceForSelection = (product, selected) => {
  const group = pricedVariation(product?.variations);
  if (group && selected && typeof selected === 'object') {
    const option = selected[group.name];
    const price = option != null ? Number(group.prices[option]) : NaN;
    if (Number.isFinite(price) && price > 0) return price;
  }
  return Number(product?.price || 0);
};

/** { min, max } across the priced options (equal when the price is fixed). */
export const priceRange = (product) => {
  const group = pricedVariation(product?.variations);
  const values = group
    ? group.options.map((o) => Number(group.prices[o])).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  if (!values.length) {
    const p = Number(product?.price || 0);
    return { min: p, max: p };
  }
  return { min: Math.min(...values), max: Math.max(...values) };
};
