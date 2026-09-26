/**
 * Per-option pricing.
 *
 * A product's `variations` is a list of groups, e.g.
 *   [{ name: 'Weight', options: ['250g', '1kg'], prices: { '250g': 100, '1kg': 300 } },
 *    { name: 'Color',  options: ['Red', 'Blue'] }]
 * At most one group carries `prices` — the group that sets the price (weight,
 * size, pack…). Other groups only describe the item. `product.price` holds the
 * lowest option price so listings and sorting keep working ("from ₱100").
 *
 * The web app has a copy of these helpers (web/src/lib/variantPricing.js);
 * keep the two in step.
 */

/** The group whose options set the price, or null. */
const pricedVariation = (variations) => (Array.isArray(variations)
  ? variations.find((v) => v && v.prices && typeof v.prices === 'object' && Object.keys(v.prices).length) || null
  : null);

/** Price of one unit for the chosen options (falls back to product.price). */
const priceForSelection = (product, selected) => {
  const group = pricedVariation(product?.variations);
  if (group && selected && typeof selected === 'object') {
    const option = selected[group.name];
    const price = option != null ? Number(group.prices[option]) : NaN;
    if (Number.isFinite(price) && price > 0) return price;
  }
  return Number(product?.price || 0);
};

/** { min, max } across the priced options, or the single product price. */
const priceRange = (product) => {
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

module.exports = { pricedVariation, priceForSelection, priceRange };
