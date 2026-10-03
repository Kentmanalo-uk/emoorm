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

/**
 * The sale price while a sale is on, else null. A sale is a lower price for
 * a product with one price (not priced per option), between saleStartsAt and
 * saleEndsAt when they are set.
 */
const activeSalePrice = (product, now = new Date()) => {
  if (!product || product.salePrice === null || product.salePrice === undefined) return null;
  const sale = Number(product.salePrice);
  if (!Number.isFinite(sale) || sale <= 0 || sale >= Number(product.price || 0)) return null;
  if (pricedVariation(product.variations)) return null;
  if (product.saleStartsAt && new Date(product.saleStartsAt) > now) return null;
  if (product.saleEndsAt && new Date(product.saleEndsAt) <= now) return null;
  return sale;
};

/** Price of one unit for the chosen options (falls back to product.price, or its sale price). */
const priceForSelection = (product, selected) => {
  const group = pricedVariation(product?.variations);
  if (group && selected && typeof selected === 'object') {
    const option = selected[group.name];
    const price = option != null ? Number(group.prices[option]) : NaN;
    if (Number.isFinite(price) && price > 0) return price;
  }
  return activeSalePrice(product) ?? Number(product?.price || 0);
};

/** { min, max } across the priced options, or the single product price. */
const priceRange = (product) => {
  const group = pricedVariation(product?.variations);
  const values = group
    ? group.options.map((o) => Number(group.prices[o])).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  if (!values.length) {
    const p = activeSalePrice(product) ?? Number(product?.price || 0);
    return { min: p, max: p };
  }
  return { min: Math.min(...values), max: Math.max(...values) };
};

/**
 * Bulk prices: [{ minQty: 10, price: 90 }, …], lowest quantity first, for a
 * product with one price. The tier for a quantity is the last one it reaches.
 */
const priceTiersOf = (product) => (Array.isArray(product?.priceTiers) && !pricedVariation(product.variations)
  ? product.priceTiers
    .map((t) => ({ minQty: Number(t?.minQty), price: Number(t?.price) }))
    .filter((t) => Number.isInteger(t.minQty) && t.minQty >= 2 && Number.isFinite(t.price) && t.price > 0)
    .sort((a, b) => a.minQty - b.minQty)
  : []);

/** What one unit costs when buying `quantity`: options, sale and bulk price applied. */
const unitPriceFor = (product, selected, quantity = 1) => {
  const base = priceForSelection(product, selected);
  const tier = priceTiersOf(product).filter((t) => quantity >= t.minQty).pop();
  return tier && tier.price < base ? tier.price : base;
};

/* ── Per-option stock ────────────────────────────────────────────────
   One group may carry `stocks` ({ option: quantity }). product.stock is
   then the sum across its options. */

/** The group whose options each have their own stock, or null. */
const stockedVariation = (variations) => (Array.isArray(variations)
  ? variations.find((v) => v && v.stocks && typeof v.stocks === 'object' && Object.keys(v.stocks).length) || null
  : null);

/** Units available for the chosen options (product.stock when stock is not per option). */
const stockForSelection = (product, selected) => {
  const group = stockedVariation(product?.variations);
  if (group && selected && typeof selected === 'object' && selected[group.name] != null) {
    return Math.max(0, Number(group.stocks[selected[group.name]] || 0));
  }
  return Math.max(0, Number(product?.stock || 0));
};

/** Sum of a stocked group's quantities. */
const totalOptionStock = (group) => (group
  ? group.options.reduce((sum, o) => sum + Math.max(0, Number(group.stocks?.[o] || 0)), 0)
  : 0);

module.exports = {
  priceTiersOf, unitPriceFor,
  activeSalePrice, pricedVariation, priceForSelection, priceRange, stockedVariation, stockForSelection, totalOptionStock,
};
