const prisma = require('../config/database');
const notificationService = require('./notification.service');
const shopReadiness = require('./shopReadiness.service');
const { kindOf } = require('../utils/productKinds');
const { unitPriceFor } = require('../utils/variantPricing');
const { cleanText } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Price offers on livestock.
 *
 * A buyer offers a price per head for some heads of a listing; the seller
 * accepts, declines or counters once; a counter the buyer accepts or
 * declines. Agreed, the buyer can buy those heads at that price for a day
 * (createOrder takes the offer); then it is used, or it expires.
 *
 *   - At least half the asking price, and below it (at the asking price,
 *     just buy it). Below the seller's lowest (offerFloor, never shown) it
 *     is declined straight away.
 *   - One open offer per buyer per listing; at most 10 offers a day.
 *   - 48 hours to answer each step; 24 hours to buy at an agreed price.
 *
 * Each step leaves a line in the buyer and seller's chat (with the listing's
 * card) and notifies the other side.
 */

const HOUR = 60 * 60 * 1000;
const RESPOND_MS = 48 * HOUR;
const BUY_MS = 24 * HOUR;
const MIN_SHARE = 0.5;
const DAILY_LIMIT = 10;
const OPEN = ['PENDING', 'COUNTERED', 'ACCEPTED'];

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const heads = (n) => `${n} head${n === 1 ? '' : 's'}`;
const money = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) {
    throw new ApiError(`${label} must be an amount in pesos`, 400);
  }
  return n;
};

const OFFER_INCLUDE = {
  product: {
    select: {
      id: true, name: true, slug: true, images: true, price: true, stock: true, status: true, deletedAt: true,
    },
  },
  store: { select: { id: true, name: true, slug: true, logo: true, ownerId: true } },
  buyer: { select: { id: true, fullName: true, profilePhoto: true } },
};

const present = (offer) => ({
  id: offer.id,
  status: offer.status,
  quantity: offer.quantity,
  listPrice: Number(offer.listPrice),
  offerPrice: Number(offer.offerPrice),
  counterPrice: offer.counterPrice == null ? null : Number(offer.counterPrice),
  agreedPrice: offer.agreedPrice == null ? null : Number(offer.agreedPrice),
  note: offer.note,
  sellerNote: offer.sellerNote,
  respondBy: offer.respondBy,
  buyBy: offer.buyBy,
  orderId: offer.orderId,
  createdAt: offer.createdAt,
  updatedAt: offer.updatedAt,
  product: offer.product && {
    id: offer.product.id,
    name: offer.product.name,
    slug: offer.product.slug,
    image: Array.isArray(offer.product.images) ? offer.product.images[0] || null : null,
    price: Number(offer.product.price),
    stock: offer.product.stock,
  },
  store: offer.store && {
    id: offer.store.id, name: offer.store.name, slug: offer.store.slug, logo: offer.store.logo,
  },
  buyer: offer.buyer,
});

/** A line in the buyer and seller's chat, with the listing's card. */
const chatLine = async (offer, senderId, body) => {
  try {
    let convo = await prisma.conversation.findFirst({ where: { buyerId: offer.buyerId, storeId: offer.storeId }, select: { id: true } });
    if (!convo) {
      try {
        convo = await prisma.conversation.create({ data: { buyerId: offer.buyerId, storeId: offer.storeId }, select: { id: true } });
      } catch (err) {
        if (err.code !== 'P2002') throw err;
        convo = await prisma.conversation.findFirst({ where: { buyerId: offer.buyerId, storeId: offer.storeId }, select: { id: true } });
      }
    }
    const now = new Date();
    await prisma.message.create({
      data: {
        conversationId: convo.id, senderId, body, productId: offer.productId, offerId: offer.id, createdAt: now,
      },
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: now } });
  } catch (err) {
    console.error('[offers] chat line failed:', err.message);
  }
};

const notify = (userId, audience, title, message, offer) => notificationService.createNotification({
  userId,
  type: 'PRICE_OFFER',
  title,
  message,
  relatedId: offer.id,
  audience,
  target: { kind: audience === 'SELLER' ? 'seller-offers' : 'buyer-offers', id: offer.id },
}).catch((err) => console.error('[offers] notify failed:', err.message));

/** The listing a buyer may make an offer on, or why not. */
const offerableProduct = async (productId, buyerId) => {
  const product = await prisma.product.findUnique({
    where: { id: String(productId || '') },
    include: { store: { select: { id: true, ownerId: true, isActive: true, isSuspended: true, name: true } } },
  });
  if (!product || product.deletedAt || product.status !== 'APPROVED') throw new ApiError('Listing not found', 404);
  if (kindOf(product) !== 'LIVESTOCK') throw new ApiError('Offers are for livestock listings only', 400);
  if (!product.acceptsOffers) throw new ApiError("This seller isn't taking offers on this listing", 400);
  if (!product.store?.isActive || product.store.isSuspended) throw new ApiError('This shop is not selling right now', 400);
  if (product.store.ownerId === buyerId) throw new ApiError("You can't make an offer on your own listing", 400);
  if (!(await shopReadiness.isReady(product.storeId))) throw new ApiError('This shop is not taking orders yet', 400);
  return product;
};

/** A buyer offers a price per head. */
const make = async (buyer, {
  productId, quantity, price, note,
} = {}) => {
  const product = await offerableProduct(productId, buyer.id);
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) throw new ApiError('Choose how many heads', 400);
  if (qty > product.stock) throw new ApiError(`Only ${heads(product.stock)} available`, 400);
  const listPrice = unitPriceFor(product, null, qty);
  const offerPrice = money(price, 'Your price');
  if (offerPrice >= listPrice) throw new ApiError(`That's the asking price (${peso(listPrice)}) or more: just buy it`, 400);
  const lowest = Math.ceil(listPrice * MIN_SHARE * 100) / 100;
  if (offerPrice < lowest) throw new ApiError(`Offers start at half the asking price: ${peso(lowest)} per head`, 400);

  const [open, today] = await Promise.all([
    prisma.priceOffer.findFirst({ where: { productId: product.id, buyerId: buyer.id, status: { in: OPEN } }, select: { id: true } }),
    prisma.priceOffer.count({ where: { buyerId: buyer.id, createdAt: { gt: new Date(Date.now() - 24 * HOUR) } } }),
  ]);
  if (open) throw new ApiError('You already have an offer on this listing. See My offers.', 409);
  if (today >= DAILY_LIMIT) throw new ApiError('You have made the most offers for today. Try again tomorrow.', 429);

  const belowFloor = product.offerFloor != null && offerPrice < Number(product.offerFloor);
  const offer = await prisma.priceOffer.create({
    data: {
      productId: product.id,
      storeId: product.storeId,
      buyerId: buyer.id,
      quantity: qty,
      listPrice,
      offerPrice,
      note: cleanText(note || '', { maxLength: 300 }) || null,
      status: belowFloor ? 'DECLINED' : 'PENDING',
      sellerNote: belowFloor ? 'Below what the seller accepts' : null,
      respondBy: new Date(Date.now() + RESPOND_MS),
    },
    include: OFFER_INCLUDE,
  });
  if (belowFloor) {
    throw new ApiError("The seller can't go this low. Try a higher price.", 400);
  }

  await chatLine(offer, buyer.id, `Offered ${peso(offerPrice)} per head for ${heads(qty)} (asking ${peso(listPrice)}).${offer.note ? ` ${offer.note}` : ''}`);
  notify(product.store.ownerId, 'SELLER', `New offer on ${product.name}`, `${buyer.fullName || 'A buyer'} offers ${peso(offerPrice)} per head for ${heads(qty)}. Answer within 48 hours.`, offer);
  return present(offer);
};

const loadOffer = async (id) => {
  const offer = await prisma.priceOffer.findUnique({ where: { id: String(id || '') }, include: OFFER_INCLUDE });
  if (!offer) throw new ApiError('Offer not found', 404);
  return offer;
};

/**
 * Moves an offer from one status to the next, only if it is still where it
 * was read (two answers at once: one wins, the other is told).
 */
const move = async (offer, from, data) => {
  const done = await prisma.priceOffer.updateMany({ where: { id: offer.id, status: from }, data });
  if (!done.count) throw new ApiError('This offer changed meanwhile. Refresh to see it.', 409);
  return prisma.priceOffer.findUnique({ where: { id: offer.id }, include: OFFER_INCLUDE });
};

const due = (offer) => offer.respondBy.getTime() <= Date.now();

/** The seller answers an offer: accept, decline, or counter once. */
const respond = async (seller, id, { action, price, note } = {}) => {
  const offer = await loadOffer(id);
  if (offer.store.ownerId !== seller.id) throw new ApiError('Offer not found', 404);
  if (offer.status !== 'PENDING') throw new ApiError('This offer has already been answered', 409);
  if (due(offer)) throw new ApiError('This offer has expired', 409);
  const sellerNote = cleanText(note || '', { maxLength: 300 }) || null;
  const name = offer.product.name;

  if (action === 'accept') {
    const next = await move(offer, 'PENDING', {
      status: 'ACCEPTED', agreedPrice: offer.offerPrice, sellerNote, buyBy: new Date(Date.now() + BUY_MS),
    });
    await chatLine(next, seller.id, `Accepted your offer: ${peso(next.agreedPrice)} per head for ${heads(next.quantity)}. Buy within 24 hours.`);
    notify(offer.buyerId, 'BUYER', 'Your offer was accepted', `${offer.store.name} accepted ${peso(next.agreedPrice)} per head for ${name}. Buy within 24 hours.`, next);
    return present(next);
  }
  if (action === 'decline') {
    const next = await move(offer, 'PENDING', { status: 'DECLINED', sellerNote });
    await chatLine(next, seller.id, `Declined your offer of ${peso(next.offerPrice)} per head.${sellerNote ? ` ${sellerNote}` : ''}`);
    notify(offer.buyerId, 'BUYER', 'Your offer was declined', `${offer.store.name} declined your offer on ${name}.`, next);
    return present(next);
  }
  if (action === 'counter') {
    const counter = money(price, 'Your price');
    if (counter <= Number(offer.offerPrice)) throw new ApiError("A counter is more than the buyer's offer; to take their price, accept it", 400);
    if (counter > Number(offer.listPrice)) throw new ApiError(`A counter can't be above the asking price (${peso(offer.listPrice)})`, 400);
    const next = await move(offer, 'PENDING', {
      status: 'COUNTERED', counterPrice: counter, sellerNote, respondBy: new Date(Date.now() + RESPOND_MS),
    });
    await chatLine(next, seller.id, `Countered: ${peso(counter)} per head for ${heads(next.quantity)}.${sellerNote ? ` ${sellerNote}` : ''}`);
    notify(offer.buyerId, 'BUYER', `Counteroffer on ${name}`, `${offer.store.name} can do ${peso(counter)} per head. Answer within 48 hours.`, next);
    return present(next);
  }
  throw new ApiError('action must be accept, decline or counter', 400);
};

/** The buyer answers a counter: accept or decline. */
const answerCounter = async (buyer, id, { action } = {}) => {
  const offer = await loadOffer(id);
  if (offer.buyerId !== buyer.id) throw new ApiError('Offer not found', 404);
  if (offer.status !== 'COUNTERED') throw new ApiError('There is no counteroffer to answer', 409);
  if (due(offer)) throw new ApiError('This counteroffer has expired', 409);
  const name = offer.product.name;
  if (action === 'accept') {
    const next = await move(offer, 'COUNTERED', {
      status: 'ACCEPTED', agreedPrice: offer.counterPrice, buyBy: new Date(Date.now() + BUY_MS),
    });
    await chatLine(next, buyer.id, `Accepted ${peso(next.agreedPrice)} per head for ${heads(next.quantity)}.`);
    notify(offer.store.ownerId, 'SELLER', 'Counteroffer accepted', `${buyer.fullName || 'The buyer'} accepted ${peso(next.agreedPrice)} per head for ${name}.`, next);
    return present(next);
  }
  if (action === 'decline') {
    const next = await move(offer, 'COUNTERED', { status: 'DECLINED' });
    await chatLine(next, buyer.id, `Declined the counteroffer of ${peso(next.counterPrice)} per head.`);
    notify(offer.store.ownerId, 'SELLER', 'Counteroffer declined', `${buyer.fullName || 'The buyer'} declined your counteroffer on ${name}.`, next);
    return present(next);
  }
  throw new ApiError('action must be accept or decline', 400);
};

/** The buyer takes an open offer back. */
const cancel = async (buyer, id) => {
  const offer = await loadOffer(id);
  if (offer.buyerId !== buyer.id) throw new ApiError('Offer not found', 404);
  if (!OPEN.includes(offer.status)) throw new ApiError('This offer is already closed', 409);
  const next = await move(offer, offer.status, { status: 'CANCELLED' });
  await chatLine(next, buyer.id, 'Withdrew the offer.');
  notify(offer.store.ownerId, 'SELLER', 'Offer withdrawn', `${buyer.fullName || 'A buyer'} withdrew their offer on ${offer.product.name}.`, next);
  return present(next);
};

const STATUS_GROUPS = {
  open: ['PENDING', 'COUNTERED'],
  accepted: ['ACCEPTED'],
  closed: ['DECLINED', 'CANCELLED', 'EXPIRED', 'USED'],
};

const listWhere = (base, status) => (STATUS_GROUPS[status] ? { ...base, status: { in: STATUS_GROUPS[status] } } : base);

/** A buyer's offers, newest first. */
const listMine = async (buyer, { status } = {}) => {
  const offers = await prisma.priceOffer.findMany({
    where: listWhere({ buyerId: buyer.id }, status), include: OFFER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 100,
  });
  return offers.map(present);
};

/** The offers on a seller's listings, newest first, with counts per tab. */
const listForStore = async (seller, { status } = {}) => {
  const store = await prisma.store.findUnique({ where: { ownerId: seller.id }, select: { id: true } });
  if (!store) throw new ApiError('You do not have a shop', 404);
  const [offers, pending] = await Promise.all([
    prisma.priceOffer.findMany({
      where: listWhere({ storeId: store.id }, status), include: OFFER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 100,
    }),
    prisma.priceOffer.count({ where: { storeId: store.id, status: 'PENDING', respondBy: { gt: new Date() } } }),
  ]);
  return { offers: offers.map(present), pending };
};

/** An agreed offer, for checkout: still the buyer's to buy now. */
const forCheckout = async (buyer, id) => {
  const offer = await loadOffer(id);
  if (offer.buyerId !== buyer.id) throw new ApiError('Offer not found', 404);
  if (offer.status !== 'ACCEPTED' || !offer.buyBy || offer.buyBy.getTime() <= Date.now()) {
    throw new ApiError('This agreed price is no longer available', 409);
  }
  return present(offer);
};

/**
 * For createOrder: the agreed price of an offer line, after checking it is
 * this buyer's, for this listing and these heads, agreed and not yet due.
 * The offer is marked used in the order's own transaction.
 */
const priceForOrderLine = async (buyerId, item, product) => {
  const offer = await prisma.priceOffer.findUnique({ where: { id: String(item.offerId) } });
  if (!offer || offer.buyerId !== buyerId || offer.productId !== product.id) throw new ApiError('Offer not found', 404);
  if (offer.status !== 'ACCEPTED' || !offer.buyBy || offer.buyBy.getTime() <= Date.now()) {
    throw new ApiError('This agreed price is no longer available', 400);
  }
  if (Number(item.quantity) !== offer.quantity) {
    throw new ApiError(`The agreed price is for ${heads(offer.quantity)}`, 400);
  }
  return Number(offer.agreedPrice);
};

/** The clock: unanswered offers and unused agreed prices expire. */
const expireDue = async () => {
  const now = new Date();
  const [answers, buys] = await Promise.all([
    prisma.priceOffer.updateMany({ where: { status: { in: ['PENDING', 'COUNTERED'] }, respondBy: { lte: now } }, data: { status: 'EXPIRED' } }),
    prisma.priceOffer.updateMany({ where: { status: 'ACCEPTED', buyBy: { lte: now } }, data: { status: 'EXPIRED' } }),
  ]);
  return { expired: answers.count + buys.count };
};

/** The seller's pending offers, for the Seller Center badge. */
const pendingCount = async (storeId) => prisma.priceOffer.count({
  where: { storeId, status: 'PENDING', respondBy: { gt: new Date() } },
});

module.exports = {
  make, respond, answerCounter, cancel, listMine, listForStore, forCheckout, priceForOrderLine, expireDue, pendingCount,
  MIN_SHARE, RESPOND_MS, BUY_MS, DAILY_LIMIT,
};
