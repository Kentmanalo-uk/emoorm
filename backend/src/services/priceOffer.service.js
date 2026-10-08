const crypto = require('crypto');
const prisma = require('../config/database');
const notificationService = require('./notification.service');
const shopReadiness = require('./shopReadiness.service');
const orderRepository = require('../repositories/order.repository');
const { invalidateProductIds } = require('../repositories/product.repository');
const { changeStock } = require('../repositories/stockLedger');
const { withDeadlockRetry } = require('../lib/dbRetry');
const { kindOf } = require('../utils/productKinds');
const { unitPriceFor } = require('../utils/variantPricing');
const { cleanText } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');
const { withKeyedLock } = require('../utils/keyedLock');

/**
 * Livestock deals, talked over in the buyer and seller's chat.
 *
 *   1. The buyer names a price per head for some heads (PENDING).
 *   2. Whoever's turn it is accepts, declines or names another price; prices
 *      go back and forth with no fixed number of rounds (PENDING when the
 *      buyer named the last one, COUNTERED when the seller did). The side
 *      that named the last price may change it until it is answered.
 *   3. Accepted (ACCEPTED), they meet to see the animals (either may set a
 *      meetup) and settle it in person, or call it off.
 *   4. The seller records what was agreed in person: the heads and the total
 *      paid (CONFIRMING). That is an order, handed over and paid in person,
 *      and takes the heads from the listing. The buyer confirms it, or says
 *      it isn't right (the order is undone and the deal is agreed again); left
 *      alone, it confirms itself after 3 days (SOLD, the order completed).
 *
 *   - Prices are at least half the asking price and at most the asking price.
 *   - One deal at a time per buyer per listing; at most 10 new offers a day.
 *   - 7 days to answer a price; 14 days from agreeing to record the sale.
 *
 * Each step leaves a line in the chat (the deal's card shows where it stands)
 * and notifies the other side.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ANSWER_MS = 7 * DAY;
const MEET_MS = 14 * DAY;
const CONFIRM_MS = 3 * DAY;
const MIN_SHARE = 0.5;
const DAILY_LIMIT = 10;
const MAX_ROUNDS = 30;
const MAX_TOTAL = 99999999.99;
const TALKING = ['PENDING', 'COUNTERED'];
const OPEN = ['PENDING', 'COUNTERED', 'ACCEPTED', 'CONFIRMING'];
const CLOSED = ['SOLD', 'DECLINED', 'CANCELLED', 'EXPIRED'];
// "What buyers usually pay": sales in the same town for the same animal,
// over this long, and only once there are this many.
const ESTIMATE_DAYS = 180;
const ESTIMATE_MIN = 3;
const ESTIMATE_TTL_MS = 10 * 60 * 1000;

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const heads = (n) => `${n} head${n === 1 ? '' : 's'}`;
const money = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) {
    throw new ApiError(`${label} must be an amount in pesos`, 400);
  }
  return n;
};
const cents = (n) => Math.round(n * 100) / 100;

const PERSON = { select: { id: true, fullName: true, profilePhoto: true, contactNumber: true, phoneVerifiedNumber: true } };
const OFFER_INCLUDE = {
  product: {
    select: {
      id: true, name: true, slug: true, images: true, price: true, stock: true, status: true, deletedAt: true, details: true,
    },
  },
  store: {
    select: {
      id: true, name: true, slug: true, logo: true, ownerId: true, pickupAddress: true, owner: PERSON,
    },
  },
  buyer: PERSON,
};

const phoneOf = (person) => person?.phoneVerifiedNumber || person?.contactNumber || null;

/** Whose move it is: the seller answers the buyer's price and records the sale; the buyer answers the seller's and confirms. */
const turnOf = (status) => ({
  PENDING: 'SELLER', COUNTERED: 'BUYER', ACCEPTED: 'SELLER', CONFIRMING: 'BUYER',
}[status] || null);

/** The price per head that counts now. */
const priceNow = (offer) => {
  if (offer.status === 'PENDING') return Number(offer.offerPrice);
  if (offer.status === 'COUNTERED') return Number(offer.counterPrice);
  if (offer.agreedPrice != null) return Number(offer.agreedPrice);
  return Number(offer.counterPrice ?? offer.offerPrice);
};

/**
 * A deal as one side sees it. Phones: the buyer can call the seller while
 * the deal is open; the seller can call the buyer once they have agreed.
 */
const present = (offer, side = null) => {
  const price = priceNow(offer);
  const open = OPEN.includes(offer.status);
  const details = offer.product?.details && typeof offer.product.details === 'object' ? offer.product.details : {};
  return {
    id: offer.id,
    status: offer.status,
    turn: turnOf(offer.status),
    quantity: offer.quantity,
    listPrice: Number(offer.listPrice),
    offerPrice: Number(offer.offerPrice),
    counterPrice: offer.counterPrice == null ? null : Number(offer.counterPrice),
    agreedPrice: offer.agreedPrice == null ? null : Number(offer.agreedPrice),
    price,
    total: cents(price * offer.quantity),
    rounds: offer.rounds,
    note: offer.note,
    sellerNote: offer.sellerNote,
    respondBy: offer.respondBy,
    meetBy: offer.meetBy,
    meetAt: offer.meetAt,
    meetPlace: offer.meetPlace,
    finalQuantity: offer.finalQuantity,
    finalTotal: offer.finalTotal == null ? null : Number(offer.finalTotal),
    closedReason: offer.closedReason,
    closedBy: offer.closedBy,
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
      weightKg: details.weightKg ?? null,
      available: !offer.product.deletedAt && offer.product.status === 'APPROVED',
    },
    store: offer.store && {
      id: offer.store.id, name: offer.store.name, slug: offer.store.slug, logo: offer.store.logo, pickupAddress: offer.store.pickupAddress,
    },
    buyer: offer.buyer && { id: offer.buyer.id, fullName: offer.buyer.fullName, profilePhoto: offer.buyer.profilePhoto },
    sellerPhone: side === 'BUYER' && open ? phoneOf(offer.store?.owner) : null,
    buyerPhone: side === 'SELLER' && ['ACCEPTED', 'CONFIRMING'].includes(offer.status) ? phoneOf(offer.buyer) : null,
  };
};

const conversationFor = async (buyerId, storeId) => {
  const found = await prisma.conversation.findFirst({ where: { buyerId, storeId }, select: { id: true } });
  if (found) return found;
  try {
    return await prisma.conversation.create({ data: { buyerId, storeId }, select: { id: true } });
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    return prisma.conversation.findFirst({ where: { buyerId, storeId }, select: { id: true } });
  }
};

/** A line in the buyer and seller's chat for a step of the deal. */
const chatLine = async (offer, senderId, event, body) => {
  try {
    const convo = await conversationFor(offer.buyerId, offer.storeId);
    const now = new Date();
    await prisma.message.create({
      data: {
        conversationId: convo.id, senderId, body, productId: offer.productId, offerId: offer.id, offerEvent: event, createdAt: now,
      },
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: now } });
    return convo.id;
  } catch (err) {
    console.error('[deals] chat line failed:', err.message);
    return null;
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
}).catch((err) => console.error('[deals] notify failed:', err.message));

const toSeller = (offer, title, message) => notify(offer.store.ownerId, 'SELLER', title, message, offer);
const toBuyer = (offer, title, message) => notify(offer.buyerId, 'BUYER', title, message, offer);
const buyerName = (offer) => offer.buyer?.fullName || 'The buyer';

/** The listing a buyer may make an offer on, or why not. */
const offerableProduct = async (productId, buyerId) => {
  const product = await prisma.product.findUnique({
    where: { id: String(productId || '') },
    include: { store: { select: { id: true, ownerId: true, isActive: true, isSuspended: true, name: true } } },
  });
  if (!product || product.deletedAt || product.status !== 'APPROVED') throw new ApiError('Listing not found', 404);
  if (kindOf(product) !== 'LIVESTOCK') throw new ApiError('Offers are for livestock listings only', 400);
  if (!product.store?.isActive || product.store.isSuspended) throw new ApiError('This shop is not selling right now', 400);
  if (product.store.ownerId === buyerId) throw new ApiError("You can't make an offer on your own listing", 400);
  if (!(await shopReadiness.isReady(product.storeId))) throw new ApiError('This shop is not taking orders yet', 400);
  return product;
};

const headsFor = (value, stock) => {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < 1) throw new ApiError('Choose how many heads', 400);
  if (stock <= 0) throw new ApiError('No heads are left on this listing', 400);
  if (qty > stock) throw new ApiError(`Only ${heads(stock)} available`, 400);
  return qty;
};

/** A price per head within half the asking price and the asking price. */
const pricePerHead = (value, listPrice) => {
  const price = money(value, 'The price');
  const lowest = Math.ceil(listPrice * MIN_SHARE * 100) / 100;
  if (price < lowest) throw new ApiError(`Prices start at half the asking price: ${peso(lowest)} per head`, 400);
  if (price > listPrice) throw new ApiError(`That's above the asking price (${peso(listPrice)} per head)`, 400);
  return price;
};

/** The buyer's deal on a listing that is still going, if any. */
const openDeal = (productId, buyerId) => prisma.priceOffer.findFirst({
  where: { productId, buyerId, status: { in: OPEN } },
  include: OFFER_INCLUDE,
  orderBy: { createdAt: 'desc' },
});

/** A buyer names a first price: the deal starts, in the chat. */
// One at a time per buyer: "one open deal per listing" and "ten a day" are
// counted before the offer is written, so offers sent together would all
// pass.
const make = (buyer, args = {}) => withKeyedLock(`offer:${buyer.id}`, () => makeNow(buyer, args));

const makeNow = async (buyer, {
  productId, quantity, price, note,
} = {}) => {
  const product = await offerableProduct(productId, buyer.id);
  const qty = headsFor(quantity, product.stock);
  const listPrice = unitPriceFor(product, null, qty);
  const offerPrice = pricePerHead(price, listPrice);

  const [open, today] = await Promise.all([
    openDeal(product.id, buyer.id),
    prisma.priceOffer.count({ where: { buyerId: buyer.id, createdAt: { gt: new Date(Date.now() - DAY) } } }),
  ]);
  if (open) throw new ApiError("You're already talking about this listing. Continue in the chat.", 409);
  if (today >= DAILY_LIMIT) throw new ApiError('You have made the most offers for today. Try again tomorrow.', 429);

  const offer = await prisma.priceOffer.create({
    data: {
      productId: product.id,
      storeId: product.storeId,
      buyerId: buyer.id,
      quantity: qty,
      listPrice,
      offerPrice,
      note: cleanText(note || '', { maxLength: 300 }) || null,
      status: 'PENDING',
      respondBy: new Date(Date.now() + ANSWER_MS),
    },
    include: OFFER_INCLUDE,
  });

  const conversationId = await chatLine(offer, buyer.id, 'OFFER', `Offered ${peso(offerPrice)} per head for ${heads(qty)}: ${peso(offerPrice * qty)} in all.${offer.note ? ` ${offer.note}` : ''}`);
  toSeller(offer, `New offer on ${product.name}`, `${buyer.fullName || 'A buyer'} offers ${peso(offerPrice)} per head for ${heads(qty)}. Answer in the chat.`);
  return { ...present(offer, 'BUYER'), conversationId };
};

const loadOffer = async (id) => {
  const offer = await prisma.priceOffer.findUnique({ where: { id: String(id || '') }, include: OFFER_INCLUDE });
  if (!offer) throw new ApiError('Deal not found', 404);
  return offer;
};

/** Which side of the deal the user is on, or not found. */
const sideOf = (offer, user) => {
  if (offer.buyerId === user.id) return 'BUYER';
  if (offer.store.ownerId === user.id) return 'SELLER';
  throw new ApiError('Deal not found', 404);
};

/**
 * Moves a deal on, only if it is still where it was read (two answers at
 * once: one wins, the other is told).
 */
const move = async (offer, from, data) => {
  const done = await prisma.priceOffer.updateMany({ where: { id: offer.id, status: { in: [].concat(from) } }, data });
  if (!done.count) throw new ApiError('This deal changed meanwhile. Refresh to see it.', 409);
  return prisma.priceOffer.findUnique({ where: { id: offer.id }, include: OFFER_INCLUDE });
};

const due = (date) => date && date.getTime() <= Date.now();
const mustBe = (offer, statuses, message) => {
  if (!statuses.includes(offer.status)) throw new ApiError(message, 409);
};
const listingLive = (offer) => {
  if (offer.product.deletedAt || offer.product.status !== 'APPROVED') throw new ApiError("This listing isn't available anymore", 409);
};

/** One side names a price: a counter on its turn, or a change to its own. */
const namePrice = async (offer, side, user, { price, quantity, note } = {}) => {
  mustBe(offer, TALKING, 'This deal is no longer being talked over');
  if (due(offer.respondBy)) throw new ApiError('This offer has expired', 409);
  listingLive(offer);
  if (offer.rounds >= MAX_ROUNDS) throw new ApiError('That is a lot of back and forth. Call or meet to settle it, or accept the last price.', 400);
  const qty = quantity == null ? offer.quantity : headsFor(quantity, offer.product.stock);
  const value = pricePerHead(price, Number(offer.listPrice));
  const said = cleanText(note || '', { maxLength: 300 }) || null;
  const theirTurn = turnOf(offer.status) === side;
  const data = {
    quantity: qty, rounds: { increment: 1 }, respondBy: new Date(Date.now() + ANSWER_MS),
  };
  if (side === 'BUYER') Object.assign(data, { status: 'PENDING', offerPrice: value, note: said ?? offer.note });
  else Object.assign(data, { status: 'COUNTERED', counterPrice: value, sellerNote: said });
  const next = await move(offer, offer.status, data);
  const event = theirTurn ? 'COUNTER' : 'CHANGE';
  const what = `${peso(value)} per head for ${heads(qty)}: ${peso(value * qty)} in all.`;
  await chatLine(next, user.id, event, `${theirTurn ? 'Can do' : 'Changed my price to'} ${what}${said ? ` ${said}` : ''}`);
  const name = offer.product.name;
  if (side === 'BUYER') toSeller(next, `${buyerName(offer)} named a price`, `${what.replace(/\.$/, '')} for ${name}. Answer in the chat.`);
  else toBuyer(next, `${offer.store.name} named a price`, `${what.replace(/\.$/, '')} for ${name}. Answer in the chat.`);
  return next;
};

/** Whoever's turn it is takes the price on the table. */
const accept = async (offer, side, user) => {
  mustBe(offer, TALKING, 'There is no price to accept');
  if (turnOf(offer.status) !== side) throw new ApiError('Wait for the other side to answer your price', 409);
  if (due(offer.respondBy)) throw new ApiError('This offer has expired', 409);
  listingLive(offer);
  if (offer.quantity > offer.product.stock) {
    throw new ApiError(`Only ${heads(offer.product.stock)} left. Name a price for fewer heads.`, 409);
  }
  const agreed = priceNow(offer);
  const next = await move(offer, offer.status, { status: 'ACCEPTED', agreedPrice: agreed, meetBy: new Date(Date.now() + MEET_MS) });
  const what = `${peso(agreed)} per head for ${heads(next.quantity)}: ${peso(agreed * next.quantity)} in all`;
  await chatLine(next, user.id, 'ACCEPT', side === 'SELLER'
    ? `Deal: ${what}. Let's meet so you can see the animals and settle it.`
    : `Deal: ${what}. Let's meet so I can see the animals and settle it.`);
  if (side === 'SELLER') toBuyer(next, 'Your offer was accepted', `${offer.store.name} agreed to ${what} for ${offer.product.name}. Set a meetup in the chat.`);
  else toSeller(next, 'Your price was accepted', `${buyerName(offer)} agreed to ${what} for ${offer.product.name}. Set a meetup in the chat.`);
  return next;
};

/** Ends the talks: the seller declines, the buyer declines or withdraws. */
const decline = async (offer, side, user, { note } = {}) => {
  mustBe(offer, TALKING, 'This deal is no longer being talked over');
  const said = cleanText(note || '', { maxLength: 300 }) || null;
  const buyerOwn = side === 'BUYER' && offer.status === 'PENDING';
  const next = await move(offer, offer.status, {
    status: buyerOwn ? 'CANCELLED' : 'DECLINED',
    closedBy: side,
    ...(side === 'SELLER' && said ? { sellerNote: said } : {}),
  });
  const name = offer.product.name;
  if (buyerOwn) {
    await chatLine(next, user.id, 'WITHDRAW', `Withdrew my offer.${said ? ` ${said}` : ''}`);
    toSeller(next, 'Offer withdrawn', `${buyerName(offer)} withdrew their offer on ${name}.`);
  } else if (side === 'BUYER') {
    await chatLine(next, user.id, 'DECLINE', `No deal at ${peso(priceNow(offer))} per head.${said ? ` ${said}` : ''}`);
    toSeller(next, 'Your price was declined', `${buyerName(offer)} declined your price on ${name}.`);
  } else {
    await chatLine(next, user.id, 'DECLINE', `Sorry, I can't do ${peso(priceNow(offer))} per head.${said ? ` ${said}` : ''}`);
    toBuyer(next, 'Your offer was declined', `${offer.store.name} declined your offer on ${name}.`);
  }
  return next;
};

/** Either side sets, or moves, when and where they meet. */
const meetup = async (offer, side, user, { at, place } = {}) => {
  mustBe(offer, ['ACCEPTED'], 'Set a meetup once you have agreed on a price');
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) throw new ApiError('Choose a day and time', 400);
  if (when.getTime() < Date.now() - HOUR) throw new ApiError('Choose a time from now on', 400);
  if (when.getTime() > Date.now() + 30 * DAY) throw new ApiError('Choose a day within the next 30 days', 400);
  const where = cleanText(place || '', { maxLength: 200 });
  if (!where) throw new ApiError('Say where you will meet', 400);
  const next = await move(offer, 'ACCEPTED', {
    meetAt: when,
    meetPlace: where,
    // The sale can be recorded until a week after the meetup.
    meetBy: new Date(Math.max(offer.meetBy?.getTime() || 0, when.getTime() + 7 * DAY)),
  });
  const label = when.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  await chatLine(next, user.id, 'MEETUP', `${offer.meetAt ? 'Changed the meetup' : "Let's meet"}: ${label} at ${where}.`);
  const text = `${label} at ${where}, for ${offer.product.name}.`;
  if (side === 'SELLER') toBuyer(next, 'Meetup set', text);
  else toSeller(next, 'Meetup set', text);
  return next;
};

/** Either side calls off an agreed deal before the sale. */
const callOff = async (offer, side, user, { note } = {}) => {
  mustBe(offer, ['ACCEPTED'], 'Only an agreed deal can be called off');
  const said = cleanText(note || '', { maxLength: 300 }) || null;
  const next = await move(offer, 'ACCEPTED', { status: 'CANCELLED', closedReason: 'CALLED_OFF', closedBy: side });
  await chatLine(next, user.id, 'CALL_OFF', `Called off the deal.${said ? ` ${said}` : ''}`);
  const text = `${side === 'SELLER' ? offer.store.name : buyerName(offer)} called off the deal on ${offer.product.name}.`;
  if (side === 'SELLER') toBuyer(next, 'Deal called off', text);
  else toSeller(next, 'Deal called off', text);
  return next;
};

const orderNumber = () => `EM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * Other buyers' deals on a listing that now has fewer heads: an agreed deal
 * for more than are left, or any deal once none are left, closes.
 */
const closeShortDeals = async (productId, stock, exceptId) => {
  const short = await prisma.priceOffer.findMany({
    where: {
      productId,
      id: { not: exceptId },
      OR: [
        { status: 'ACCEPTED', quantity: { gt: stock } },
        ...(stock <= 0 ? [{ status: { in: TALKING } }] : []),
      ],
    },
    include: OFFER_INCLUDE,
  });
  for (const offer of short) {
    const closed = await prisma.priceOffer.updateMany({
      where: { id: offer.id, status: offer.status },
      data: { status: 'CANCELLED', closedReason: stock <= 0 ? 'SOLD_OUT' : 'NOT_ENOUGH_HEADS', closedBy: 'SYSTEM' },
    });
    if (!closed.count) continue;
    toBuyer(offer, stock <= 0 ? `${offer.product.name} is sold out` : 'Not enough heads left',
      stock <= 0
        ? `The seller sold the last of ${offer.product.name}, so your deal is closed.`
        : `Only ${heads(stock)} of ${offer.product.name} are left now, so your deal for ${heads(offer.quantity)} is closed. You can make a new offer.`);
  }
};

/**
 * The seller records what was agreed in person: the heads and the total
 * paid. It becomes an order, handed over and paid in person, and the heads
 * come off the listing; the buyer confirms it within 3 days.
 */
const record = async (offer, side, user, { quantity, total, note } = {}) => {
  if (side !== 'SELLER') throw new ApiError('The seller records the sale', 403);
  mustBe(offer, ['ACCEPTED'], 'Record the sale once you have agreed and met');
  const qty = headsFor(quantity == null ? offer.quantity : quantity, offer.product.stock);
  const amount = money(total, 'The total');
  if (amount > MAX_TOTAL) throw new ApiError('That total is too large', 400);
  const said = cleanText(note || '', { maxLength: 300 }) || null;
  const buyer = await prisma.user.findUnique({
    where: { id: offer.buyerId }, select: { contactNumber: true, phoneVerifiedNumber: true, municipalityId: true, barangay: true, province: true },
  });
  const place = offer.meetPlace || offer.store.pickupAddress || 'Met in person';
  const unit = cents(amount / qty);
  const ref = orderNumber();

  let order;
  let stockLeft;
  try {
    ({ order, stockLeft } = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      const claimed = await tx.priceOffer.updateMany({ where: { id: offer.id, status: 'ACCEPTED' }, data: { status: 'CONFIRMING' } });
      if (!claimed.count) {
        const err = new Error('changed');
        err.code = 'DEAL_CHANGED';
        throw err;
      }
      const balanceAfter = await changeStock(tx, offer.productId, null, -qty);
      await tx.inventoryMovement.create({
        data: {
          productId: offer.productId, quantityDelta: -qty, balanceAfter, reason: 'SALE', referenceId: ref, actorId: user.id,
        },
      });
      const now = new Date();
      const made = await tx.order.create({
        data: {
          orderNumber: ref,
          buyerId: offer.buyerId,
          storeId: offer.storeId,
          subtotal: amount,
          deliveryFee: 0,
          discountAmount: 0,
          total: amount,
          status: 'PICKED_UP',
          fulfillmentMethod: 'PICKUP',
          pickupLocation: place,
          deliveryAddress: place,
          deliveryNotes: said,
          contactNumber: phoneOf(buyer) || '',
          paymentMethod: 'COD',
          paymentStatus: 'PAID',
          fulfillmentProofAt: now,
          buyerMunicipalityId: buyer?.municipalityId || null,
          buyerBarangay: buyer?.barangay || null,
          buyerProvince: buyer?.province || 'Oriental Mindoro',
          items: {
            create: [{
              productId: offer.productId,
              productName: offer.product.name,
              quantity: qty,
              price: unit,
              subtotal: amount,
              offerId: offer.id,
            }],
          },
          statusHistory: {
            create: [{
              fromStatus: null, toStatus: 'PICKED_UP', actorId: user.id, note: 'Livestock sale recorded after meeting in person',
            }],
          },
        },
      });
      await tx.priceOffer.update({
        where: { id: offer.id },
        data: {
          orderId: made.id, finalQuantity: qty, finalTotal: amount, respondBy: new Date(Date.now() + CONFIRM_MS), ...(said ? { sellerNote: said } : {}),
        },
      });
      return { order: made, stockLeft: balanceAfter };
    })));
  } catch (err) {
    if (err.code === 'DEAL_CHANGED') throw new ApiError('This deal changed meanwhile. Refresh to see it.', 409);
    if (err.code === 'INSUFFICIENT_STOCK') throw new ApiError(`Only ${heads(offer.product.stock)} left on the listing`, 409);
    throw err;
  }
  invalidateProductIds([offer.productId]);

  const next = await loadOffer(offer.id);
  await chatLine(next, user.id, 'RECORD', `Done: ${heads(qty)} for ${peso(amount)} in all, paid in person. Please confirm.${said ? ` ${said}` : ''}`);
  toBuyer(next, 'Confirm your purchase', `${offer.store.name} recorded ${heads(qty)} of ${offer.product.name} for ${peso(amount)}. Confirm it in the chat within 3 days.`);
  closeShortDeals(offer.productId, stockLeft ?? 0, offer.id).catch((err) => console.error('[deals] closing short deals failed:', err.message));
  return { offer: next, order };
};

/** The sale is final: the order completes and the deal is sold. */
const finish = async (offer, actorId, note) => {
  const next = await move(offer, 'CONFIRMING', { status: 'SOLD' });
  if (offer.orderId) {
    try {
      await orderRepository.updateStatus(offer.orderId, 'COMPLETED', 'PICKED_UP', actorId, note);
    } catch (err) {
      // Completed meanwhile from the orders page: nothing more to do.
      if (err.code !== 'STALE_ORDER_STATUS') throw err;
    }
  }
  return next;
};

/** The buyer confirms what the seller recorded. */
const confirm = async (offer, side, user) => {
  if (side !== 'BUYER') throw new ApiError('The buyer confirms the sale', 403);
  mustBe(offer, ['CONFIRMING'], 'There is no sale to confirm');
  const next = await finish(offer, user.id, 'Buyer confirmed the livestock sale');
  await chatLine(next, user.id, 'CONFIRM', `Confirmed: ${heads(next.finalQuantity)} for ${peso(next.finalTotal)}. Thank you!`);
  toSeller(next, 'Sale confirmed', `${buyerName(offer)} confirmed ${heads(next.finalQuantity)} of ${offer.product.name} for ${peso(next.finalTotal)}.`);
  notificationService.createNotification({
    userId: offer.buyerId,
    type: 'ORDER_COMPLETED',
    title: 'How was it?',
    message: `Rate ${offer.product.name} from ${offer.store.name} to help other buyers.`,
    relatedId: offer.orderId,
  }).catch(() => {});
  return next;
};

/**
 * The buyer says the recorded sale isn't what they agreed: the order is
 * undone (the heads go back) and the deal is agreed again, for the seller to
 * record once more.
 */
const notRight = async (offer, side, user, { note } = {}) => {
  if (side !== 'BUYER') throw new ApiError('Only the buyer can say this', 403);
  mustBe(offer, ['CONFIRMING'], 'There is no sale to check');
  const said = cleanText(note || '', { maxLength: 300 }) || null;
  // The order first: once it has completed (confirmed meanwhile), it stays.
  if (offer.orderId) {
    try {
      await orderRepository.cancelOrder(offer.orderId, user.id, {
        fromStatuses: ['PICKED_UP'], reason: 'SALE_NOT_RIGHT', by: 'BUYER', note: said || 'The buyer said the recorded sale was not what was agreed',
      });
    } catch (err) {
      if (err.code === 'ORDER_NOT_CANCELLABLE') throw new ApiError('This sale is already final', 409);
      throw err;
    }
  }
  const next = await move(offer, 'CONFIRMING', {
    status: 'ACCEPTED', orderId: null, finalQuantity: null, finalTotal: null, meetBy: new Date(Date.now() + MEET_MS),
  });
  await chatLine(next, user.id, 'NOT_RIGHT', `That isn't what we agreed.${said ? ` ${said}` : ''}`);
  toSeller(next, 'The buyer says the sale is not right', `${buyerName(offer)} says the sale of ${offer.product.name} isn't what you agreed.${said ? ` "${said}"` : ''} Talk it over and record it again.`);
  return next;
};

const ACTIONS = {
  price: namePrice,
  accept,
  decline,
  meetup,
  'call-off': callOff,
  confirm,
  'not-right': notRight,
};

/** A step on a deal by the buyer or the seller. */
const act = async (user, id, action, body = {}) => {
  const step = ACTIONS[action];
  if (!step && action !== 'record') throw new ApiError('Unknown step', 400);
  const offer = await loadOffer(id);
  const side = sideOf(offer, user);
  if (action === 'record') {
    const { offer: next, order } = await record(offer, side, user, body);
    return { ...present(next, side), order: { id: order.id, orderNumber: order.orderNumber } };
  }
  const next = await step(offer, side, user, body);
  return present(next, side);
};

/** One deal, for either side. */
const getOne = async (user, id) => {
  const offer = await loadOffer(id);
  return present(offer, sideOf(offer, user));
};

const GROUPS = {
  talking: TALKING,
  answer: ['PENDING'],
  waiting: ['COUNTERED'],
  agreed: ['ACCEPTED', 'CONFIRMING'],
  open: OPEN,
  sold: ['SOLD'],
  closed: ['DECLINED', 'CANCELLED', 'EXPIRED'],
};
const listWhere = (base, status) => (GROUPS[status] ? { ...base, status: { in: GROUPS[status] } } : base);

/** Each deal's chat, for the lists to open it. */
const withConversations = async (offers, side) => {
  if (!offers.length) return [];
  const convos = await prisma.conversation.findMany({
    where: { OR: offers.map((o) => ({ buyerId: o.buyerId, storeId: o.storeId })) },
    select: { id: true, buyerId: true, storeId: true },
  });
  const byPair = new Map(convos.map((c) => [`${c.buyerId}|${c.storeId}`, c.id]));
  return offers.map((o) => ({ ...present(o, side), conversationId: byPair.get(`${o.buyerId}|${o.storeId}`) || null }));
};

const countBy = async (where) => {
  const rows = await prisma.priceOffer.groupBy({ by: ['status'], where, _count: { _all: true } });
  const n = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return Object.fromEntries(Object.entries(GROUPS).map(([key, statuses]) => [key, statuses.reduce((sum, s) => sum + (n[s] || 0), 0)]));
};

/** A buyer's deals, newest first (one listing's open deal with ?productId=). */
const listMine = async (buyer, { status, productId } = {}) => {
  const base = { buyerId: buyer.id, ...(productId ? { productId: String(productId) } : {}) };
  const [offers, counts] = await Promise.all([
    prisma.priceOffer.findMany({
      where: listWhere(base, status), include: OFFER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 100,
    }),
    countBy({ buyerId: buyer.id }),
  ]);
  return { offers: await withConversations(offers, 'BUYER'), counts };
};

/** The deals on a seller's listings, newest first, with counts per tab. */
const listForStore = async (seller, { status } = {}) => {
  const store = await prisma.store.findUnique({ where: { ownerId: seller.id }, select: { id: true } });
  if (!store) throw new ApiError('You do not have a shop', 404);
  const [offers, counts] = await Promise.all([
    prisma.priceOffer.findMany({
      where: listWhere({ storeId: store.id }, status), include: OFFER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 100,
    }),
    countBy({ storeId: store.id }),
  ]);
  return { offers: await withConversations(offers, 'SELLER'), counts, pending: counts.answer };
};

/**
 * The deals between a buyer and a shop, for their chat: the ones still going
 * and the ones closed in the last 30 days.
 */
const forConversation = async (buyerId, storeId, side) => {
  const offers = await prisma.priceOffer.findMany({
    where: {
      buyerId,
      storeId,
      OR: [{ status: { in: OPEN } }, { updatedAt: { gt: new Date(Date.now() - 30 * DAY) } }],
    },
    include: OFFER_INCLUDE,
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  return offers.map((o) => present(o, side));
};

const estimates = new Map();

/**
 * What buyers usually pay per head for this animal in the shop's town: the
 * middle half of sales in the last 6 months, shown only from 3 sales up.
 */
const estimate = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: String(productId || '') },
    select: {
      id: true, productType: true, listingKind: true, details: true, deletedAt: true, store: { select: { municipalityId: true, municipality: { select: { name: true } } } },
    },
  });
  if (!product || product.deletedAt || kindOf(product) !== 'LIVESTOCK') throw new ApiError('Listing not found', 404);
  const animal = product.details?.animal;
  const townId = product.store?.municipalityId;
  const town = product.store?.municipality?.name || null;
  if (!animal || animal === 'OTHER' || !townId) return { animal: animal || null, town, count: 0, low: null, high: null };

  const key = `${animal}|${townId}`;
  const cached = estimates.get(key);
  if (cached && cached.at > Date.now() - ESTIMATE_TTL_MS) return cached.value;

  const sold = await prisma.priceOffer.findMany({
    where: {
      status: 'SOLD',
      updatedAt: { gt: new Date(Date.now() - ESTIMATE_DAYS * DAY) },
      finalQuantity: { gt: 0 },
      product: { details: { path: '$.animal', equals: animal } },
      store: { municipalityId: townId },
    },
    select: { finalQuantity: true, finalTotal: true },
    take: 500,
    orderBy: { updatedAt: 'desc' },
  });
  const perHead = sold.map((s) => Number(s.finalTotal) / s.finalQuantity).filter((n) => n > 0).sort((a, b) => a - b);
  const at = (q) => perHead[Math.min(perHead.length - 1, Math.max(0, Math.round(q * (perHead.length - 1))))];
  const round50 = (n) => Math.round(n / 50) * 50;
  const value = perHead.length >= ESTIMATE_MIN
    ? {
      animal, town, count: perHead.length, low: round50(at(0.25)), high: round50(at(0.75)),
    }
    : {
      animal, town, count: perHead.length, low: null, high: null,
    };
  estimates.set(key, { at: Date.now(), value });
  return value;
};

/**
 * The clock: prices nobody answered expire, agreed deals with no sale
 * recorded in time expire, and recorded sales the buyer left alone confirm
 * themselves. A deal whose order was completed or cancelled from the orders
 * pages follows it.
 */
const expireDue = async () => {
  const now = new Date();
  const [answers, meets] = await Promise.all([
    prisma.priceOffer.updateMany({ where: { status: { in: TALKING }, respondBy: { lte: now } }, data: { status: 'EXPIRED', closedBy: 'SYSTEM' } }),
    prisma.priceOffer.updateMany({ where: { status: 'ACCEPTED', meetBy: { lte: now } }, data: { status: 'EXPIRED', closedBy: 'SYSTEM' } }),
  ]);

  let confirmed = 0;
  const waiting = await prisma.priceOffer.findMany({
    where: {
      status: 'CONFIRMING',
      OR: [{ respondBy: { lte: now } }, { orderId: null }],
    },
    include: OFFER_INCLUDE,
    take: 200,
  });
  const orders = new Map((await prisma.order.findMany({
    where: { id: { in: waiting.map((o) => o.orderId).filter(Boolean) } },
    select: { id: true, status: true },
  })).map((o) => [o.id, o.status]));
  for (const offer of waiting) {
    try {
      if (orders.get(offer.orderId) === 'CANCELLED' || !offer.orderId) {
        await prisma.priceOffer.updateMany({
          where: { id: offer.id, status: 'CONFIRMING' },
          data: {
            status: 'ACCEPTED', orderId: null, finalQuantity: null, finalTotal: null, meetBy: new Date(Date.now() + MEET_MS),
          },
        });
        continue;
      }
      const next = await finish(offer, null, 'Confirmed automatically 3 days after the sale was recorded');
      confirmed += 1;
      const text = `${heads(next.finalQuantity)} of ${offer.product.name} for ${peso(next.finalTotal)}.`;
      toBuyer(next, 'Purchase confirmed', `Confirmed automatically after 3 days: ${text}`);
      toSeller(next, 'Sale confirmed', `Confirmed automatically after 3 days: ${text}`);
    } catch (err) {
      if (!(err instanceof ApiError)) console.error('[deals] auto-confirm failed:', err.message);
    }
  }

  // Completed from the orders pages before the buyer confirmed here.
  const completed = await prisma.priceOffer.findMany({
    where: { status: 'CONFIRMING', orderId: { not: null } },
    select: { id: true, orderId: true },
    take: 200,
  });
  if (completed.length) {
    const done = await prisma.order.findMany({
      where: { id: { in: completed.map((o) => o.orderId) }, status: 'COMPLETED' },
      select: { id: true },
    });
    if (done.length) {
      await prisma.priceOffer.updateMany({
        where: { status: 'CONFIRMING', orderId: { in: done.map((o) => o.id) } },
        data: { status: 'SOLD' },
      });
    }
  }
  return { expired: answers.count + meets.count, confirmed };
};

/** Prices waiting for the seller's answer, for the Seller Center badge. */
const pendingCount = async (storeId) => prisma.priceOffer.count({
  where: { storeId, status: 'PENDING', respondBy: { gt: new Date() } },
});

module.exports = {
  make,
  act,
  getOne,
  listMine,
  listForStore,
  forConversation,
  estimate,
  clearEstimates: () => estimates.clear(),
  expireDue,
  pendingCount,
  present,
  MIN_SHARE,
  ANSWER_MS,
  MEET_MS,
  CONFIRM_MS,
  DAILY_LIMIT,
};
