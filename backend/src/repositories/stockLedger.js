const { stockedVariation, totalOptionStock } = require('../utils/variantPricing');

/**
 * Change a product's stock inside a transaction, per option when the
 * product keeps stock per option (e.g. 250g: 12, 1kg: 3).
 *
 * The product row is locked (SELECT … FOR UPDATE) for the rest of the
 * transaction, so two checkouts taking the last unit of the same option
 * cannot both succeed. Per-option products update the option's quantity and
 * the total (product.stock = sum of options) together.
 *
 * @param {Object} tx - Prisma transaction client
 * @param {String} productId
 * @param {Object|null} selectedVariations - the order line's chosen options
 * @param {Number} delta - negative to take stock, positive to return it
 * @returns {Promise<Number>} the product's total stock afterwards
 * @throws {Error} code INSUFFICIENT_STOCK when stock would go below zero
 */
const changeStock = async (tx, productId, selectedVariations, delta) => {
  const rows = await tx.$queryRaw`SELECT stock, variations FROM products WHERE id = ${productId} FOR UPDATE`;
  if (!rows.length) {
    const err = new Error(`Product ${productId} not found`);
    err.code = 'PRODUCT_NOT_FOUND';
    throw err;
  }
  const stock = Number(rows[0].stock || 0);
  let variations = rows[0].variations;
  if (typeof variations === 'string') {
    try { variations = JSON.parse(variations); } catch { variations = null; }
  }

  const insufficient = (label) => {
    const err = new Error(`Insufficient stock for product ${productId}${label ? ` (${label})` : ''}`);
    err.code = 'INSUFFICIENT_STOCK';
    err.productId = productId;
    return err;
  };

  const group = stockedVariation(variations);
  const option = group && selectedVariations ? selectedVariations[group.name] : undefined;

  let data;
  if (group && option != null && Object.prototype.hasOwnProperty.call(group.stocks, option)) {
    const current = Math.max(0, Number(group.stocks[option] || 0));
    if (current + delta < 0) throw insufficient(option);
    const nextGroup = { ...group, stocks: { ...group.stocks, [option]: current + delta } };
    const nextVariations = variations.map((v) => (v === group ? nextGroup : v));
    data = { variations: nextVariations, stock: totalOptionStock(nextGroup) };
  } else if (group) {
    // Stock is per option but this option no longer exists (the seller
    // removed it). It cannot be sold; returned units have nowhere to go,
    // and adding them to the total would break total = sum of options.
    if (delta < 0) throw insufficient(option);
    return stock;
  } else {
    if (stock + delta < 0) throw insufficient();
    data = { stock: stock + delta };
  }

  const updated = await tx.product.update({ where: { id: productId }, data, select: { stock: true } });
  return updated.stock;
};

module.exports = { changeStock };
