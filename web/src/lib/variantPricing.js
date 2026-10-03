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

/**
 * The sale price while a sale is on, else null. A sale is a lower price for
 * a product with one price (not priced per option), between saleStartsAt and
 * saleEndsAt when they are set.
 */
export const activeSalePrice = (product, now = new Date()) => {
  if (!product || product.salePrice === null || product.salePrice === undefined) return null;
  const sale = Number(product.salePrice);
  if (!Number.isFinite(sale) || sale <= 0 || sale >= Number(product.price || 0)) return null;
  if (pricedVariation(product.variations)) return null;
  if (product.saleStartsAt && new Date(product.saleStartsAt) > now) return null;
  if (product.saleEndsAt && new Date(product.saleEndsAt) <= now) return null;
  return sale;
};

/**
 * For showing a price: what the buyer pays now, the regular price to strike
 * through while a sale is on, and when the sale ends.
 * @returns {{ price: Number, regular: Number|null, endsAt: Date|null }}
 */
export const saleInfo = (product, now = new Date()) => {
  const sale = activeSalePrice(product, now);
  return sale === null
    ? { price: Number(product?.price || 0), regular: null, endsAt: null }
    : { price: sale, regular: Number(product.price), endsAt: product.saleEndsAt ? new Date(product.saleEndsAt) : null };
};

/** Percent off while a sale is on ("-20%"), else null. */
export const percentOff = (product) => {
  const { price, regular } = saleInfo(product);
  return regular ? Math.round((1 - price / regular) * 100) : null;
};

/** Price of one unit for the chosen options; product.price when none apply. */
export const priceForSelection = (product, selected) => {
  const group = pricedVariation(product?.variations);
  if (group && selected && typeof selected === 'object') {
    const option = selected[group.name];
    const price = option != null ? Number(group.prices[option]) : NaN;
    if (Number.isFinite(price) && price > 0) return price;
  }
  return activeSalePrice(product) ?? Number(product?.price || 0);
};

/** { min, max } across the priced options (equal when the price is fixed). */
export const priceRange = (product) => {
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
export const priceTiersOf = (product) => (Array.isArray(product?.priceTiers) && !pricedVariation(product.variations)
  ? product.priceTiers
    .map((t) => ({ minQty: Number(t?.minQty), price: Number(t?.price) }))
    .filter((t) => Number.isInteger(t.minQty) && t.minQty >= 2 && Number.isFinite(t.price) && t.price > 0)
    .sort((a, b) => a.minQty - b.minQty)
  : []);

/** What one unit costs when buying `quantity`: options, sale and bulk price applied. */
export const unitPriceFor = (product, selected, quantity = 1) => {
  const base = priceForSelection(product, selected);
  const tier = priceTiersOf(product).filter((t) => quantity >= t.minQty).pop();
  return tier && tier.price < base ? tier.price : base;
};

/* ── Per-option stock ────────────────────────────────────────────────
   One group may carry `stocks` ({ option: quantity }). product.stock is
   then the sum across its options. */

/** The group whose options each have their own stock, or null. */
export const stockedVariation = (variations) => (Array.isArray(variations)
  ? variations.find((v) => v && v.stocks && typeof v.stocks === 'object' && Object.keys(v.stocks).length) || null
  : null);

/** Units available for the chosen options (product.stock when stock is not per option). */
export const stockForSelection = (product, selected) => {
  const group = stockedVariation(product?.variations);
  if (group && selected && typeof selected === 'object' && selected[group.name] != null) {
    return Math.max(0, Number(group.stocks[selected[group.name]] || 0));
  }
  return Math.max(0, Number(product?.stock || 0));
};

/** Sum of a stocked group's quantities. */
export const totalOptionStock = (group) => (group
  ? group.options.reduce((sum, o) => sum + Math.max(0, Number(group.stocks?.[o] || 0)), 0)
  : 0);
