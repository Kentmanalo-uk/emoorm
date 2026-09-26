const prisma = require('../config/database');
const config = require('../config/env');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const categoryRepository = require('../repositories/category.repository');
const notificationService = require('./notification.service');
const followService = require('./storeFollow.service');
const { cached } = require('../lib/cachePolicy');
const { cleanText, cleanFields } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');
const { bufferToDHash, hammingDistance, hashFromSource, HASH_BIT_LENGTH } = require('../utils/imageHash');
const { stockedVariation } = require('../utils/variantPricing');

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
const SORT_BY = new Set(['createdAt', 'price', 'name', 'orderCount']);
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

/**
 * Validate a create (all required) or update (partial) payload.
 * @param {Object} data - Sanitised payload
 * @param {Object} options
 * @param {Boolean} options.partial - true for updates
 * @returns {Promise<Object>} Only the validated, normalised fields present
 */
const validateProductPayload = async (data, { partial }) => {
  const out = {};

  if (!partial || has(data, 'name')) out.name = validateName(data.name);
  if (!partial || has(data, 'description')) out.description = validateDescription(data.description);
  if (!partial || has(data, 'price')) out.price = validatePrice(data.price);
  if (!partial || has(data, 'stock')) {
    out.stock = validateWholeNumber(partial ? data.stock : data.stock ?? 0, 'Product stock');
  }
  if (!partial || has(data, 'lowStockThreshold')) {
    out.lowStockThreshold = validateWholeNumber(partial ? data.lowStockThreshold : data.lowStockThreshold ?? 5, 'Low-stock threshold');
  }
  if (!partial || has(data, 'images')) out.images = validateImages(data.images);
  if (!partial || has(data, 'categoryId')) out.categoryId = await validateCategory(data.categoryId);

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
];
const PRIVATE_PRODUCT_FIELDS = ['moderationNote', 'approvedById', 'imageHash'];

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
    if (withOwner && product.store.owner) {
      store.owner = { id: product.store.owner.id, fullName: product.store.owner.fullName };
    }
    out.store = store;
  }
  return out;
};

/** Strip the internal-only store field that rides along for the visibility rule. */
const stripStoreInternals = (product) => {
  if (!product?.store) return product;
  const store = { ...product.store };
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
 * The owner and admins see the full record; everyone else sees the public
 * shape and only when the listing is live.
 */
const presentDetail = (product, viewerId, viewerRole) => {
  if (!product || product.deletedAt) {
    throw new ApiError('Product not found', 404);
  }
  const isOwner = !!viewerId && product.store?.owner?.id === viewerId;
  if (isOwner || isAdminRole(viewerRole)) {
    return stripStoreInternals(product);
  }
  if (!isPubliclyVisible(product)) {
    throw new ApiError('Product not found', 404);
  }
  return toPublicProduct(product, { withOwner: true });
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
const createProduct = async (userId, rawData) => {
  const data = cleanFields(rawData || {}, PRODUCT_TEXT_FIELDS);
  // Get seller's store
  const store = await storeRepository.findByOwnerId(userId);
  assertStoreCanEdit(store, 'create');

  const fields = await validateProductPayload(data, { partial: false });

  // Generate unique slug — derived from the name only, never client-assignable
  const slug = await generateSlug(fields.name);

  // If the seller's shop is already approved (active + not suspended), products go live immediately.
  // Admins can still suspend or hide them later.
  const initialStatus = store.isActive && !store.isSuspended ? 'APPROVED' : 'PENDING';

  // Create product
  const imageHash = await computeImageHashSafe(fields.images);
  const options = normalizeProductOptions(data);
  const product = await productRepository.createProduct({
    ...fields,
    slug,
    ...options,
    imageHash,
    storeId: store.id,
    municipalityId: store.municipalityId,
    status: initialStatus,
  });

  return stripStoreInternals(product);
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
    options.storeIsActive = true;
    options.storeIsSuspended = false;
    options.storeIsApproved = true;
    options.excludeOwnerId = options.userId;
  }

  const shape = (result) => (options.isAdmin
    ? { ...result, products: result.products.map(stripStoreInternals) }
    : { ...result, products: result.products.map((p) => toPublicProduct(p)) });

  // Only the anonymous public catalogue is shared between callers. An admin
  // listing is private and must be fresh for moderation; a signed-in seller's
  // listing hides their own products, which makes it caller-specific. Both go
  // straight to the database.
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

  // Only whitelisted fields, each validated. `slug` is never accepted.
  const updateData = await validateProductPayload(data, { partial: true });

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

  const updated = await productRepository.updateProduct(productId, updateData, {
    actorId: userId,
    previousSlug,
  });

  if (updateData.stock !== undefined) {
    await notifyRestock(store, product, updated);
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
      store: { isActive: true, isSuspended: false, isApproved: true },
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
