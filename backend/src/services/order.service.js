const prisma = require('../config/database');
const { feeFor } = require('../utils/courierRates');
const crypto = require('crypto');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const storeRepository = require('../repositories/store.repository');
const userRepository = require('../repositories/user.repository');
const voucherRepository = require('../repositories/voucher.repository');
const voucherService = require('./voucher.service');
const notificationService = require('./notification.service');
const { sendNewOrderEmail, sendOrderAcceptedEmail } = require('../utils/email');

// Order emails go out after the response: a slow or failing mail provider
// never holds up or fails an order.
const emailInBackground = (label, send) => {
  Promise.resolve()
    .then(send)
    .catch((err) => console.error(`[email] ${label} failed:`, err.message));
};
const identityVerificationService = require('./identityVerification.service');
const deliveryQuoteService = require('./deliveryQuote.service');
const courierService = require('./courier.service');
const shopReadiness = require('./shopReadiness.service');
const availabilityService = require('./availability.service');
const moormoveService = require('./moormove.service');
const { isOpen: riderOpen, withRiderDelivery } = require('./moormove.view');
const { ApiError } = require('../middleware/errorHandler');
const { snapshotReturnPolicy } = require('../utils/returnPolicy');
const shopHours = require('../utils/shopHours');
const { estimate } = require('../utils/eta');
const { normalizePin } = require('../utils/mapPin');
const phoneVerify = require('./phoneVerify.service');
const { maskPhone, areaOnly } = require('../utils/privacy');
const { unitPriceFor, stockForSelection } = require('../utils/variantPricing');
const {
  kindOf, isStockless, minOrderOf, courierRefusal, cookReady,
} = require('../utils/productKinds');

const PAYMENT_METHODS = ['COD', 'GCASH', 'QRPH'];

/** A confirmed QR order still waiting for the buyer's payment (or a new proof). */
const isDueForPayment = (order) => order.paymentMethod !== 'COD'
  && order.status === 'CONFIRMED'
  && ['PENDING', 'FAILED'].includes(order.paymentStatus);
const MAX_ORDER_LINES = 50;
// A shop that leaves a payment proof unchecked this long lets the buyer cancel.
const PAYMENT_CHECK_HOURS = Number(process.env.ORDER_PAYMENT_CHECK_HOURS) || 48;
const paymentCheckOverdue = (order) => order.paymentStatus === 'PENDING_VERIFICATION'
  && Date.now() - new Date(order.updatedAt).getTime() > PAYMENT_CHECK_HOURS * 3600 * 1000;

/**
 * Order Service
 * Contains business logic for order operations
 */

const generateOrderNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EM-${ts}-${rand}`;
};

const normalizeSelectedVariations = (product, selectedVariations) => {
  const definitions = Array.isArray(product.variations) ? product.variations : [];
  if (!definitions.length) return null;

  if (!selectedVariations || typeof selectedVariations !== 'object' || Array.isArray(selectedVariations)) {
    throw new ApiError(`Please select all options for ${product.name}`, 400);
  }

  const normalized = {};
  for (const definition of definitions) {
    const name = String(definition.name || '').trim();
    const selected = String(selectedVariations[name] || '').trim();
    const options = Array.isArray(definition.options) ? definition.options.map(String) : [];
    if (!selected || !options.includes(selected)) {
      throw new ApiError(`Please select ${name} for ${product.name}`, 400);
    }
    normalized[name] = selected;
  }
  return normalized;
};

/** What a package held when it was ordered: [{ productId, name, quantity, image }]. */
const packageSnapshot = (product) => (product.packageItems || []).map((it) => ({
  productId: it.productId,
  name: it.product?.name || '',
  quantity: it.quantity,
  image: it.product?.images?.[0] || null,
}));

const HOUR_MS = 3600 * 1000;

/**
 * When the buyer can expect an order that is not Available Today: the shop's
 * usual estimate for its goods (eta.js), and for cooked-to-order food its
 * cooking time within the shop's cooking days and hours (cookReady). A mixed
 * order goes by the later of the two. A package that needs ordering ahead is
 * ready no sooner than that.
 */
const orderEta = (store, products, how, now = new Date()) => {
  const goods = products.filter((p) => !isStockless(p));
  const parts = [
    ...(goods.length ? [estimate(store, how, now)] : []),
    ...products.filter(isStockless).map((p) => cookReady(p.details, now, store.openingHours)),
  ];
  const eta = {
    from: new Date(Math.max(...parts.map((p) => p.from.getTime()))),
    to: new Date(Math.max(...parts.map((p) => p.to.getTime()))),
  };
  const noticeHours = Math.max(0, ...products
    .filter((p) => kindOf(p) === 'PACKAGE')
    .map((p) => Number(p.details?.noticeHours) || 0));
  const earliest = now.getTime() + noticeHours * HOUR_MS;
  if (eta.from.getTime() < earliest) eta.from = new Date(earliest);
  if (eta.to < eta.from) eta.to = eta.from;
  return eta;
};

/**
 * Create order (checkout)
 * @param {String} userId - Buyer user ID
 * @param {Object} data - Order data
 * @returns {Promise<Object>} Created order
 */
/**
 * The seller's reason, checked against where the order is. After a MoorMove
 * rider couldn't deliver it (`riderFailed`), the order is back in To ship but
 * the buyer may well have refused it or not been there.
 */
const sellerCancelReason = (order, reason, { riderFailed = false } = {}) => {
  const key = reason ? String(reason).toUpperCase() : 'SELLER_CANCELLED';
  if (!(key in SELLER_CANCEL_REASONS)) throw new ApiError('Choose why the order is cancelled', 400);
  const only = SELLER_CANCEL_REASONS[key];
  const afterRider = riderFailed && ['REFUSED', 'NO_SHOW'].includes(key) && order.status === 'TO_SHIP';
  if (only && !only.includes(order.status) && !afterRider) {
    throw new ApiError(key === 'NO_SHOW'
      ? 'A no-show is for an order that was ready for pickup'
      : 'Refused is for an order that was out for delivery', 400);
  }
  return key;
};

// Cancellations that were the buyer's doing (an order taken back after the
// shop accepted it, not collected, refused at the door, or not paid).
const BUYER_FAULT = ['NO_SHOW', 'REFUSED', 'UNPAID'];

/**
 * A buyer's record over the last year, for the shop deciding on an order:
 * finished orders, and the ones that fell through on the buyer's side.
 * Counts only; no other shop's name or details.
 */
const buyerRecord = async (orderId, sellerId) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, store: { select: { ownerId: true } } } });
  if (!order) throw new ApiError('Order not found', 404);
  if (order.store.ownerId !== sellerId) throw new ApiError('You can only see buyers of your own orders', 403);
  const since = new Date(Date.now() - 365 * 86400e3);
  const rows = await prisma.order.groupBy({
    by: ['status', 'cancelReason'],
    where: { buyerId: order.buyerId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const count = (fn) => rows.filter(fn).reduce((n, r) => n + r._count._all, 0);
  const user = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { createdAt: true, phoneVerifiedAt: true } });
  return {
    completed: count((r) => r.status === 'COMPLETED'),
    noShows: count((r) => r.cancelReason === 'NO_SHOW'),
    refused: count((r) => r.cancelReason === 'REFUSED'),
    unpaid: count((r) => r.cancelReason === 'UNPAID'),
    cancelledByBuyer: count((r) => r.cancelReason === 'BUYER_CANCELLED'),
    fellThrough: count((r) => BUYER_FAULT.includes(r.cancelReason)),
    memberSince: user?.createdAt || null,
    phoneVerified: Boolean(user?.phoneVerifiedAt),
  };
};

/**
 * After an order: the products whose stock went from above their low-stock
 * threshold to at or below it. Only the crossing is told, so a product that
 * keeps selling while low does not send a notice with every order.
 */
const notifyStockCrossings = async (sellerId, items) => {
  const ordered = new Map();
  for (const item of items) ordered.set(item.productId, (ordered.get(item.productId) || 0) + item.quantity);
  const products = await prisma.product.findMany({
    where: { id: { in: [...ordered.keys()] }, listingKind: 'REGULAR', productType: { not: 'COOK_TO_ORDER' } },
    select: { id: true, name: true, stock: true, lowStockThreshold: true },
  });
  const crossed = products.filter((p) => p.stock <= p.lowStockThreshold && p.stock + ordered.get(p.id) > p.lowStockThreshold);
  if (crossed.length) await notificationService.notifyLowStock(sellerId, crossed);
};

/**
 * The order's delivery distance columns from a quote (the shop's or
 * MoorMove's): { deliveryDistanceKm, deliveryDistanceSource }, or nothing.
 */
const DISTANCE_SOURCES = ['ROAD', 'ESTIMATE', 'NONE'];
const deliveryDistance = (q) => {
  if (!q) return {};
  const km = q.distanceKm == null ? null : Number(q.distanceKm);
  const source = DISTANCE_SOURCES.includes(q.distanceSource) ? q.distanceSource : null;
  return {
    deliveryDistanceKm: Number.isFinite(km) && km >= 0 && km < 10000 ? Math.round(km * 100) / 100 : null,
    // A km without a source (an older MoorMove) was a straight-line estimate.
    deliveryDistanceSource: source || (Number.isFinite(km) ? 'ESTIMATE' : null),
  };
};

// Unconfirmed (PENDING) orders one buyer may hold: overall, and with one shop.
const OPEN_ORDERS_MAX = Math.max(1, parseInt(process.env.OPEN_ORDERS_MAX || '8', 10) || 8);
const OPEN_ORDERS_PER_STORE = Math.max(1, parseInt(process.env.OPEN_ORDERS_PER_STORE || '3', 10) || 3);

const createOrder = async (userId, data) => {
  const {
    storeId,
    items,
    deliveryAddress,
    deliveryNotes,
    deliveryLatitude,
    deliveryLongitude,
    contactNumber,
    fulfillmentMethod = 'DELIVERY',
    paymentMethod = 'COD',
    paymentReference,
    paymentProofUrl,
    buyerMunicipalityId,
    buyerBarangay,
    buyerProvince,
    checkoutKey,
    voucherCode,
    courierId,
    deliveryPartner,
  } = data;

  // A MoorMove rider instead of the shop or a courier (delivery only).
  const partner = deliveryPartner ? String(deliveryPartner).trim().toUpperCase() : null;
  if (partner && partner !== 'MOORMOVE') throw new ApiError('Choose how the order is delivered again', 400);
  if (partner && fulfillmentMethod !== 'DELIVERY') throw new ApiError('A MoorMove rider is for delivery orders', 400);
  if (partner && courierId) throw new ApiError('Choose either a courier or a MoorMove rider', 400);

  // Validate buyer
  const buyer = await userRepository.findById(userId);
  if (!buyer) {
    throw new ApiError('Buyer not found', 404);
  }

  await identityVerificationService.assertVerifiedForCheckout(userId);

  if (checkoutKey) {
    const existing = await orderRepository.findByCheckoutKey(userId, String(checkoutKey));
    // The same checkout sent again (a lost response): the order it placed.
    // Unless that order was cancelled since: then this is not a success.
    if (existing && existing.status === 'CANCELLED') {
      throw new ApiError('That order was cancelled. Check your cart and place the order again.', 409);
    }
    if (existing) return existing;
  }

  if (!['DELIVERY', 'PICKUP'].includes(fulfillmentMethod)) {
    throw new ApiError('Invalid fulfillment method', 400);
  }

  // Delivery is priced and checked by the town and barangay given with the
  // order; the address the shop will go to must be in that same place, so a
  // cheaper town cannot be claimed for an address somewhere else.
  if (fulfillmentMethod === 'DELIVERY') {
    const townId = buyerMunicipalityId || buyer.municipalityId;
    const town = townId
      ? await prisma.municipality.findUnique({ where: { id: String(townId) }, select: { name: true } })
      : null;
    if (!town) throw new ApiError('Choose your town for delivery again.', 400);
    const fold = (t) => ` ${String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const address = fold(deliveryAddress);
    const barangay = buyerBarangay || buyer.barangay;
    if (!address.includes(fold(town.name)) || (barangay && !address.includes(fold(barangay)))) {
      throw new ApiError("The delivery address doesn't match the town and barangay you chose. Choose them again.", 400);
    }
  }

  if (!contactNumber) {
    throw new ApiError('Contact number is required', 400);
  }

  // Validate store
  const store = await storeRepository.findById(storeId);
  if (!store || store.deletedAt || store.isSuspended || !store.isActive || store.deletionRequestedAt || store.isApproved === false) {
    throw new ApiError('Store not found or suspended', 404);
  }
  if (store.ownerId === userId) {
    throw new ApiError('You cannot purchase from your own store', 400);
  }
  // Orders the shop has not confirmed yet hold its stock for up to two days
  // and each one emails the seller. A buyer may have a few at once, not a
  // pile: beyond this it is hoarding, by a script or by mistake.
  const [openAll, openHere] = await Promise.all([
    prisma.order.count({ where: { buyerId: userId, status: 'PENDING' } }),
    prisma.order.count({ where: { buyerId: userId, storeId, status: 'PENDING' } }),
  ]);
  if (openHere >= OPEN_ORDERS_PER_STORE || openAll >= OPEN_ORDERS_MAX) {
    throw new ApiError('You have orders still waiting for a shop to confirm. Please wait for those before placing another.', 429);
  }
  if (!(await shopReadiness.isReady(storeId))) {
    throw new ApiError("This shop isn't taking orders yet. Please check back soon.", 400);
  }
  const away = shopHours.awayUntil(store);
  if (away) {
    throw new ApiError(`This shop is away until ${shopHours.manilaDate(away)} and is not taking orders until then.`, 400);
  }

  // Fulfillment method must be supported by the store
  const mode = store.fulfillmentMode || 'DELIVERY';
  if (fulfillmentMethod === 'DELIVERY' && mode === 'PICKUP') {
    throw new ApiError('This store does not offer delivery', 400);
  }
  if (fulfillmentMethod === 'PICKUP' && mode === 'DELIVERY') {
    throw new ApiError('This store does not offer pickup', 400);
  }

  // Payment method must be allowed
  if (paymentMethod === 'BANK_TRANSFER') {
    throw new ApiError('Bank transfer is not available yet', 400);
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new ApiError('Invalid payment method', 400);
  }
  if (paymentMethod === 'COD' && store.acceptsCod === false) {
    throw new ApiError('This store does not accept Cash on Delivery', 400);
  }
  // Optional: cash on delivery only with a number proven by SMS.
  if (paymentMethod === 'COD') await phoneVerify.assertCodAllowed(userId);
  // QR orders are paid after the seller confirms them (To Pay in My Orders).
  // A reference and proof sent now (older app versions) are still accepted.
  const paidUpFront = paymentMethod !== 'COD' && Boolean(paymentReference?.trim() && paymentProofUrl);
  if ((paymentMethod === 'GCASH' || paymentMethod === 'QRPH') && !store.paymentQrImage) {
    throw new ApiError('This store has not set up QR payment', 400);
  }

  // Delivery-only validations. Delivered by the seller: the quote carries the
  // fee for this address, by distance from the shop's pin to the buyer's
  // (see deliveryQuote.service; worked out here, never taken from the
  // browser). Delivered by a courier the buyer chose: it goes anywhere in
  // the province, is priced on the parcel's weight below, and is paid online.
  let deliveryQuote = null;
  let courier = null;
  let riderPin = null;
  if (fulfillmentMethod === 'DELIVERY') {
    if (!deliveryAddress) {
      throw new ApiError('Delivery address is required', 400);
    }
    if (partner) {
      // Delivered by a MoorMove rider: anywhere the rider can reach from the
      // shop's pin, priced by MoorMove below (the shop's coverage doesn't apply).
      const check = await moormoveService.availability(store);
      if (!check.ok) throw new ApiError(`${check.reason}. Choose another way to receive it.`, 400);
      riderPin = normalizePin(deliveryLatitude, deliveryLongitude);
      if (riderPin.latitude == null) {
        throw new ApiError('Drop your pin on the map so the rider can find you', 400);
      }
    } else if (courierId) {
      courier = await courierService.courierForStore(storeId, courierId);
      if (!courier) throw new ApiError("This shop doesn't ship with that courier", 400);
      if (paymentMethod === 'COD') {
        throw new ApiError("Cash on delivery isn't available with courier delivery. Pay with GCash or QR Ph.", 400);
      }
    } else {
      if (store.selfDelivery === false) {
        throw new ApiError('This shop ships with couriers. Choose a courier.', 400);
      }
      const muniForCoverage = buyerMunicipalityId || buyer.municipalityId;
      const brgyForCoverage = buyerBarangay || buyer.barangay;
      const buyerPin = normalizePin(deliveryLatitude, deliveryLongitude);
      deliveryQuote = await deliveryQuoteService.quote(
        store,
        muniForCoverage,
        brgyForCoverage,
        buyerPin.latitude == null ? null : buyerPin,
      );
      if (!deliveryQuote.covered && deliveryQuote.tooFar) {
        throw new ApiError(`${deliveryQuote.reason}, and your pin is ${deliveryQuote.distanceKm} km away. Choose another way to receive it.`, 400);
      }
      if (!deliveryQuote.covered) {
        throw new ApiError('Delivery is not available for your address. Please choose Pickup instead.', 400);
      }
      if (deliveryQuote.fee == null) {
        throw new ApiError('Drop your pin on the map so the shop can work out the delivery fee', 400);
      }
    }
  }

  // Validate items and calculate totals
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError('Order must contain at least one item', 400);
  }
  if (items.length > MAX_ORDER_LINES) {
    throw new ApiError(`Order may contain at most ${MAX_ORDER_LINES} items`, 400);
  }

  let totalAmount = 0;
  const orderItems = [];
  const orderedProducts = [];
  let parcelGrams = 0;
  const unweighed = [];
  // For a MoorMove rider's vehicle: a product without a weight counts as 500 g.
  let riderGrams = 0;

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      throw new ApiError('Each item quantity must be a whole number between 1 and 9999', 400);
    }

    const product = await productRepository.findById(item.productId);

    if (!product || product.deletedAt) {
      throw new ApiError(`Product ${item.productId} not found`, 404);
    }

    if (product.status !== 'APPROVED') {
      throw new ApiError(`Product ${product.name} is not available`, 400);
    }

    // Live animals are bought by agreeing a price with the seller in chat
    // (Make an offer), never through the cart.
    if (kindOf(product) === 'LIVESTOCK') {
      throw new ApiError(`${product.name} is bought by making an offer to the seller`, 400);
    }

    if (product.storeId !== storeId) {
      throw new ApiError(`Product ${product.name} does not belong to this store`, 400);
    }

    // Cooked-to-order food is never short of stock, but has a minimum order.
    const stockless = isStockless(product);
    if (!stockless && product.stock < quantity) {
      throw new ApiError(`Insufficient stock for ${product.name}`, 400);
    }
    const minimum = minOrderOf(product);
    if (quantity < minimum) {
      throw new ApiError(`The minimum order for ${product.name} is ${minimum}`, 400);
    }

    // The product's own way of receiving it, within the shop's.
    if (product.fulfillment && product.fulfillment !== 'BOTH' && product.fulfillment !== fulfillmentMethod) {
      throw new ApiError(`${product.name} is ${product.fulfillment === 'PICKUP' ? 'pickup only' : 'delivery only'}`, 400);
    }
    // Live animals and cooked food go with the shop, never by courier.
    const refusal = courier ? courierRefusal(product) : null;
    if (refusal && kindOf(product) !== 'READY_TO_EAT') throw new ApiError(refusal, 400);

    const selectedVariations = normalizeSelectedVariations(product, item.selectedVariations);
    orderedProducts.push(product);

    // Per-option stock: the chosen option must have enough on its own.
    if (!stockless && stockForSelection(product, selectedVariations) < quantity) {
      const option = selectedVariations ? Object.values(selectedVariations).join(', ') : '';
      throw new ApiError(`Insufficient stock for ${product.name}${option ? ` (${option})` : ''}`, 400);
    }

    // The chosen option's price when the product is priced per option
    // (e.g. 1kg vs 250g); otherwise the product's single price.
    if (product.weightGrams) parcelGrams += product.weightGrams * quantity;
    else unweighed.push(product.name);
    riderGrams += (product.weightGrams || 500) * quantity;

    // Options, a sale and a bulk price for this quantity (utils/variantPricing).
    const unitPrice = unitPriceFor(product, selectedVariations, quantity);
    const itemTotal = unitPrice * quantity;
    totalAmount += itemTotal;

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity,
      price: unitPrice,
      subtotal: itemTotal,
      selectedVariations,
      returnPolicySnapshot: snapshotReturnPolicy(product.returnPolicy),
      // A package's items as sold, should the seller change it later.
      ...(kindOf(product) === 'PACKAGE' ? { packageContents: packageSnapshot(product) } : {}),
    });
  }

  // Available Today items: a window taking orders now for each, checked out
  // on their own, one ready day, no courier; each line counts against its
  // window, and the order is ready in the window's ready time.
  const today = await availabilityService.checkoutWindows(orderedProducts, {
    method: fulfillmentMethod,
    courier: Boolean(courier),
  });
  if (today) {
    for (const line of orderItems) line.availabilityId = today.byProduct.get(line.productId)?.id || null;
  }

  // Pickup is free; delivery by the seller costs what the store charges for
  // the distance (see deliveryQuote.service); by a courier, its rate for
  // the parcel's weight, within the seller's town or to another town.
  let courierFee = null;
  if (courier) {
    if (unweighed.length) {
      throw new ApiError(`${unweighed[0]} has no weight yet, so courier delivery can't be priced. Choose delivery by the seller or pickup.`, 400);
    }
    const buyerTown = buyerMunicipalityId || buyer.municipalityId;
    courierFee = feeFor(courier.rates, parcelGrams, buyerTown === store.municipalityId);
    if (courierFee == null) {
      throw new ApiError(`This order is too heavy for ${courier.name}. Choose another way to receive it.`, 400);
    }
  }
  // A MoorMove rider: what MoorMove quotes for this parcel from the shop's
  // pin to the buyer's, asked here (never the price the browser saw).
  let riderQuote = null;
  if (partner) {
    riderQuote = await moormoveService.quoteForCheckout({
      store,
      buyerPin: riderPin,
      grams: riderGrams,
      buyerTownId: buyerMunicipalityId || buyer.municipalityId || null,
      buyerBarangay: buyerBarangay || buyer.barangay || null,
    });
    if (!riderQuote.available) throw new ApiError(`${riderQuote.reason}. Choose another way to receive it.`, 400);
  }
  const DELIVERY_FEE = fulfillmentMethod === 'PICKUP' ? 0
    : (courier ? courierFee : (riderQuote ? riderQuote.fee : deliveryQuote.fee));
  let voucherRecord = null;
  let discountAmount = 0;
  if (voucherCode) {
    const normalized = String(voucherCode).trim().toUpperCase();
    if (normalized) {
      voucherRecord = await voucherRepository.findByCode(normalized);
      await voucherService.assertUsable(voucherRecord, { userId, subtotal: totalAmount, storeId });
      discountAmount = voucherService.computeDiscount(voucherRecord, totalAmount);
    }
  }

  const grandTotal = Math.max(0, totalAmount + DELIVERY_FEE - discountAmount);

  // The rider carries cash for the shop only up to MoorMove's limit.
  if (riderQuote && paymentMethod === 'COD' && riderQuote.maxCod != null && grandTotal - DELIVERY_FEE > riderQuote.maxCod) {
    throw new ApiError(`A MoorMove rider can collect up to ₱${Number(riderQuote.maxCod).toLocaleString('en-PH')} in cash for the shop. Pay with GCash or QR Ph, or choose another way to receive it.`, 400);
  }

  // When the buyer can expect it, from the shop's preparation days and week
  // (and a paluto's cooking time).
  const eta = today ? today.eta : orderEta(store, orderedProducts, {
    method: fulfillmentMethod,
    courier: Boolean(courier),
    townId: buyerMunicipalityId || buyer.municipalityId || null,
  });

  // The delivery address's map pin, for the rider (none for pickup).
  const pin = fulfillmentMethod === 'DELIVERY'
    ? normalizePin(deliveryLatitude, deliveryLongitude)
    : { latitude: null, longitude: null };

  // Create order with items (stock is decremented atomically in the transaction)
  let order;
  try {
    order = await orderRepository.createOrderWithItems(
      {
        orderNumber: generateOrderNumber(),
        checkoutKey: checkoutKey ? String(checkoutKey) : null,
        buyerId: userId,
        storeId,
        subtotal: totalAmount,
        deliveryFee: DELIVERY_FEE,
        discountAmount,
        voucherCode: voucherRecord?.code || null,
        voucherId: voucherRecord?.id || null,
        total: grandTotal,
        deliveryAddress: fulfillmentMethod === 'PICKUP'
          ? (store.pickupAddress || deliveryAddress || 'Store pickup')
          : deliveryAddress,
        deliveryNotes: deliveryNotes || null,
        deliveryLatitude: pin.latitude,
        deliveryLongitude: pin.longitude,
        contactNumber,
        status: 'PENDING',
        etaFrom: eta.from,
        etaTo: eta.to,
        // Available Today: the seller confirms by then or it is cancelled.
        respondBy: today ? today.respondBy : null,
        fulfillmentMethod,
        pickupLocation: fulfillmentMethod === 'PICKUP' ? (store.pickupAddress || null) : null,
        paymentMethod,
        paymentStatus: paidUpFront ? 'PENDING_VERIFICATION' : 'PENDING',
        paymentReference: paidUpFront ? paymentReference.trim() : null,
        paymentProofUrl: paidUpFront ? paymentProofUrl : null,
        buyerMunicipalityId: buyerMunicipalityId || buyer.municipalityId || null,
        buyerBarangay: buyerBarangay || buyer.barangay || null,
        buyerProvince: buyerProvince || buyer.province || 'Oriental Mindoro',
        // The courier the buyer chose; the seller ships with it.
        ...(courier ? { courierId: courier.id, courierName: courier.name, shippingWeightGrams: parcelGrams } : {}),
        // A MoorMove rider: the seller calls one once it is packed.
        ...(riderQuote ? { deliveryPartner: 'MOORMOVE' } : {}),
        // A MoorMove free-delivery promo (deliveryFee 0): kept for the booking and the notices.
        ...(riderQuote?.promo ? { deliveryPromoId: riderQuote.promo.id, deliveryPromoTitle: riderQuote.promo.title } : {}),
        // How far it was priced for: the shop's distance, or MoorMove's.
        ...deliveryDistance(fulfillmentMethod === 'DELIVERY' ? (riderQuote || deliveryQuote) : null),
      },
      orderItems,
      voucherRecord ? { voucherId: voucherRecord.id, userId, discountAmount } : null,
      orderItems
    );
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      throw new ApiError('One or more items no longer have sufficient stock', 400);
    }
    if (err.code === 'TODAY_CLOSED') {
      throw new ApiError('An Available Today item stopped taking orders just now.', 400);
    }
    if (err.code === 'VOUCHER_UNAVAILABLE') {
      throw new ApiError(err.message, 400);
    }
    // A unique violation on (buyerId, checkoutKey) means a concurrent submit
    // of the same checkout won the race. Return that order instead of an
    // error: the buyer pressed the button twice, they did not do anything
    // wrong, and they must end up with exactly one order either way.
    if (err.code === 'P2002' && checkoutKey) {
      const existing = await orderRepository.findByCheckoutKey(userId, String(checkoutKey));
      if (existing) return existing;
    }
    throw err;
  }

  // A MoorMove free-delivery promo: the seller pays the rider nothing and, on
  // cash on delivery, the rider collects only the items' price.
  const promoTitle = riderQuote?.promo?.title || null;
  const promoNote = promoTitle
    ? `Free delivery promo by MoorMove (${promoTitle}): the buyer pays no delivery fee and you pay the rider nothing${
      paymentMethod === 'COD' ? `; the rider collects only ₱${Number(grandTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for the items` : ''}.`
    : null;

  // Notify the seller (non-blocking on failure)
  try {
    if (store.ownerId) {
      await notificationService.notifyOrderCreated(store.ownerId, order.id, buyer.fullName, promoNote);
    }
  } catch (err) {
    console.error('[createOrder] notification failed:', err.message);
  }

  // …and the buyer, that the delivery is free.
  if (promoTitle) {
    notificationService.createNotification({
      userId: buyer.id,
      type: 'ORDER_CONFIRMED',
      audience: 'BUYER',
      title: 'Free delivery',
      message: `Order ${order.orderNumber} placed. ${notificationService.promoLine(promoTitle)}: you pay no delivery fee.`,
      relatedId: order.id,
      target: { kind: 'buyer-order', id: order.id },
    }).catch((err) => console.error('[createOrder] promo notice failed:', err.message));
  }

  // Products this order brought down to their low-stock line.
  if (store.ownerId) {
    notifyStockCrossings(store.ownerId, orderItems)
      .catch((err) => console.error('[createOrder] low-stock notice failed:', err.message));
  }

  // …and by email: who ordered what, with a link to confirm it.
  if (store.ownerId) {
    emailInBackground('new order', async () => {
      const [seller, town] = await Promise.all([
        prisma.user.findUnique({ where: { id: store.ownerId }, select: { email: true, fullName: true } }),
        order.buyerMunicipalityId
          ? prisma.municipality.findUnique({ where: { id: order.buyerMunicipalityId }, select: { name: true } })
          : null,
      ]);
      if (!seller?.email) return;
      await sendNewOrderEmail({
        seller,
        store,
        order,
        items: orderItems,
        buyerName: buyer.fullName,
        place: [order.buyerBarangay, town?.name].filter(Boolean).join(', ') || null,
        expiryHours: PENDING_EXPIRY_HOURS,
      });
    });
  }

  return order;
};

/**
 * Get order by ID
 * @param {String} id - Order ID
 * @param {String} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Object>} Order
 */
const getOrderById = async (id, userId, userRole, userMunicipalityId) => {
  const order = await orderRepository.findById(id);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Authorization check
  const isBuyer = order.buyerId === userId;
  const isSeller = order.store.ownerId === userId;
  const isAdmin = userRole === 'SUPER_ADMIN';
  // A municipal admin looks after their town's shops (as every list does).
  const isScopedAdmin = userRole === 'MUNICIPAL_ADMIN'
    && userMunicipalityId
    && order.store?.municipalityId === userMunicipalityId;

  if (!isBuyer && !isSeller && !isAdmin && !isScopedAdmin) {
    throw new ApiError('You do not have permission to view this order', 403);
  }

  // The buyer and the seller see the order; an admin sees what moderating
  // it needs (adminOrderView), and asks to see more with a reason.
  if (!isBuyer && !isSeller) return adminOrderView(order);
  return withRiderDelivery(order);
};

/* ── Orders as admins see them ──────────────────────────────────────── */

/** The list: what happened, where, without people's details or amounts. */
const adminOrderSummary = (order) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  fulfillmentMethod: order.fulfillmentMethod,
  buyer: order.buyer ? { id: order.buyer.id, fullName: order.buyer.fullName } : null,
  store: order.store ? { id: order.store.id, name: order.store.name, slug: order.store.slug || null } : null,
  itemCount: (order.items || []).reduce((n, it) => n + Number(it.quantity || 0), 0),
});

/** One order: the summary, the items (no prices), the area, masked contact. */
const adminOrderView = (order) => ({
  ...adminOrderSummary(order),
  items: (order.items || []).map((it) => ({
    id: it.id,
    productName: it.productName,
    quantity: it.quantity,
    selectedVariations: it.selectedVariations || null,
    packageContents: it.packageContents || null,
    product: it.product ? {
      id: it.product.id, name: it.product.name, slug: it.product.slug, images: it.product.images, productType: it.product.productType,
    } : null,
  })),
  area: areaOnly(order.buyerBarangay, order.fulfillmentMethod === 'PICKUP' ? null : order.store?.municipality?.name),
  contactMasked: maskPhone(order.contactNumber),
  pickupLocation: order.fulfillmentMethod === 'PICKUP' ? order.pickupLocation : null,
  hasPaymentProof: Boolean(order.paymentProofUrl),
  hasDeliveryProof: Boolean(order.fulfillmentProofUrl),
  courierName: order.courierName || null,
  trackingNumber: order.trackingNumber || null,
  shippedAt: order.shippedAt || null,
  restricted: true,
});

const REVEAL_PARTS = ['contact', 'payment'];

/**
 * An admin asks to see an order's contact or payment details for a case
 * (a report, a dispute, a return). The reason is required and the reveal is
 * written to the audit log by the controller.
 * @returns {Promise<{order: Object, part: String, data: Object}>}
 */
const revealOrderDetails = async (orderId, actor, part) => {
  if (!REVEAL_PARTS.includes(part)) throw new ApiError('Choose contact or payment', 400);
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  const allowed = actor.role === 'SUPER_ADMIN'
    || (actor.role === 'MUNICIPAL_ADMIN' && actor.municipalityId && order.store?.municipalityId === actor.municipalityId);
  if (!allowed) throw new ApiError('You do not have permission to view this order', 403);

  const data = part === 'contact'
    ? {
      buyerName: order.buyer?.fullName || null,
      contactNumber: order.contactNumber || null,
      deliveryAddress: order.deliveryAddress || null,
      deliveryNotes: order.deliveryNotes || null,
      fulfillmentProofUrl: order.fulfillmentProofUrl || null,
    }
    : {
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discountAmount: order.discountAmount,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentReference: order.paymentReference || null,
      paymentProofUrl: order.paymentProofUrl || null,
      items: (order.items || []).map((it) => ({ id: it.id, price: it.price, quantity: it.quantity, subtotal: it.subtotal })),
    };
  return { order, part, data };
};

/**
 * Get my orders (buyer)
 * @param {String} userId - Buyer user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const getMyOrders = async (userId, options) => {
  const result = await orderRepository.findAll({ ...options, buyerId: userId, forBuyer: true });
  return { ...result, orders: result.orders.map((o) => withDeadline(withRiderDelivery(o))) };
};

/**
 * The next thing that happens on its own, so the buyer sees it coming:
 *   confirm      the shop must confirm by then, or the order is cancelled
 *   pay          a confirmed QR order must be paid by then, or it is cancelled
 *   autoComplete a shipped / delivered order completes by itself then
 * Uses the same clocks as the jobs that act on them (expirePendingOrders,
 * expireUnpaidOrders, autoCompleteOrders).
 */
const withDeadline = (order) => {
  const hours = (from, h) => (from ? new Date(new Date(from).getTime() + h * 3600 * 1000) : null);
  let deadline = null;
  if (order.status === 'PENDING' && ['PENDING', 'FAILED'].includes(order.paymentStatus)) {
    deadline = { kind: 'confirm', at: hours(order.createdAt, PENDING_EXPIRY_HOURS) };
  } else if (isDueForPayment(order)) {
    deadline = { kind: 'pay', at: hours(order.updatedAt, PAYMENT_EXPIRY_HOURS) };
  } else if (order.status === 'SHIPPED') {
    deadline = { kind: 'autoComplete', at: hours(order.shippedAt, AUTO_COMPLETE_DAYS * 24) };
  } else if (order.status === 'DELIVERED' || order.status === 'PICKED_UP') {
    deadline = { kind: 'autoComplete', at: hours(order.fulfillmentProofAt || order.updatedAt, AUTO_COMPLETE_DAYS * 24) };
  } else if (order.paymentStatus === 'PENDING_VERIFICATION' && ['PENDING', 'CONFIRMED'].includes(order.status)) {
    // After this the buyer may cancel if the shop still hasn't checked it.
    deadline = { kind: 'paymentCheck', at: hours(order.updatedAt, PAYMENT_CHECK_HOURS) };
  }
  return { ...order, deadline };
};

/**
 * Get store orders (seller)
 * @param {String} userId - Seller user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const getStoreOrders = async (userId, options) => {
  const store = await storeRepository.findByOwnerId(userId);

  if (!store) {
    throw new ApiError('You do not have a store', 404);
  }

  const result = await orderRepository.findAll({ ...options, storeId: store.id });
  return { ...result, orders: result.orders.map((o) => withDeadline(withRiderDelivery(o))) };
};

/** The seller's tab counts: orders per stage (new, unpaid, to ship…). */
const getStoreStageCounts = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('You do not have a store', 404);
  return orderRepository.countStoreStages(store.id);
};

/**
 * Get all orders (admin)
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders and pagination
 */
const getAllOrders = async (options) => {
  // Admin route only: each order as its summary, read with only the fields
  // the summary uses.
  const result = await orderRepository.findAll({ ...options, adminSummary: true });
  return { ...result, orders: result.orders.map(adminOrderSummary) };
};

/**
 * Update order status (seller)
 * @param {String} orderId - Order ID
 * @param {String} userId - Seller user ID
 * @param {String} newStatus - New status
 * @returns {Promise<Object>} Updated order
 */
// What a seller may give as the reason for cancelling, and when.
const SELLER_CANCEL_REASONS = {
  SELLER_CANCELLED: null,
  OUT_OF_STOCK: null,
  NO_SHOW: ['READY_FOR_PICKUP', 'READY'],
  REFUSED: ['OUT_FOR_DELIVERY'],
};

const updateOrderStatus = async (orderId, userId, newStatus, { proofUrl, cancelReason } = {}) => {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Check if user is the seller
  if (order.store.ownerId !== userId) {
    throw new ApiError('You can only update orders for your store', 403);
  }

  // Validate status transition (fulfillment-aware). READY is an older state:
  // orders still in it move on through hand-over (with its proof photo), never
  // straight to COMPLETED.
  const deliveryTransitions = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['TO_SHIP', 'PREPARING', 'CANCELLED'],
    PREPARING: ['TO_SHIP', 'CANCELLED'],
    TO_SHIP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['COMPLETED'],
    READY: ['TO_SHIP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const pickupTransitions = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['READY_FOR_PICKUP', 'PREPARING', 'CANCELLED'],
    PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
    READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
    PICKED_UP: ['COMPLETED'],
    READY: ['PICKED_UP', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const validTransitions = order.fulfillmentMethod === 'PICKUP' ? pickupTransitions : deliveryTransitions;

  if (!validTransitions[order.status]?.includes(newStatus)) {
    throw new ApiError(`Cannot transition from ${order.status} to ${newStatus}`, 400);
  }
  // The buyer chose (and paid for) a courier: it is shipped with it, not
  // delivered by the seller.
  if (order.courierId && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(newStatus)) {
    throw new ApiError(`Ship this order with ${order.courierName || 'the courier'} the buyer chose`, 400);
  }
  // A MoorMove rider's progress moves these orders on (or the seller first
  // chooses to deliver it themselves).
  if (order.deliveryPartner === 'MOORMOVE' && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(newStatus)) {
    throw new ApiError('A MoorMove rider updates this order', 400);
  }
  const rider = order.riderDeliveries?.[0] || null;
  if (newStatus === 'CANCELLED' && riderOpen(rider)) {
    throw new ApiError('Cancel the rider first, then cancel the order', 409);
  }

  if (order.paymentMethod !== 'COD'
    && ['PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED', 'COMPLETED'].includes(newStatus)
    && order.paymentStatus !== 'PAID') {
    throw new ApiError('Payment must be verified before fulfillment can continue', 409);
  }

  // Handing the order over needs a photo: proof of delivery for delivery
  // orders, proof of pickup for pickup orders. The validator has already
  // checked it is an image uploaded to E-MOORM.
  const handOver = (newStatus === 'DELIVERED' && order.fulfillmentMethod !== 'PICKUP')
    || (newStatus === 'PICKED_UP' && order.fulfillmentMethod === 'PICKUP');
  if (handOver && !proofUrl) {
    throw new ApiError(
      order.fulfillmentMethod === 'PICKUP'
        ? 'Add a photo as proof of pickup'
        : 'Add a photo as proof of delivery',
      400,
    );
  }
  const proofFields = handOver
    ? { fulfillmentProofUrl: String(proofUrl).trim(), fulfillmentProofAt: new Date() }
    : {};

  // Cancellation restores product stock (from whatever stage it is allowed).
  let updated;
  try {
    updated = newStatus === 'CANCELLED'
      ? await orderRepository.cancelOrder(orderId, userId, {
        fromStatuses: [order.status],
        note: 'Cancelled by seller',
        reason: sellerCancelReason(order, cancelReason, { riderFailed: rider?.status === 'FAILED' }),
        by: 'SELLER',
      })
      : await orderRepository.updateStatus(orderId, newStatus, order.status, userId, null, proofFields);
  } catch (err) {
    if (err.code === 'STALE_ORDER_STATUS' || err.code === 'ORDER_NOT_CANCELLABLE') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  // Notify the buyer (non-blocking on failure). A confirmed QR order that is
  // not paid yet asks them to pay now, from To Pay.
  try {
    if (newStatus === 'CONFIRMED' && isDueForPayment({ ...order, status: 'CONFIRMED' })) {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'ORDER_CONFIRMED',
        title: 'Order confirmed: please pay now',
        message: `${order.store?.name || 'The seller'} confirmed order ${order.orderNumber}. Pay ₱${Number(order.total).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} with the shop's QR in To Pay, then send your reference number and screenshot within ${PAYMENT_EXPIRY_HOURS} hours.`,
        relatedId: orderId,
        target: { kind: 'buyer-order', id: orderId },
      });
    } else {
      await notificationService.notifyOrderUpdated(order.buyerId, orderId, newStatus, {
        orderNumber: order.orderNumber,
        refundNote: newStatus === 'CANCELLED' && order.paymentStatus === 'PAID',
      });
    }
  } catch (err) {
    console.error('[updateOrderStatus] notification failed:', err.message);
  }

  // The buyer hears it by email too when the shop accepts the order.
  if (newStatus === 'CONFIRMED' && order.buyer?.email) {
    emailInBackground('order accepted', () => sendOrderAcceptedEmail({
      buyer: order.buyer,
      store: order.store,
      order: { ...order, status: 'CONFIRMED' },
      items: order.items || [],
      payHours: PAYMENT_EXPIRY_HOURS,
    }));
  }

  return updated;
};

/**
 * Cancel order (buyer)
 * @param {String} orderId - Order ID
 * @param {String} userId - Buyer user ID
 * @returns {Promise<Object>} Cancelled order
 */
const cancelOrder = async (orderId, userId) => {
  const order = await orderRepository.findById(orderId);

  if (!order) {
    throw new ApiError('Order not found', 404);
  }

  // Check if user is the buyer
  if (order.buyerId !== userId) {
    throw new ApiError('You can only cancel your own orders', 403);
  }

  // Only allow cancellation if order is pending or confirmed
  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    throw new ApiError('Order cannot be cancelled at this stage', 400);
  }

  // A payment the shop is still checking holds the order, unless the shop
  // has left it unchecked too long; the shop then records the refund.
  const overdueCheck = paymentCheckOverdue(order);
  if (order.paymentStatus === 'PENDING_VERIFICATION' && !overdueCheck) {
    throw new ApiError(`The shop is checking your payment. If it hasn't within ${PAYMENT_CHECK_HOURS} hours of your proof, you can cancel; until then, message the shop.`, 409);
  }

  let cancelled;
  try {
    cancelled = await orderRepository.cancelOrder(orderId, userId, {
      fromPaymentStatuses: ['PENDING', 'PAID', 'FAILED', 'EXPIRED', ...(overdueCheck ? ['PENDING_VERIFICATION'] : [])],
      reason: 'BUYER_CANCELLED',
      by: 'BUYER',
    });
  } catch (err) {
    if (err.code === 'ORDER_NOT_CANCELLABLE') {
      throw new ApiError('Order cannot be cancelled at this stage', 409);
    }
    throw err;
  }

  // Notify the seller that the buyer cancelled (non-blocking on failure)
  try {
    if (order.store?.owner?.id || order.store?.ownerId) {
      const refund = order.paymentStatus === 'PAID'
        ? ' The payment was already verified — please arrange the refund with the buyer.'
        : order.paymentStatus === 'PENDING_VERIFICATION'
          ? ` Their payment proof waited more than ${PAYMENT_CHECK_HOURS} hours unchecked. If you received the money, return it and mark the order refunded.`
          : '';
      await notificationService.createNotification({
        userId: order.store.owner?.id || order.store.ownerId,
        type: 'ORDER_CANCELLED',
        title: 'Order Cancelled',
        message: `Order ${order.orderNumber} was cancelled by the buyer.${refund}`,
        relatedId: orderId,
        // Without this the seller's copy defaulted to the BUYER feed and
        // linked to /profile/orders — a page the seller does not use.
        audience: 'SELLER',
      });
    }
  } catch (err) {
    console.error('[cancelOrder] notification failed:', err.message);
  }

  return cancelled;
};

/**
 * Decide a prepaid order's payment.
 *  - PAID:     proof accepted (from PENDING_VERIFICATION)
 *  - FAILED:   proof rejected (from PENDING_VERIFICATION). The order and its
 *              stock stay as they are; the buyer is asked to resubmit. The
 *              expiry job cancels it later if it stays unpaid.
 *  - REFUNDED: the seller has returned the money for a cancelled order that
 *              was paid (PAID), or whose proof they never checked
 *              (PENDING_VERIFICATION, cancelled by the buyer after the deadline).
 */
const verifyPayment = async (orderId, actor, paymentStatus, note = '') => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  const isSeller = actor.role === 'SELLER' && order.store?.ownerId === actor.id;
  const isAdmin = actor.role === 'SUPER_ADMIN';
  const isScopedAdmin = actor.role === 'MUNICIPAL_ADMIN'
    && actor.municipalityId
    && order.store?.municipalityId === actor.municipalityId;
  if (!isSeller && !isAdmin && !isScopedAdmin) throw new ApiError('Not authorized to verify this payment', 403);
  if (!['PAID', 'FAILED', 'REFUNDED'].includes(paymentStatus)) {
    throw new ApiError('Payment status must be PAID, FAILED or REFUNDED', 400);
  }
  if (order.paymentMethod === 'COD') {
    throw new ApiError('COD orders do not require payment verification', 400);
  }
  const trimmedNote = String(note || '').trim().slice(0, 200);

  let updated;
  if (paymentStatus === 'REFUNDED') {
    if (!['PAID', 'PENDING_VERIFICATION'].includes(order.paymentStatus) || order.status !== 'CANCELLED') {
      throw new ApiError('Only a paid, cancelled order can be marked as refunded', 409);
    }
    try {
      updated = await orderRepository.updatePaymentStatus(orderId, 'REFUNDED', actor.id, {
        fromPaymentStatus: order.paymentStatus,
        orderStatus: 'CANCELLED',
        note: trimmedNote || 'Refund recorded by seller',
      });
    } catch (err) {
      if (err.code === 'PAYMENT_ALREADY_PROCESSED') {
        throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
      }
      throw err;
    }
  } else {
    if (order.paymentStatus !== 'PENDING_VERIFICATION') {
      throw new ApiError('This payment has already been processed', 409);
    }
    if (order.status === 'CANCELLED') {
      throw new ApiError('This order has been cancelled', 409);
    }
    try {
      updated = await orderRepository.updatePaymentStatus(orderId, paymentStatus, actor.id, {
        fromPaymentStatus: 'PENDING_VERIFICATION',
        note: trimmedNote || (paymentStatus === 'FAILED' ? 'Payment proof rejected' : undefined),
      });
    } catch (err) {
      if (err.code === 'PAYMENT_ALREADY_PROCESSED') {
        throw new ApiError('This payment has already been processed', 409);
      }
      throw err;
    }
  }

  try {
    const reason = trimmedNote ? ` Seller's note: ${trimmedNote}.` : '';
    if (paymentStatus === 'PAID') {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'ORDER_CONFIRMED',
        title: 'Payment Verified',
        message: `Your payment for order ${order.orderNumber} was verified. The seller will now prepare your order.`,
        relatedId: orderId,
      });
    } else if (paymentStatus === 'FAILED') {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'SYSTEM_ANNOUNCEMENT',
        audience: 'BUYER',
        title: 'Payment Proof Rejected',
        message: `The payment proof for order ${order.orderNumber} could not be verified.${reason} Please open the order and submit a new reference and screenshot. Your order is kept while you do.`,
        relatedId: orderId,
        target: { kind: 'buyer-order', id: orderId },
      });
    } else {
      await notificationService.createNotification({
        userId: order.buyerId,
        type: 'SYSTEM_ANNOUNCEMENT',
        audience: 'BUYER',
        title: 'Refund Issued',
        message: `The seller has recorded a refund of your payment for cancelled order ${order.orderNumber}.${reason}`,
        relatedId: orderId,
        target: { kind: 'buyer-order', id: orderId },
      });
    }
  } catch (err) {
    console.error('[verifyPayment] notification failed:', err.message);
  }

  return updated;
};

/**
 * Buyer submits a payment reference and proof for a prepaid order: the first
 * payment once the seller has confirmed it (payment PENDING, order
 * CONFIRMED), or a new proof while it is FAILED or still
 * PENDING_VERIFICATION (order PENDING / CONFIRMED).
 */
const submitPaymentProof = async (orderId, userId, { paymentReference, paymentProofUrl }) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.buyerId !== userId) {
    throw new ApiError('You can only submit payment proof for your own orders', 403);
  }
  if (order.paymentMethod === 'COD') {
    throw new ApiError('Cash on delivery orders do not need payment proof', 400);
  }
  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    throw new ApiError('Payment proof can no longer be submitted for this order', 409);
  }
  if (order.paymentStatus === 'PENDING' && order.status === 'PENDING') {
    throw new ApiError("The seller hasn't confirmed this order yet. We'll let you know when it's time to pay.", 409);
  }
  if (!['PENDING', 'FAILED', 'PENDING_VERIFICATION'].includes(order.paymentStatus)) {
    throw new ApiError('This order is not awaiting payment proof', 409);
  }

  let updated;
  try {
    updated = await orderRepository.updatePaymentProof(orderId, {
      paymentReference: String(paymentReference).trim(),
      paymentProofUrl: String(paymentProofUrl).trim(),
    }, userId);
  } catch (err) {
    if (err.code === 'PROOF_NOT_ACCEPTED') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  try {
    if (order.store?.ownerId) {
      const first = order.paymentStatus === 'PENDING';
      await notificationService.createNotification({
        userId: order.store.ownerId,
        type: 'ORDER_RECEIVED',
        title: first ? 'Buyer paid: check the payment' : 'Payment Proof Submitted',
        message: first
          ? `${order.buyer?.fullName || 'The buyer'} paid for order ${order.orderNumber}. Check the reference and screenshot against your records, then confirm the payment.`
          : `${order.buyer?.fullName || 'The buyer'} submitted a new payment proof for order ${order.orderNumber}. Please verify it.`,
        relatedId: orderId,
      });
    }
  } catch (err) {
    console.error('[submitPaymentProof] notification failed:', err.message);
  }

  return updated;
};

// A waybill's tracking number: letters, digits and dashes.
const TRACKING_NUMBER = /^[A-Za-z0-9-]{6,40}$/;
const SHIPPABLE_FROM = ['CONFIRMED', 'PREPARING', 'TO_SHIP'];

/**
 * The seller handed a delivery order to a courier: SHIPPED, with the courier
 * and the waybill's tracking number (scanned or typed).
 * @param {String} orderId
 * @param {String} userId - Seller user ID
 * @param {{ courierId: String, trackingNumber: String }} input
 */
const shipOrder = async (orderId, userId, { courierId, trackingNumber } = {}) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.store.ownerId !== userId) {
    throw new ApiError('You can only update orders for your store', 403);
  }
  if (order.fulfillmentMethod === 'PICKUP') {
    throw new ApiError('Pickup orders are not shipped', 400);
  }
  if (!SHIPPABLE_FROM.includes(order.status)) {
    throw new ApiError('This order cannot be shipped at this stage', 409);
  }
  if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID') {
    throw new ApiError('Payment must be verified before fulfillment can continue', 409);
  }
  const tracking = String(trackingNumber || '').replace(/\s+/g, '').toUpperCase();
  if (!TRACKING_NUMBER.test(tracking)) {
    throw new ApiError('Enter the tracking number on the waybill (6-40 letters or digits)', 400);
  }
  // The buyer chose (and paid for) the courier at checkout; orders they asked
  // the seller to deliver are delivered by the seller.
  if (!order.courierId) {
    throw new ApiError('The buyer chose delivery by you for this order', 400);
  }
  if (courierId && String(courierId) !== order.courierId) {
    throw new ApiError(`The buyer chose ${order.courierName || 'another courier'} for this order`, 400);
  }
  const courier = await prisma.courier.findUnique({ where: { id: order.courierId } })
    || { id: order.courierId, name: order.courierName };

  let updated;
  try {
    updated = await orderRepository.updateStatus(
      orderId, 'SHIPPED', order.status, userId, `Shipped with ${courier.name} · ${tracking}`,
      { courierId: courier.id, courierName: courier.name, trackingNumber: tracking, shippedAt: new Date() },
    );
  } catch (err) {
    if (err.code === 'STALE_ORDER_STATUS') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  try {
    await notificationService.createNotification({
      userId: order.buyerId,
      type: 'ORDER_READY',
      title: 'Your order is on its way',
      message: `${order.store?.name || 'The seller'} shipped order ${order.orderNumber} with ${courier.name}. Tracking number: ${tracking}.`,
      relatedId: orderId,
      target: { kind: 'buyer-order', id: orderId },
    });
  } catch (err) {
    console.error('[shipOrder] notification failed:', err.message);
  }
  return updated;
};

// Shipped or delivered orders the buyer never confirmed complete on their own.
const AUTO_COMPLETE_DAYS = Number(process.env.ORDER_AUTO_COMPLETE_DAYS) || 7;

const autoCompleteOrders = async (days = AUTO_COMPLETE_DAYS) => {
  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const orders = await orderRepository.findUnconfirmedHandedOver(before);
  let completed = 0;
  for (const order of orders) {
    try {
      // COMPLETED marks a cash-on-delivery order paid, as receipt does.
      await orderRepository.updateStatus(
        order.id, 'COMPLETED', order.status, null, `Completed automatically ${days} days after hand-over`,
      );
      completed += 1;
    } catch (err) {
      if (err.code !== 'STALE_ORDER_STATUS') console.error(`[orders] auto-complete ${order.orderNumber} failed:`, err.message);
      continue;
    }
    await Promise.allSettled([
      notificationService.createNotification({
        userId: order.buyerId,
        type: 'ORDER_COMPLETED',
        title: 'Order completed',
        message: `Order ${order.orderNumber} was marked complete ${days} days after it was handed over. Something wrong? You can still request a return.`,
        relatedId: order.id,
      }),
      order.store?.ownerId && notificationService.createNotification({
        userId: order.store.ownerId,
        type: 'ORDER_COMPLETED',
        title: 'Order completed',
        message: `Order ${order.orderNumber} was completed automatically: the buyer didn't confirm receipt within ${days} days.`,
        relatedId: order.id,
        audience: 'SELLER',
      }),
    ]);
  }
  return completed;
};

/**
 * Buyer confirms they have the goods: DELIVERED / PICKED_UP / SHIPPED -> COMPLETED.
 * Goes through updateStatus so a COD payment flips to PAID and history is
 * written exactly as it is for the seller.
 */
const markReceived = async (orderId, userId) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new ApiError('Order not found', 404);
  if (order.buyerId !== userId) {
    throw new ApiError('You can only confirm receipt of your own orders', 403);
  }
  if (!['DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status)) {
    throw new ApiError('This order is not ready to be marked as received', 409);
  }

  let updated;
  try {
    updated = await orderRepository.updateStatus(
      orderId, 'COMPLETED', order.status, userId, 'Buyer confirmed receipt',
    );
  } catch (err) {
    if (err.code === 'STALE_ORDER_STATUS') {
      throw new ApiError('This order was updated elsewhere. Refresh and try again.', 409);
    }
    throw err;
  }

  try {
    if (order.store?.ownerId) {
      await notificationService.createNotification({
        userId: order.store.ownerId,
        type: 'ORDER_COMPLETED',
        audience: 'SELLER',
        title: 'Order Received',
        message: `${order.buyer?.fullName || 'The buyer'} confirmed receipt of order ${order.orderNumber}. The order is now completed.`,
        relatedId: orderId,
      });
    }
  } catch (err) {
    console.error('[markReceived] notification failed:', err.message);
  }

  // The buyer has the goods in hand: the best moment to ask for a review.
  try {
    await notificationService.createNotification({
      userId,
      type: 'ORDER_COMPLETED',
      title: 'How was your order?',
      message: `Rate the items from order ${order.orderNumber} to help other buyers and the seller.`,
      relatedId: orderId,
    });
  } catch (err) {
    console.error('[markReceived] review nudge failed:', err.message);
  }

  return updated;
};

// Orders nobody acted on are cancelled so their stock returns to the store.
const PENDING_EXPIRY_HOURS = Number(process.env.ORDER_PENDING_EXPIRY_HOURS) || 48;

const expirePendingOrders = async (ageHours = PENDING_EXPIRY_HOURS) => {
  const before = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  const orders = await orderRepository.findExpiredPending(before);
  let expired = 0;
  for (const order of orders) {
    try {
      await orderRepository.cancelOrder(order.id, null, {
        // The shop never confirmed it: not the buyer's doing.
        reason: 'EXPIRED',
        by: 'SYSTEM',
        fromStatuses: ['PENDING'],
        // Re-checked inside the write: a proof uploaded (or verified) since
        // the lookup must not be swept away.
        fromPaymentStatuses: orderRepository.EXPIRABLE_PAYMENT_STATUSES,
        paymentStatus: order.paymentMethod === 'COD' ? undefined : 'EXPIRED',
        note: `Not confirmed by the seller within ${ageHours} hours`,
      });
      expired += 1;
    } catch (err) {
      if (err.code !== 'ORDER_NOT_CANCELLABLE') console.error(`[orders] expiry of ${order.orderNumber} failed:`, err.message);
      continue;
    }

    const message = `Order ${order.orderNumber} was cancelled because the seller did not confirm it within ${ageHours} hours.`;
    await Promise.allSettled([
      notificationService.createNotification({
        userId: order.buyerId, type: 'ORDER_CANCELLED', title: 'Order Expired', message, relatedId: order.id,
      }),
      order.store?.ownerId && notificationService.createNotification({
        userId: order.store.ownerId, type: 'ORDER_CANCELLED', title: 'Order Expired', message, relatedId: order.id,
        // The seller's copy belongs in the seller feed, not the buyer bell.
        audience: 'SELLER',
      }),
    ]);
  }
  return expired;
};

// A confirmed QR order the buyer does not pay (or re-prove after a rejection)
// within this long of its last change is cancelled, and its stock returns.
const PAYMENT_EXPIRY_HOURS = Number(process.env.ORDER_PAYMENT_EXPIRY_HOURS) || 48;

const expireUnpaidOrders = async (ageHours = PAYMENT_EXPIRY_HOURS) => {
  const before = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  const orders = await orderRepository.findExpiredUnpaid(before);
  let expired = 0;
  for (const order of orders) {
    try {
      await orderRepository.cancelOrder(order.id, null, {
        // Confirmed, but the buyer never paid.
        reason: 'UNPAID',
        by: 'SYSTEM',
        fromStatuses: ['CONFIRMED'],
        // Re-checked inside the write: a proof sent since the lookup wins.
        fromPaymentStatuses: orderRepository.EXPIRABLE_PAYMENT_STATUSES,
        paymentStatus: 'EXPIRED',
        note: `Not paid within ${ageHours} hours of confirmation`,
      });
      expired += 1;
    } catch (err) {
      if (err.code !== 'ORDER_NOT_CANCELLABLE') console.error(`[orders] expiry of ${order.orderNumber} failed:`, err.message);
      continue;
    }

    await Promise.allSettled([
      notificationService.createNotification({
        userId: order.buyerId,
        type: 'ORDER_CANCELLED',
        title: 'Order cancelled: not paid',
        message: `Order ${order.orderNumber} was cancelled because it wasn't paid within ${ageHours} hours of the seller confirming it.`,
        relatedId: order.id,
      }),
      order.store?.ownerId && notificationService.createNotification({
        userId: order.store.ownerId,
        type: 'ORDER_CANCELLED',
        title: 'Order cancelled: not paid',
        message: `Order ${order.orderNumber} was cancelled because the buyer didn't pay within ${ageHours} hours of your confirmation. Its stock is back in your shop.`,
        relatedId: order.id,
        audience: 'SELLER',
      }),
    ]);
  }
  return expired;
};

module.exports = {
  withDeadline,
  buyerRecord,
  getStoreStageCounts,
  createOrder,
  expireUnpaidOrders,
  getOrderById,
  getMyOrders,
  getStoreOrders,
  getAllOrders,
  revealOrderDetails,
  updateOrderStatus,
  cancelOrder,
  verifyPayment,
  submitPaymentProof,
  markReceived,
  shipOrder,
  autoCompleteOrders,
  expirePendingOrders,
};
