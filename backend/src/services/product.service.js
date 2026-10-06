const prisma = require('../config/database');
const { Prisma } = require('@prisma/client');
const config = require('../config/env');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const categoryRepository = require('../repositories/category.repository');
const notificationService = require('./notification.service');
const followService = require('./storeFollow.service');
const { cached } = require('../lib/cachePolicy');
const { cleanText, cleanFields } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');
const shopReadiness = require('./shopReadiness.service');
const availabilityRepository = require('../repositories/availability.repository');
const availabilityService = require('./availability.service');
const { bufferToDHash, hammingDistance, hashFromSource, HASH_BIT_LENGTH } = require('../utils/imageHash');
const { stockedVariation, pricedVariation, activeSalePrice } = require('../utils/variantPricing');
const {
  PRODUCT_TYPES, FULFILLMENTS, kindOf, isStockless, validateDetails,
} = require('../utils/productKinds');

const computeImageHashSafe = async (images) => {
  const first = Array.isArray(images) ? images[0] : null;
  if (!first) return null;
  try {
    return await hashFromSource(first);
  } catch (err) {
    console.warn('[imageHash] failed to hash product image:', err.message);
    return null;
  }
};

/**
 * Text fields a seller controls that are rendered as plain text everywhere.
 * Markup is stripped here so no consumer — web, mobile, email, export — can
 * be made to execute it later.
 */
const PRODUCT_TEXT_FIELDS = { name: 200, description: 5000 };

// ── Validation limits ───────────────────────────────────────────────────
const NAME_MIN = 2;
const NAME_MAX = 200;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;
const PRICE_MAX = 9999999.99;
const QUANTITY_MAX = 1000000;
const IMAGES_MAX = 10;
const IMAGE_PATTERN = /^\/uploads\/[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$/i;
const STOCK_DELTA_MAX = 100000;
const STOCK_REASON_MAX = 120;
const SEARCH_MAX = 100;
const SORT_BY = new Set(['createdAt', 'price', 'name', 'orderCount', 'relevance']);
const PRODUCT_STATUSES = new Set(['PENDING', 'APPROVED', 'HIDDEN', 'SUSPENDED', 'ARCHIVED']);
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MUNICIPAL_ADMIN']);

const isAdminRole = (role) => ADMIN_ROLES.has(role);

const normalizeProductOptions = (data) => {
  const returnPolicy = typeof data.returnPolicy === 'string'
    ? cleanText(data.returnPolicy, { maxLength: 2000 })
    : null;
  const rawVariations = Array.isArray(data.variations) ? data.variations : [];
  const variations = rawVariations
    .map((variation) => ({
      name: cleanText(String(variation?.name || ''), { maxLength: 80 }),
      options: Array.isArray(variation?.options)
        ? variation.options.map((option) => cleanText(String(option), { maxLength: 80 })).filter(Boolean).slice(0, 30)
        : [],
      rawPrices: variation?.prices && typeof variation.prices === 'object' && !Array.isArray(variation.prices)
        ? variation.prices
        : null,
      rawStocks: variation?.stocks && typeof variation.stocks === 'object' && !Array.isArray(variation.stocks)
        ? variation.stocks
        : null,
    }))
    .filter((variation) => variation.name && variation.options.length)
    .slice(0, 10);

  const names = new Set();
  for (const variation of variations) {
    const key = variation.name.toLowerCase();
    if (names.has(key)) throw new ApiError('Variation names must be unique', 400);
    names.add(key);
  }

  // Per-option prices (e.g. Weight: 250g ₱100, 1kg ₱300). One group sets
  // the price; every option in it needs one. product.price becomes the
  // lowest, so listings show "from" that and sorting still works.
  let minPrice = null;
  const priced = variations.filter((v) => v.rawPrices && Object.keys(v.rawPrices).length);
  if (priced.length > 1) {
    throw new ApiError('Only one variation can set the price', 400);
  }
  // Per-option stock (e.g. 250g: 12, 1kg: 3). One group keeps it; every
  // option in it needs a whole number. product.stock becomes the total.
  let totalStock = null;
  const stocked = variations.filter((v) => v.rawStocks && Object.keys(v.rawStocks).length);
  if (stocked.length > 1) {
    throw new ApiError('Only one variation can have stock per option', 400);
  }
  const withStock = variations.map(({ rawStocks, ...variation }) => {
    if (!rawStocks || !Object.keys(rawStocks).length) return variation;
    const stocks = {};
    for (const option of variation.options) {
      const raw = rawStocks[option];
      const value = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new ApiError(`Stock for "${option}" must be a whole number of 0 or more`, 400);
      }
      if (value > QUANTITY_MAX) {
        throw new ApiError(`Stock for "${option}" is too high`, 400);
      }
      stocks[option] = value;
    }
    totalStock = Object.values(stocks).reduce((sum, n) => sum + n, 0);
    if (totalStock > QUANTITY_MAX) throw new ApiError('Total stock is too high', 400);
    return { ...variation, stocks };
  });

  const cleaned = withStock.map(({ rawPrices, ...variation }) => {
    if (!rawPrices || !Object.keys(rawPrices).length) return variation;
    const prices = {};
    for (const option of variation.options) {
      const value = Number(rawPrices[option]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new ApiError(`Enter a price for "${option}" in ${variation.name}`, 400);
      }
      if (value > PRICE_MAX) {
        throw new ApiError(`The price for "${option}" is too high`, 400);
      }
      prices[option] = Math.round(value * 100) / 100;
    }
    const lowest = Math.min(...Object.values(prices));
    minPrice = minPrice === null ? lowest : Math.min(minPrice, lowest);
    return { ...variation, prices };
  });

  return {
    returnPolicy,
    variations: cleaned.length ? cleaned : null,
    ...(minPrice !== null ? { price: minPrice } : {}),
    ...(totalStock !== null ? { stock: totalStock } : {}),
  };
};

// ── Field validators (each returns the normalised value or throws 400) ──

const validateName = (value) => {
  if (typeof value !== 'string' || value.length < NAME_MIN || value.length > NAME_MAX) {
    throw new ApiError(`Product name must be between ${NAME_MIN} and ${NAME_MAX} characters`, 400);
  }
  return value;
};

const validateDescription = (value) => {
  if (typeof value !== 'string' || value.length < DESCRIPTION_MIN || value.length > DESCRIPTION_MAX) {
    throw new ApiError(`Product description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters`, 400);
  }
  return value;
};

const validatePrice = (value) => {
  const price = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (typeof value === 'boolean' || value === '' || value === null || !Number.isFinite(price) || price <= 0) {
    throw new ApiError('Product price must be a number greater than zero', 400);
  }
  if (price > PRICE_MAX) {
    throw new ApiError(`Product price cannot exceed ${PRICE_MAX.toLocaleString('en-US')}`, 400);
  }
  // The column holds two decimals. A price that rounds to nothing is a free
  // product, which is never what a seller typed 0.001 for.
  const rounded = Math.round(price * 100) / 100;
  if (rounded <= 0) {
    throw new ApiError('Product price must be at least 0.01', 400);
  }
  return rounded;
};

const validateWholeNumber = (value, label) => {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (typeof value === 'boolean' || value === '' || value === null || !Number.isInteger(n) || n < 0 || n > QUANTITY_MAX) {
    throw new ApiError(`${label} must be a whole number between 0 and ${QUANTITY_MAX.toLocaleString('en-US')}`, 400);
  }
  return n;
};

const validateImages = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > IMAGES_MAX) {
    throw new ApiError(`Provide between 1 and ${IMAGES_MAX} product images`, 400);
  }
  const images = value.map((img) => (typeof img === 'string' ? img.trim() : img));
  for (const img of images) {
    if (typeof img !== 'string' || !IMAGE_PATTERN.test(img)) {
      throw new ApiError('Each product image must be an uploaded image path (e.g. /uploads/photo.jpg)', 400);
    }
  }
  return images;
};

const validateCategory = async (categoryId) => {
  if (typeof categoryId !== 'string' || !categoryId.trim()) {
    throw new ApiError('Category is required', 400);
  }
  const category = await categoryRepository.findById(categoryId.trim());
  if (!category || !category.isActive) {
    throw new ApiError('Category not found or is no longer available', 400);
  }
  return category.id;
};

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;

const optionalDate = (value, label) => {
  if (value === null || value === '') return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new ApiError(`${label} is not a valid date and time`, 400);
  return at;
};

/** Bulk prices: up to 4, each for more units at a lower price than the last. */
const validatePriceTiers = (value) => {
  if (value === null || (Array.isArray(value) && value.length === 0)) return Prisma.DbNull;
  if (!Array.isArray(value) || value.length > 4) throw new ApiError('Up to 4 bulk prices', 400);
  const tiers = value.map((t) => ({ minQty: Number(t?.minQty), price: Math.round(Number(t?.price) * 100) / 100 }));
  tiers.sort((a, b) => a.minQty - b.minQty);
  let lastPrice = Infinity;
  let lastQty = 1;
  for (const t of tiers) {
    if (!Number.isInteger(t.minQty) || t.minQty < 2 || t.minQty > QUANTITY_MAX) throw new ApiError('A bulk price starts at 2 or more units', 400);
    if (t.minQty === lastQty) throw new ApiError('Each bulk price needs its own quantity', 400);
    if (!(t.price > 0) || t.price >= lastPrice) throw new ApiError('Each bulk price must be lower than the one before', 400);
    lastPrice = t.price;
    lastQty = t.minQty;
  }
  return tiers;
};

/** Bulk prices on the product as it will be saved: below the price, one-price products only. */
const checkTiers = (p) => {
  if (!Array.isArray(p.priceTiers) || !p.priceTiers.length) return;
  if (pricedVariation(p.variations)) throw new ApiError('Bulk prices are for products with one price', 400);
  if (p.priceTiers[0].price >= Number(p.price)) throw new ApiError('Bulk prices must be lower than the regular price', 400);
};

/**
 * A sale on the product as it will be saved: a lower price than the regular
 * one, for a product with one price, ending after it starts.
 * @param {Object} p - price, variations, salePrice, saleStartsAt, saleEndsAt
 */
const checkSale = (p) => {
  if (p.salePrice === null || p.salePrice === undefined) return;
  if (pricedVariation(p.variations)) {
    throw new ApiError('A sale price is for products with one price. For option prices, lower the option prices instead.', 400);
  }
  if (Number(p.salePrice) >= Number(p.price)) {
    throw new ApiError('The sale price must be lower than the regular price', 400);
  }
  if (p.saleStartsAt && p.saleEndsAt && new Date(p.saleEndsAt) <= new Date(p.saleStartsAt)) {
    throw new ApiError('The sale must end after it starts', 400);
  }
  if (p.saleEndsAt && new Date(p.saleEndsAt) <= new Date()) {
    throw new ApiError('The sale end is already past', 400);
  }
};

const blankText = (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim());
const noImages = (value) => value === undefined || value === null || (Array.isArray(value) && value.length === 0);

/**
 * Validate a create (all required) or update (partial) payload.
 * @param {Object} data - Sanitised payload
 * @param {Object} options
 * @param {Boolean} options.partial - true for updates
 * @param {String} [options.kind] - the product's kind as saved; a PACKAGE may
 *   leave its description, photos and category to its items, and its weight
 *   always comes from them (packageFields)
 * @returns {Promise<Object>} Only the validated, normalised fields present
 */
const validateProductPayload = async (data, { partial, kind = 'REGULAR' }) => {
  const out = {};
  const pkg = kind === 'PACKAGE';

  if (!partial || has(data, 'name')) out.name = validateName(data.name);
  if ((!partial || has(data, 'description')) && !(pkg && blankText(data.description))) {
    out.description = validateDescription(data.description);
  }
  if (!partial || has(data, 'price')) out.price = validatePrice(data.price);
  if (!partial || has(data, 'stock')) {
    out.stock = validateWholeNumber(partial ? data.stock : data.stock ?? 0, 'Product stock');
  }
  if (!partial || has(data, 'lowStockThreshold')) {
    out.lowStockThreshold = validateWholeNumber(partial ? data.lowStockThreshold : data.lowStockThreshold ?? 5, 'Low-stock threshold');
  }
  // Packed weight for courier fees (grams). Optional: without it a product
  // can still be delivered by the seller or picked up.
  if (has(data, 'weightGrams') && !pkg) {
    const raw = data.weightGrams;
    if (raw === null || raw === '') out.weightGrams = null;
    else {
      const g = Math.round(Number(raw));
      if (!Number.isFinite(g) || g < 1 || g > 100000) throw new ApiError('Weight must be between 1 g and 100 kg', 400);
      out.weightGrams = g;
    }
  }
  if (has(data, 'salePrice')) {
    out.salePrice = data.salePrice === null || data.salePrice === '' ? null : validatePrice(data.salePrice);
    // No sale price: no sale dates either.
    if (out.salePrice === null) {
      out.saleStartsAt = null;
      out.saleEndsAt = null;
    }
  }
  if (has(data, 'saleStartsAt') && out.saleStartsAt === undefined) out.saleStartsAt = optionalDate(data.saleStartsAt, 'Sale start');
  if (has(data, 'saleEndsAt') && out.saleEndsAt === undefined) out.saleEndsAt = optionalDate(data.saleEndsAt, 'Sale end');
  if (has(data, 'priceTiers')) out.priceTiers = validatePriceTiers(data.priceTiers);
  if ((!partial || has(data, 'images')) && !(pkg && noImages(data.images))) out.images = validateImages(data.images);
  if ((!partial || has(data, 'categoryId')) && !(pkg && blankText(data.categoryId))) {
    out.categoryId = await validateCategory(data.categoryId);
  }

  return out;
};

// ── Product kinds ───────────────────────────────────────────────────────

/**
 * The kind a product will be after this save. Forms send productType; older
 * ones (and the mobile app) send only listingKind, where TODAY means
 * ready-to-eat food and REGULAR keeps any other kind as it was.
 * @param {Object} data - Sanitised payload
 * @param {String|null} current - The product's kind now (null when creating)
 */
const resolveKind = (data, current) => {
  if (has(data, 'listingKind') && !['REGULAR', 'TODAY'].includes(data.listingKind)) {
    throw new ApiError('Choose how you sell it: always available or Available Today', 400);
  }
  let kind = current || 'REGULAR';
  if (has(data, 'productType')) {
    if (!PRODUCT_TYPES.includes(data.productType)) throw new ApiError('Choose what kind of product it is', 400);
    kind = data.productType;
    if (has(data, 'listingKind') && (data.listingKind === 'TODAY') !== (kind === 'READY_TO_EAT')) {
      throw new ApiError('Only ready-to-eat food is sold as Available Today', 400);
    }
  } else if (data.listingKind === 'TODAY') {
    kind = 'READY_TO_EAT';
  } else if (data.listingKind === 'REGULAR' && kind === 'READY_TO_EAT') {
    kind = 'REGULAR';
  }
  // A package is its items: changing what it is means a new listing.
  if (current && (current === 'PACKAGE') !== (kind === 'PACKAGE')) {
    throw new ApiError('Make a new package instead', 400);
  }
  return kind;
};

/** How buyers can get it (null: as the shop offers), within what the shop offers. */
const validateFulfillment = (value, store) => {
  if (value === null || value === '') return null;
  if (!FULFILLMENTS.includes(value)) throw new ApiError('Choose pickup, delivery or both', 400);
  const shopMode = store.fulfillmentMode || 'DELIVERY';
  if (shopMode === 'PICKUP' && value === 'DELIVERY') throw new ApiError('Your shop offers pickup only', 400);
  if (shopMode === 'DELIVERY' && value === 'PICKUP') throw new ApiError('Your shop offers delivery only', 400);
  return value;
};

/**
 * What each kind allows, on the product as it will be saved.
 * @param {String} kind
 * @param {Object} p - variations, salePrice, priceTiers
 */
const assertKindShape = (kind, p) => {
  const variations = Array.isArray(p.variations) ? p.variations : [];
  if (kind === 'READY_TO_EAT') assertTodayShape(variations);
  if (kind === 'COOK_TO_ORDER' && stockedVariation(variations)) {
    throw new ApiError('Cooked-to-order food has no stock: remove the stock per choice', 400);
  }
  if (kind === 'LIVESTOCK' && variations.length) {
    throw new ApiError('Live animals have no choices. List animals that differ on their own.', 400);
  }
  if (kind === 'PACKAGE') {
    if (variations.length) throw new ApiError('A package has one price: remove the choices', 400);
    if (p.salePrice !== null && p.salePrice !== undefined) throw new ApiError('A package has one price: remove the sale price', 400);
    if (Array.isArray(p.priceTiers) && p.priceTiers.length) throw new ApiError('A package has one price: remove the bulk prices', 400);
  }
};

const PACKAGE_ITEMS_MAX = 20;
const PACKAGE_QUANTITY_MAX = 99;
const PACKAGE_COVER_MAX = 4;
const ITEM_FIELDS = {
  id: true, name: true, storeId: true, deletedAt: true, productType: true, listingKind: true,
  images: true, weightGrams: true, categoryId: true,
};

/**
 * The products a package holds, as the seller chose them: the shop's own,
 * not deleted, and neither live animals nor other packages.
 * @returns {Promise<Array<{ productId, quantity, product }>>}
 */
const validatePackageItems = async (raw, storeId) => {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError('Choose the products in this package', 400);
  if (raw.length > PACKAGE_ITEMS_MAX) throw new ApiError(`A package holds up to ${PACKAGE_ITEMS_MAX} different products`, 400);
  const lines = [];
  const seen = new Set();
  for (const line of raw) {
    const productId = typeof line?.productId === 'string' ? line.productId.trim() : '';
    if (!productId) throw new ApiError('Choose the products in this package', 400);
    if (seen.has(productId)) throw new ApiError('Each product goes in once: change how many instead', 400);
    seen.add(productId);
    const quantity = typeof line.quantity === 'string' ? Number(line.quantity.trim()) : line.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > PACKAGE_QUANTITY_MAX) {
      throw new ApiError(`How many of each: a whole number from 1 to ${PACKAGE_QUANTITY_MAX}`, 400);
    }
    lines.push({ productId, quantity });
  }
  if (lines.reduce((sum, l) => sum + l.quantity, 0) < 2) throw new ApiError('A package needs at least 2 items', 400);

  const found = await prisma.product.findMany({ where: { id: { in: [...seen] } }, select: ITEM_FIELDS });
  const byId = new Map(found.map((p) => [p.id, p]));
  return lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product || product.storeId !== storeId || product.deletedAt) {
      throw new ApiError('Choose products your shop sells', 400);
    }
    const kind = kindOf(product);
    if (kind === 'PACKAGE') throw new ApiError(`${product.name} is a package. A package can't go inside another.`, 400);
    if (kind === 'LIVESTOCK') throw new ApiError(`${product.name} is a live animal. Live animals can't go in a package.`, 400);
    return { ...line, product };
  });
};

/**
 * What a package's items decide. Its weight: the items' total when every one
 * is weighed goods, else none (so couriers only take packages of goods). Its
 * photos and words, when the seller left them out: up to 4 of the items'
 * photos, and "Includes: 2 x Pancit, 1 x Roasted Chicken". Its category, when
 * none was chosen: the first item's. details.autoCover / autoDescription
 * remember which were filled in, to fill them again on later saves.
 * @param {Object} args
 * @param {Object} args.data - Sanitised payload
 * @param {Object} args.store - The seller's store
 * @param {Object|null} args.product - The package being edited (null: new)
 * @param {Object} args.fields - The validated fields
 * @returns {Promise<Object>} fields to save, with `items` when they were sent
 */
const packageFields = async ({ data, store, product, fields }) => {
  const sending = has(data, 'packageItems') || !product;
  const items = sending
    ? await validatePackageItems(data.packageItems, store.id)
    : await prisma.packageItem.findMany({
      where: { packageId: product.id },
      orderBy: { position: 'asc' },
      select: { productId: true, quantity: true, product: { select: ITEM_FIELDS } },
    });
  const was = product?.details || {};
  const out = {};

  out.weightGrams = items.length && items.every((it) => kindOf(it.product) === 'REGULAR' && it.product.weightGrams > 0)
    ? items.reduce((sum, it) => sum + it.product.weightGrams * it.quantity, 0)
    : null;

  const autoCover = !product || has(data, 'images') ? noImages(data.images) : Boolean(was.autoCover);
  if (autoCover) {
    out.images = items.map((it) => normalizeImages(it.product.images)[0]).filter(Boolean).slice(0, PACKAGE_COVER_MAX);
  }
  const autoDescription = !product || has(data, 'description') ? blankText(data.description) : Boolean(was.autoDescription);
  if (autoDescription) {
    out.description = `Includes: ${items.map((it) => `${it.quantity} x ${it.product.name}`).join(', ')}`.slice(0, DESCRIPTION_MAX);
  }
  if (!product && !fields.categoryId) out.categoryId = items[0].product.categoryId;

  const kept = has(data, 'details')
    ? validateDetails('PACKAGE', data.details)
    : { packageKind: was.packageKind, noticeHours: was.noticeHours };
  out.details = {
    ...Object.fromEntries(Object.entries(kept || {}).filter(([, v]) => v !== undefined)),
    autoCover,
    autoDescription,
  };
  if (sending) out.items = items.map((it, position) => ({ productId: it.productId, quantity: it.quantity, position }));
  return out;
};

/**
 * A seller may only write products while their store is open for business.
 * @param {Object|null} store
 * @param {String} action - Verb for the message
 */
const assertStoreCanEdit = (store, action) => {
  if (!store) {
    throw new ApiError(`You must have a store to ${action} products`, 403);
  }
  if (store.isSuspended) {
    throw new ApiError(`Your store is suspended. Cannot ${action} products.`, 403);
  }
  if (!store.isActive || store.deletedAt) {
    throw new ApiError(`Your store is inactive. Cannot ${action} products.`, 403);
  }
};

// ── Public shaping ──────────────────────────────────────────────────────

const PUBLIC_STORE_FIELDS = [
  'id', 'name', 'slug', 'logo', 'fulfillmentMode', 'acceptsCod', 'paymentQrType',
  'pickupAddress', 'isActive', 'isSuspended', 'municipality',
  'vacationUntil', 'vacationNote', 'openingHours', 'prepDays',
];
const PRIVATE_PRODUCT_FIELDS = ['moderationNote', 'approvedById', 'imageHash'];

/** The QR a shop takes payment with: none until it has put its QR up. */
const shownQrType = (store) => (store.paymentQrImage ? store.paymentQrType ?? null : null);

/**
 * Reduce a full product record to what an anonymous buyer may see.
 * @param {Object} product - Full record from the repository
 * @param {Object} [options]
 * @param {Boolean} [options.withOwner] - Include store.owner { id, fullName } (detail only)
 * @returns {Object}
 */
const toPublicProduct = (product, { withOwner = false } = {}) => {
  if (!product) return product;
  const out = { ...product };
  for (const field of PRIVATE_PRODUCT_FIELDS) delete out[field];

  if (product.store) {
    const store = {};
    for (const field of PUBLIC_STORE_FIELDS) {
      if (product.store[field] !== undefined) store[field] = product.store[field];
    }
    if (store.paymentQrType !== undefined) store.paymentQrType = shownQrType(product.store);
    if (withOwner && product.store.owner) {
      store.owner = { id: product.store.owner.id, fullName: product.store.owner.fullName };
    }
    out.store = store;
  }
  return out;
};

/** Strip the internal-only store fields that ride along for the visibility and QR rules. */
const stripStoreInternals = (product) => {
  if (!product?.store) return product;
  const store = { ...product.store };
  if (store.paymentQrImage !== undefined) {
    store.paymentQrType = shownQrType(store);
    delete store.paymentQrImage;
  }
  delete store.deletedAt;
  return { ...product, store };
};

const isPubliclyVisible = (product) =>
  product.status === 'APPROVED'
  && !!product.store
  && product.store.isActive === true
  && product.store.isSuspended === false
  && product.store.isApproved !== false
  && !product.store.deletedAt;

/**
 * Apply the detail visibility rule and shape the record for the viewer.
 * The owner and admins see the full record; everyone else, signed in or not,
 * sees the public shape when the product is approved in a public shop.
 * `store.readyToSell` says whether the shop takes orders yet
 * (shopReadiness.service); checkout enforces it.
 */
const presentDetail = async (product, viewerId, viewerRole) => {
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }
  const isOwner = !!viewerId && product.store?.owner?.id === viewerId;
  if (!isOwner && !isAdminRole(viewerRole) && !isPubliclyVisible(product)) {
    throw new ApiError('Product not found', 404);
  }
  const shaped = isOwner || isAdminRole(viewerRole)
    ? stripStoreInternals(product)
    : toPublicProduct(product, { withOwner: true });
  if (shaped.store) {
    shaped.store = { ...shaped.store, readyToSell: await shopReadiness.isReady(product.storeId || product.store.id) };
  }
  return shaped;
};

// ── Listing option normalisation ────────────────────────────────────────

const toInt = (value, fallback) => {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const toPrice = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Whitelist and clamp everything a caller can put in the query string.
 * @param {Object} options - Raw options from the controller
 * @returns {Object} Safe options
 */
const normalizeListOptions = (options = {}) => {
  const maxPageSize = config.pagination.maxPageSize || 100;
  const defaultPageSize = Math.min(config.pagination.defaultPageSize || 20, maxPageSize);

  const page = Math.max(1, toInt(options.page, 1));
  const pageSize = Math.min(maxPageSize, Math.max(1, toInt(options.pageSize, defaultPageSize)));

  const search = typeof options.search === 'string'
    ? cleanText(options.search, { maxLength: SEARCH_MAX })
    : undefined;

  const minPrice = toPrice(options.minPrice);
  const maxPrice = toPrice(options.maxPrice);

  return {
    ...options,
    page,
    pageSize,
    search: search || undefined,
    minPrice,
    maxPrice,
    sortBy: SORT_BY.has(options.sortBy) ? options.sortBy : 'createdAt',
    sortOrder: options.sortOrder === 'asc' ? 'asc' : 'desc',
    status: PRODUCT_STATUSES.has(options.status) ? options.status : undefined,
    // Seller lists only: 'out' (out of stock) or 'restock' (out of stock or running low).
    stockFilter: options.stock === 'out' || options.stock === 'restock' ? options.stock : undefined,
    // Only Available Today products taking orders now.
    todayOnly: options.today === '1' || options.today === 'true' || options.today === true,
    // Seller lists: only always-available or only Available Today products.
    listingKind: options.kind === 'TODAY' || options.kind === 'REGULAR' ? options.kind : undefined,
    // One kind of product (?type=PACKAGE…).
    productType: PRODUCT_TYPES.includes(options.type) ? options.type : undefined,
  };
};

/**
 * Product Service
 * Contains business logic for product operations
 */

/**
 * Generate unique slug from product name
 * @param {String} name - Product name
 * @returns {Promise<String>} Unique slug
 */
const generateSlug = async (name) => {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'product';

  // Check if slug exists and add number if needed
  let counter = 1;
  let uniqueSlug = slug;

  while (await productRepository.slugExists(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
};

/**
 * Create product (Seller only)
 * @param {String} userId - User ID
 * @param {Object} data - Product data
 * @returns {Promise<Object>} Created product
 */
// A shop that ships with couriers needs every product's weight: it is how
// the shipping fee is worked out.
const shipsWithCouriers = async (storeId) => (
  (await require('../config/database').storeCourier.count({ where: { storeId } })) > 0
);
const WEIGHT_NEEDED = 'Add the weight with packaging: your shop ships with couriers, and they charge by weight';

/**
 * Available Today products keep their stock per window, so they cannot also
 * keep stock per option (prices per option are fine).
 */
const assertTodayShape = (variations) => {
  if (stockedVariation(variations)) {
    throw new ApiError('Available Today products have one quantity per day: remove the stock per option first', 400);
  }
};

const createProduct = async (userId, rawData) => {
  const data = cleanFields(rawData || {}, PRODUCT_TEXT_FIELDS);
  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);
  assertStoreCanEdit(store, 'create');

  const kind = resolveKind(data, null);
  const fields = await validateProductPayload(data, { partial: false, kind });
  const options = normalizeProductOptions(data);
  const shape = { ...fields, ...options };
  checkSale(shape);
  checkTiers(shape);
  assertKindShape(kind, shape);
  // Couriers price goods by weight; the other kinds never go by courier, and
  // a package's weight comes from its items.
  if (kind === 'REGULAR' && !shape.weightGrams && await shipsWithCouriers(store.id)) {
    throw new ApiError(WEIGHT_NEEDED, 400);
  }

  const kindData = { productType: kind, listingKind: kind === 'READY_TO_EAT' ? 'TODAY' : 'REGULAR' };
  if (has(data, 'fulfillment')) kindData.fulfillment = validateFulfillment(data.fulfillment, store);
  if (kind === 'PACKAGE') {
    const { items, ...pkg } = await packageFields({ data, store, product: null, fields });
    Object.assign(kindData, pkg, { packageItems: { create: items } });
  } else {
    const details = validateDetails(kind, data.details, { heads: shape.stock });
    if (details) kindData.details = details;
  }
  // Available Today food is stocked by its windows; paluto keeps no stock.
  if (kind === 'READY_TO_EAT' || kind === 'COOK_TO_ORDER') kindData.stock = 0;
  // Animals are listed a few heads at a time: only "sold out" is worth a
  // warning, unless the seller sets their own mark.
  if (kind === 'LIVESTOCK' && !has(data, 'lowStockThreshold')) kindData.lowStockThreshold = 0;

  // Ready-to-eat food can go on sale for today as it is saved: the post is
  // checked here, before anything is saved, and published after.
  let todayPost = null;
  if (data.todayPost !== undefined && data.todayPost !== null) {
    if (kind !== 'READY_TO_EAT') throw new ApiError('Only ready-to-eat food is posted for today', 400);
    if (typeof data.todayPost !== 'object' || Array.isArray(data.todayPost)) throw new ApiError("Check today's post", 400);
    todayPost = await availabilityService.checkPost(store, data.todayPost);
  }

  // Generate unique slug — derived from the name only, never client-assignable
  const slug = await generateSlug(shape.name);

  // If the seller's shop is already approved (active + not suspended), products go live immediately.
  // Admins can still suspend or hide them later.
  const initialStatus = store.isActive && !store.isSuspended ? 'APPROVED' : 'PENDING';

  // Create product
  const imageHash = await computeImageHashSafe(kindData.images || shape.images);
  const product = await productRepository.createProduct({
    ...shape,
    ...kindData,
    slug,
    imageHash,
    storeId: store.id,
    municipalityId: store.municipalityId,
    status: initialStatus,
  });

  if (!todayPost) return stripStoreInternals(product);
  // The product stays saved even if its post can't go up now.
  try {
    await availabilityService.publishChecked(userId, store, product, todayPost);
  } catch (err) {
    const reason = err instanceof ApiError ? err.message : 'Please try again from Today\'s menu.';
    return { ...stripStoreInternals(product), todayPostError: `Saved, but it isn't posted for today yet. ${reason}` };
  }
  return stripStoreInternals(await productRepository.findById(product.id));
};

/**
 * Get product by ID
 * @param {String} id - Product ID
 * @returns {Promise<Object>} Product
 */
const getProductById = async (id, viewerId = null, viewerRole = null) => {
  // The product payload does not vary by caller; the visibility check below
  // deliberately runs on the cached value, not inside the cache, so one
  // caller's permission can never be cached for another.
  const product = await cached.product({ id }, () => productRepository.findById(id));
  return presentDetail(product, viewerId, viewerRole);
};

/**
 * Get product by slug
 * @param {String} slug - Product slug
 * @returns {Promise<Object>} Product
 */
const getProductBySlug = async (slug, viewerId = null, viewerRole = null) => {
  const product = await cached.product({ slug }, () => productRepository.findBySlug(slug));
  return presentDetail(product, viewerId, viewerRole);
};

/**
 * Get all products with filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const getProducts = async (rawOptions) => {
  const options = normalizeListOptions(rawOptions);

  // If not admin, only show approved products from active, non-suspended stores.
  if (!options.isAdmin) {
    options.status = 'APPROVED';
    // Available Today products show only while a window takes orders.
    options.publicListing = true;
    options.storeIsActive = true;
    options.storeIsSuspended = false;
    options.storeIsApproved = true;
    // A seller's feed leaves out their own products. A shop's own page
    // (storeId) lists all of that shop's products for everyone, its owner
    // included; it showed the owner an empty shop. Buyers own no products,
    // so their feed is the shared one (and comes from the cache).
    options.excludeOwnerId = options.userRole === 'SELLER' && !options.storeId
      ? options.userId
      : undefined;
  }

  // Each product's store says whether it takes orders yet, so cards can hold
  // back "add to cart". Asked after the cache; the public lists reuse an
  // answer up to 15 seconds old, since every page view asks.
  const shape = async (result) => {
    const products = options.isAdmin
      ? result.products.map(stripStoreInternals)
      : result.products.map((p) => toPublicProduct(p));
    const ready = await shopReadiness.readyIds(
      products.map((p) => p.storeId || p.store?.id),
      { maxAgeMs: options.isAdmin ? 0 : 15 * 1000 },
    );
    return {
      ...result,
      products: products.map((p) => (p.store
        ? { ...p, store: { ...p.store, readyToSell: ready.has(p.storeId || p.store.id) } }
        : p)),
    };
  };

  // Only the public catalogue is shared between callers. An admin listing is
  // private and must be fresh for moderation; a seller's feed hides their own
  // products, which makes it caller-specific. Both go straight to the database.
  const isSharedPublicView = !options.isAdmin && !options.excludeOwnerId;
  if (!isSharedPublicView) {
    return shape(await productRepository.findAll(options));
  }

  // Every dimension that changes the result is part of the key — miss one and
  // two different filters would collide on the same entry.
  const key = {
    page: options.page,
    pageSize: options.pageSize,
    storeId: options.storeId,
    categoryId: options.categoryId,
    municipalityId: options.municipalityId,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    search: options.search,
    sortBy: options.sortBy,
    sortOrder: options.sortOrder,
    todayOnly: options.todayOnly,
    listingKind: options.listingKind,
    productType: options.productType,
  };

  // Free-text search has a long tail of one-off keys, so it gets a shorter TTL
  // and its own namespace to keep it from evicting the browse pages.
  const load = () => productRepository.findAll(options);
  const result = options.search
    ? await cached.productSearch(key, load)
    : await cached.productList(key, load);
  return shape(result);
};

/**
 * Get my products (seller)
 * @param {String} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Products and pagination
 */
const getMyProducts = async (userId, rawOptions) => {
  const store = await storeRepository.findByOwnerId(userId);

  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  const options = normalizeListOptions(rawOptions);
  const result = await productRepository.findByStore(store.id, options);
  return { ...result, products: result.products.map(stripStoreInternals) };
};

/**
 * The seller's products at a glance: counts per status, out of stock, running low.
 * @param {String} userId - Seller's user ID
 */
const getMyProductSummary = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }
  return productRepository.getStoreSummary(store.id);
};

/**
 * Tell the store's followers a product is back in stock. Best-effort.
 */
const notifyRestock = async (store, before, after) => {
  try {
    const wasOutOfStock = (before.stock || 0) === 0;
    const nowInStock = (after.stock || 0) > 0;
    if (wasOutOfStock && nowInStock && after.status === 'APPROVED') {
      await followService.notifyFollowers(after.storeId, {
        type: 'STORE_NEW_PRODUCT',
        title: `${store.name} restocked ${after.name}`,
        message: `${after.name} is back in stock at ${store.name}.`,
        relatedId: after.id,
      });
    }
  } catch (err) {
    console.error('[product] restock notification failed:', err.message);
  }
};

/**
 * A new sale (or a new sale price) on a product: the buyers who saved it in
 * their wishlist hear about it, once per change, while it is on or ahead.
 */
const notifySale = async (store, before, after) => {
  try {
    if (after.status !== 'APPROVED' || after.salePrice === null) return;
    const same = Number(before.salePrice) === Number(after.salePrice)
      && String(before.saleStartsAt || '') === String(after.saleStartsAt || '');
    if (same) return;
    const onNow = activeSalePrice(after) !== null;
    const startsLater = after.saleStartsAt && new Date(after.saleStartsAt) > new Date();
    if (!onNow && !startsLater) return;
    const fans = await prisma.wishlistItem.findMany({ where: { productId: after.id }, select: { userId: true }, take: 2000 });
    const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const when = startsLater
      ? ` from ${new Date(after.saleStartsAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}`
      : '';
    for (const { userId } of fans) {
      if (userId === store.ownerId) continue;
      await notificationService.createNotification({
        userId,
        type: 'PRICE_DROP',
        title: `On sale: ${after.name}`,
        message: `Now ${peso(after.salePrice)} (was ${peso(after.price)})${when} at ${store.name}.`,
        relatedId: after.id,
      });
    }
  } catch (err) {
    console.error('[product] sale notification failed:', err.message);
  }
};

/**
 * Update product (Owner only)
 * @param {String} productId - Product ID
 * @param {String} userId - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated product
 */
const updateProduct = async (productId, userId, rawData) => {
  const data = cleanFields(rawData || {}, PRODUCT_TEXT_FIELDS);
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);

  if (!store || product.storeId !== store.id) {
    throw new ApiError('You can only update your own products', 403);
  }
  assertStoreCanEdit(store, 'update');

  // What it is after this save (a package stays a package).
  const wasKind = kindOf(product);
  const kind = resolveKind(data, wasKind);
  const kindChanged = kind !== wasKind;
  const wasToday = product.listingKind === 'TODAY';
  if (kindChanged && kind === 'LIVESTOCK'
    && await prisma.packageItem.count({ where: { productId, package: { deletedAt: null } } })) {
    throw new ApiError('This product is in a package, and live animals can\'t be. Take it out of the package first.', 400);
  }

  // Only whitelisted fields, each validated. `slug` is never accepted.
  const updateData = await validateProductPayload(data, { partial: true, kind });
  // Couriers price goods by weight: goods keep one in a shop that uses them.
  const weightGone = updateData.weightGrams === null
    || (kindChanged && updateData.weightGrams === undefined && !product.weightGrams);
  if (kind === 'REGULAR' && weightGone && await shipsWithCouriers(store.id)) {
    throw new ApiError(WEIGHT_NEEDED, 400);
  }

  // Renaming regenerates the slug; the old slug's cache entry is cleared below.
  let previousSlug = null;
  if (updateData.name !== undefined && updateData.name !== product.name) {
    updateData.slug = await generateSlug(updateData.name);
    previousSlug = product.slug;
  }

  if (has(data, 'returnPolicy') || has(data, 'variations')) {
    Object.assign(updateData, normalizeProductOptions({
      returnPolicy: data.returnPolicy,
      variations: data.variations,
    }));
  }

  const merged = { ...product, ...updateData };
  const SALE_FIELDS = ['salePrice', 'saleStartsAt', 'saleEndsAt', 'price', 'variations', 'priceTiers'];
  if (SALE_FIELDS.some((k) => updateData[k] !== undefined)) {
    checkSale(merged);
    checkTiers({ ...merged, priceTiers: Array.isArray(merged.priceTiers) ? merged.priceTiers : null });
  }
  assertKindShape(kind, merged);

  if (kindChanged || has(data, 'productType') || has(data, 'listingKind')) {
    updateData.productType = kind;
    updateData.listingKind = kind === 'READY_TO_EAT' ? 'TODAY' : 'REGULAR';
  }
  if (has(data, 'fulfillment')) updateData.fulfillment = validateFulfillment(data.fulfillment, store);

  // The kind's facts: checked again when sent, or when the kind changes.
  const heads = updateData.stock !== undefined ? updateData.stock : Number(product.stock);
  let packageItems = null;
  if (kind === 'PACKAGE') {
    const { items, ...pkg } = await packageFields({ data, store, product, fields: updateData });
    Object.assign(updateData, pkg);
    packageItems = items || null;
  } else if (has(data, 'details') || kindChanged) {
    updateData.details = validateDetails(kind, has(data, 'details') ? data.details : null, { heads });
  } else if (kind === 'LIVESTOCK' && updateData.stock !== undefined) {
    validateDetails(kind, product.details, { heads });
  }

  // Available Today: the window sets the stock, not the editor. Paluto keeps
  // none: switching to it takes away what stock there was (in the ledger).
  let stockReason;
  if (kind === 'READY_TO_EAT') delete updateData.stock;
  if (kind === 'COOK_TO_ORDER') {
    delete updateData.stock;
    if (kindChanged && !wasToday && Number(product.stock) > 0) {
      updateData.stock = 0;
      stockReason = 'KIND_SWITCH';
    }
  }
  if (packageItems) updateData.packageItems = { deleteMany: {}, create: packageItems };

  // Switching away from Available Today ends its windows first (their stock
  // goes to 0, then whatever stock the seller entered applies).
  if (wasToday && kind !== 'READY_TO_EAT') {
    const windows = await prisma.productAvailability.findMany({
      where: { productId, status: { in: ['LIVE', 'SCHEDULED'] } },
      select: { id: true },
    });
    for (const w of windows) await availabilityRepository.closeWindow(w.id, { actorId: userId });
  }

  // If product was suspended/archived and is being edited, send it back for review
  if (product.status === 'SUSPENDED' || product.status === 'ARCHIVED') {
    updateData.status = 'PENDING';
  }

  if (updateData.images !== undefined) {
    updateData.imageHash = await computeImageHashSafe(updateData.images);
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError('No valid fields to update', 400);
  }

  // The stock the editor opened with, so sales made meanwhile are kept.
  const stockBase = !stockReason && rawData && (rawData.stockWas != null || rawData.stocksWas)
    ? {
      stock: Number.isFinite(Number(rawData.stockWas)) ? Number(rawData.stockWas) : null,
      stocks: rawData.stocksWas && typeof rawData.stocksWas === 'object' && !Array.isArray(rawData.stocksWas) ? rawData.stocksWas : null,
    }
    : null;

  const updated = await productRepository.updateProduct(productId, updateData, {
    actorId: userId,
    previousSlug,
    stockBase,
    stockReason,
  });
  // Now sold in Available Today windows: no stock until a window opens.
  if (!wasToday && kind === 'READY_TO_EAT' && Number(updated.stock) > 0) {
    await prisma.$transaction((tx) => availabilityRepository.setStockTx(tx, productId, 0, 'TODAY_SWITCH', productId, userId));
    await productRepository.invalidateProductIds([productId]);
    updated.stock = 0;
  }

  if (updateData.stock !== undefined) {
    await notifyRestock(store, product, updated);
  }
  if (updateData.salePrice !== undefined || updateData.saleStartsAt !== undefined) {
    await notifySale(store, product, updated);
  }

  return stripStoreInternals(updated);
};

/**
 * Adjust stock by a relative amount (Owner only). Restocks and manual
 * corrections are written to the inventory ledger.
 * @param {String} productId
 * @param {String} userId
 * @param {Object} body - { delta, reason? }
 * @returns {Promise<Object>} Updated product
 */
const adjustStock = async (productId, userId, body = {}) => {
  const rawDelta = body?.delta;
  const delta = typeof rawDelta === 'string' ? Number(rawDelta.trim()) : Number(rawDelta);
  if (typeof rawDelta === 'boolean' || rawDelta === '' || rawDelta === null || rawDelta === undefined
    || !Number.isInteger(delta) || delta === 0) {
    throw new ApiError('Stock adjustment must be a non-zero whole number', 400);
  }
  if (Math.abs(delta) > STOCK_DELTA_MAX) {
    throw new ApiError(`Stock adjustment cannot exceed ${STOCK_DELTA_MAX.toLocaleString('en-US')} units`, 400);
  }
  // Optional free-text reason: validated so a bad payload is rejected up
  // front. The ledger's `reason` column carries the movement code
  // (RESTOCK / MANUAL_ADJUSTMENT), so the note itself is not persisted.
  const rawReason = body?.reason;
  if (rawReason !== undefined && rawReason !== null) {
    if (typeof rawReason !== 'string') {
      throw new ApiError('Reason must be text', 400);
    }
    if (cleanText(rawReason).length > STOCK_REASON_MAX) {
      throw new ApiError(`Reason cannot exceed ${STOCK_REASON_MAX} characters`, 400);
    }
  }

  const product = await productRepository.findById(productId);
  if (product?.listingKind === 'TODAY') {
    throw new ApiError("Available Today products: change the day's quantity in Available Today", 400);
  }
  if (product && isStockless(product)) {
    throw new ApiError('Cooked-to-order food has no stock to change: it is cooked when ordered', 400);
  }
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  const store = await storeRepository.findByOwnerId(userId);
  if (!store || product.storeId !== store.id) {
    throw new ApiError('You can only adjust stock on your own products', 403);
  }
  assertStoreCanEdit(store, 'update');

  if (stockedVariation(product.variations)) {
    throw new ApiError('This product has stock per option. Edit the product to change each option\'s stock.', 400);
  }

  if (delta > 0 && product.stock + delta > QUANTITY_MAX) {
    throw new ApiError(`Stock cannot exceed ${QUANTITY_MAX.toLocaleString('en-US')}`, 400);
  }

  const reason = delta > 0 ? 'RESTOCK' : 'MANUAL_ADJUSTMENT';

  let updated;
  try {
    updated = await productRepository.adjustStock(productId, delta, { reason, actorId: userId });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      throw new ApiError('Not enough stock to remove that quantity', 400);
    }
    throw err;
  }

  await notifyRestock(store, product, updated);
  return stripStoreInternals(updated);
};

/**
 * Delete product (Owner only)
 * @param {String} productId - Product ID
 * @param {String} userId - User ID
 * @returns {Promise<void>}
 */
const deleteProduct = async (productId, userId) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);

  if (!store || product.storeId !== store.id) {
    throw new ApiError('You can only delete your own products', 403);
  }

  await productRepository.softDeleteProduct(productId);
};

const cleanReason = (reason) => {
  const text = String(reason || '').trim();
  return text ? text.slice(0, 500) : null;
};

/**
 * Approve product (Admin only)
 * @param {String} productId - Product ID
 * @param {String} adminId - Approving admin user ID
 * @param {Object} [actor] - The acting admin (for municipality scope)
 * @returns {Promise<Object>} Updated product
 */
const approveProduct = async (productId, adminId, actor) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }

  if (product.status !== 'PENDING') {
    throw new ApiError('Only pending products can be approved', 400);
  }

  const updated = await productRepository.updateProduct(productId, {
    status: 'APPROVED',
    approvedById: adminId || null,
    approvedAt: new Date(),
    moderationNote: null,
  });

  let approvedStore = null;
  try {
    approvedStore = await storeRepository.findById(product.storeId);
    if (approvedStore?.ownerId) {
      await notificationService.notifyProductApproved(approvedStore.ownerId, product.id, product.name);
    }
  } catch (err) {
    console.error('[approveProduct] notification failed:', err.message);
  }

  // Notify followers that the store added a new product
  try {
    if (approvedStore) {
      await followService.notifyFollowers(product.storeId, {
        type: 'STORE_NEW_PRODUCT',
        title: `${approvedStore.name} added a new product`,
        message: `${product.name} is now available at ${approvedStore.name}.`,
        relatedId: product.id,
      });
    }
  } catch (err) {
    console.error('[approveProduct] follower fan-out failed:', err.message);
  }

  return stripStoreInternals(updated);
};

/**
 * Suspend product (Admin only)
 * @param {String} productId - Product ID
 * @param {Object} [actor] - The acting admin (for municipality scope)
 * @returns {Promise<Object>} Updated product
 */
const suspendProduct = async (productId, actor, reason) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }

  const note = cleanReason(reason);
  const updated = await productRepository.updateProduct(productId, { status: 'SUSPENDED', moderationNote: note });

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.notifyProductRejected(store.ownerId, product.id, product.name, { reason: note });
    }
  } catch (err) {
    console.error('[suspendProduct] notification failed:', err.message);
  }

  return stripStoreInternals(updated);
};

/**
 * Archive product (Admin only)
 * @param {String} productId - Product ID
 * @param {Object} [actor] - The acting admin (for municipality scope)
 * @returns {Promise<Object>} Updated product
 */
const archiveProduct = async (productId, actor, reason) => {
  const product = await productRepository.findById(productId);

  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }

  const note = cleanReason(reason);
  const updated = await productRepository.updateProduct(productId, { status: 'ARCHIVED', moderationNote: note });

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.notifyProductRejected(store.ownerId, product.id, product.name, { reason: note, archived: true });
    }
  } catch (err) {
    console.error('[archiveProduct] notification failed:', err.message);
  }

  return stripStoreInternals(updated);
};

/**
 * Undo a suspension or archive: the product goes back to APPROVED and the
 * moderation note is cleared (Admin only).
 */
const restoreProduct = async (productId, actor) => {
  const product = await productRepository.findById(productId);
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }
  if (actor?.role === 'MUNICIPAL_ADMIN' && product.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only moderate products in your assigned municipality', 403);
  }
  if (!['SUSPENDED', 'ARCHIVED'].includes(product.status)) {
    throw new ApiError('Only suspended or archived products can be restored', 400);
  }

  const updated = await productRepository.updateProduct(productId, {
    status: 'APPROVED',
    moderationNote: null,
  });

  try {
    const store = await storeRepository.findById(product.storeId);
    if (store?.ownerId) {
      await notificationService.createNotification({
        userId: store.ownerId,
        type: 'PRODUCT_APPROVED',
        title: 'Product restored',
        message: `Your product "${product.name}" is visible to buyers again.`,
        relatedId: product.id,
      });
    }
  } catch (err) {
    console.error('[restoreProduct] notification failed:', err.message);
  }

  return { ...stripStoreInternals(updated), previousStatus: product.status };
};

const normalizeImages = (raw) => {
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

/**
 * Search products by an uploaded image buffer using perceptual hashing.
 * Returns approved products ranked by Hamming distance, filtered to a threshold.
 */
const searchByImageBuffer = async (buffer, { threshold = 20, limit = 24 } = {}) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new ApiError('Image is required', 400);
  }

  let queryHash;
  try {
    queryHash = await bufferToDHash(buffer);
  } catch (err) {
    throw new ApiError(`Could not process image: ${err.message}`, 400);
  }

  const candidates = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: 'APPROVED',
      imageHash: { not: null },
      store: shopReadiness.VISIBLE_STORE,
    },
    include: {
      store: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true, image: true } },
      municipality: { select: { id: true, name: true } },
    },
  });

  const scored = candidates
    .map((p) => ({
      product: { ...p, images: normalizeImages(p.images) },
      distance: hammingDistance(queryHash, p.imageHash),
    }))
    .filter((r) => r.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  const stats = await productRepository.getStatsForIds(scored.map((r) => r.product.id));

  const results = scored.map(({ product, distance }) => ({
    ...toPublicProduct(product),
    ...(stats.get(product.id) || { averageRating: 0, reviewCount: 0, soldCount: 0 }),
    matchDistance: distance,
    matchSimilarity: Math.max(0, Math.round(((HASH_BIT_LENGTH - distance) / HASH_BIT_LENGTH) * 100)),
  }));

  return { queryHash, results };
};

const BULK_ACTIONS = {
  HIDE: { fromStatuses: ['APPROVED'], toStatus: 'HIDDEN' },
  UNHIDE: { fromStatuses: ['HIDDEN'], toStatus: 'APPROVED' },
};

/**
 * Bulk update the seller's own products (hide/unhide/delete)
 * @param {String} userId - Seller user ID
 * @param {Array<String>} ids - Product IDs
 * @param {String} action - 'HIDE' | 'UNHIDE' | 'DELETE'
 * @returns {Promise<Object>} Count of affected products
 */
const bulkUpdateProducts = async (userId, ids, action) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError('No products selected', 400);
  }
  if (ids.length > 100) {
    throw new ApiError('You can only update up to 100 products at a time', 400);
  }

  const store = await storeRepository.findByOwnerId(userId);
  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  if (action === 'DELETE') {
    const updatedCount = await productRepository.bulkSoftDelete(ids, store.id);
    return { updatedCount, action };
  }

  const bulkAction = BULK_ACTIONS[action];
  if (!bulkAction) {
    throw new ApiError('Invalid bulk action', 400);
  }

  const updatedCount = await productRepository.bulkUpdateStatus(
    ids,
    store.id,
    bulkAction.fromStatuses,
    bulkAction.toStatus
  );
  return { updatedCount, action };
};

module.exports = {
  createProduct,
  getProductById,
  getProductBySlug,
  getProducts,
  getMyProducts,
  getMyProductSummary,
  updateProduct,
  adjustStock,
  deleteProduct,
  approveProduct,
  suspendProduct,
  archiveProduct,
  restoreProduct,
  searchByImageBuffer,
  bulkUpdateProducts,
};
