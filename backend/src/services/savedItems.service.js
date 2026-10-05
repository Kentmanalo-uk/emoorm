const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * The cart and wishlist, saved to the account so they follow the buyer to
 * another phone or computer. The app sends its whole list after a change and
 * reads it back on sign-in; prices, stock and availability are always checked
 * again against the product (the cart revalidates, checkout prices on the
 * server), so a saved line is only "this product, these options, this many".
 */

const MAX_CART_LINES = 100;
const MAX_WISHLIST = 300;
const MAX_QUANTITY = 999;

// What the app needs to draw a line before it revalidates.
const PRODUCT_CARD = {
  id: true,
  name: true,
  slug: true,
  price: true,
  salePrice: true,
  saleStartsAt: true,
  saleEndsAt: true,
  images: true,
  stock: true,
  status: true,
  variations: true,
  // Its kind: a paluto has no stock but a minimum order, a package its items.
  listingKind: true,
  productType: true,
  details: true,
  fulfillment: true,
  categoryId: true,
  storeId: true,
  deletedAt: true,
  store: { select: { id: true, name: true, logo: true } },
};

/** Options as a stable key: the same choice always gives the same text. */
const variationKeyOf = (selected) => {
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return '';
  const keys = Object.keys(selected).sort();
  if (!keys.length) return '';
  return JSON.stringify(Object.fromEntries(keys.map((k) => [String(k), String(selected[k])])));
};

const getCart = async (userId) => {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { quantity: true, selectedVariations: true, product: { select: PRODUCT_CARD } },
  });
  return rows.map((r) => ({ quantity: r.quantity, selectedVariations: r.selectedVariations || null, product: r.product }));
};

/**
 * Replace the saved cart with the app's list.
 * @param {Array<{ productId, selectedVariations?, quantity }>} lines
 */
const putCart = async (userId, lines) => {
  if (!Array.isArray(lines)) throw new ApiError('items must be a list', 400);
  if (lines.length > MAX_CART_LINES) throw new ApiError(`A cart holds at most ${MAX_CART_LINES} lines`, 400);

  // One row per product and options; a repeated line keeps the larger quantity.
  const byKey = new Map();
  for (const line of lines) {
    const productId = typeof line?.productId === 'string' ? line.productId : null;
    const quantity = Math.min(MAX_QUANTITY, Math.max(1, parseInt(line?.quantity, 10) || 1));
    const variationKey = variationKeyOf(line?.selectedVariations);
    if (!productId || variationKey.length > 191) continue;
    const key = `${productId}|${variationKey}`;
    const prev = byKey.get(key);
    if (!prev || prev.quantity < quantity) {
      byKey.set(key, { productId, variationKey, selectedVariations: variationKey ? JSON.parse(variationKey) : null, quantity });
    }
  }

  // Products that no longer exist at all are dropped; ones that are hidden
  // or out of stock stay, so the cart can say so.
  const wanted = [...byKey.values()];
  const existing = new Set((await prisma.product.findMany({
    where: { id: { in: [...new Set(wanted.map((l) => l.productId))] } },
    select: { id: true },
  })).map((p) => p.id));
  const keep = wanted.filter((l) => existing.has(l.productId));

  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { userId } }),
    prisma.cartItem.createMany({
      data: keep.map((l) => ({
        userId,
        productId: l.productId,
        variationKey: l.variationKey,
        selectedVariations: l.selectedVariations ?? undefined,
        quantity: l.quantity,
      })),
    }),
  ]);
  return { saved: keep.length };
};

const getWishlist = async (userId) => {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { product: { select: PRODUCT_CARD } },
  });
  return rows.map((r) => r.product);
};

/** Replace the saved wishlist with the app's list of product ids. */
const putWishlist = async (userId, productIds) => {
  if (!Array.isArray(productIds)) throw new ApiError('productIds must be a list', 400);
  const ids = [...new Set(productIds.filter((id) => typeof id === 'string'))];
  if (ids.length > MAX_WISHLIST) throw new ApiError(`A wishlist holds at most ${MAX_WISHLIST} products`, 400);
  const existing = (await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id);
  const have = new Set(existing);
  await prisma.$transaction([
    prisma.wishlistItem.deleteMany({ where: { userId } }),
    prisma.wishlistItem.createMany({ data: ids.filter((id) => have.has(id)).map((productId) => ({ userId, productId })) }),
  ]);
  return { saved: have.size };
};

module.exports = { getCart, putCart, getWishlist, putWishlist, variationKeyOf };
