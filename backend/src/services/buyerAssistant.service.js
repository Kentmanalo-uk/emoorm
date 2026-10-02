const prisma = require('../config/database');
const identityVerification = require('./identityVerification.service');
const appSettings = require('./appSetting.service');
const guide = require('./buyerAssistantGuide');
const { createAssistant, firstName } = require('./assistantCore');

/**
 * Buyer Assistant Service ("Ate Moormy" in the buyer's Messages)
 *
 * Answers questions about shopping on Emoorm, and nothing else, from the
 * buyer guide and the buyer's own orders (assistantCore.js does the
 * answering).
 */

/* ── The buyer's orders, as the answers need them ───────────────────── */

const OPEN_RETURN = ['REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED'];

/**
 * The My Orders tab an open order sits in (as web/src/lib/orderProgress.js
 * buyerBucket sorts them).
 */
const tabOf = (o) => {
  const qr = o.paymentMethod !== 'COD';
  if (qr && ((o.paymentStatus === 'PENDING' && o.status === 'CONFIRMED')
    || (o.paymentStatus === 'FAILED' && ['PENDING', 'CONFIRMED'].includes(o.status)))) return 'toPay';
  const pickup = o.fulfillmentMethod === 'PICKUP';
  if (pickup && ['READY', 'READY_FOR_PICKUP', 'PICKED_UP'].includes(o.status)) return 'toPickUp';
  if (!pickup && ['OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED'].includes(o.status)) return 'toReceive';
  return 'toShip';
};

/**
 * @param {Object} user - req.user
 * @returns {Promise<Object>} The buyer's open orders by My Orders tab, open
 *   returns, and whether they can check out (identity verification).
 */
const getSnapshot = async (user) => {
  const [orders, openReturns, verified, verificationRequired] = await Promise.all([
    prisma.order.findMany({
      where: { buyerId: user.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: { status: true, paymentMethod: true, paymentStatus: true, fulfillmentMethod: true },
      take: 200,
    }),
    prisma.returnRequest.count({ where: { buyerId: user.id, status: { in: OPEN_RETURN } } }),
    identityVerification.isVerified(user.id).catch(() => false),
    appSettings.isBuyerVerificationRequired().catch(() => true),
  ]);
  const counts = { toPay: 0, toShip: 0, toReceive: 0, toPickUp: 0 };
  for (const o of orders) counts[tabOf(o)] += 1;
  return { firstName: firstName(user), orders: counts, openReturns, verified, verificationRequired };
};

/** The buyer's status, as lines the model reads. */
const describeSnapshot = (snap) => [
  `Buyer: ${snap.firstName || 'unknown name'}.`,
  `Open orders in My Orders: To Pay ${snap.orders.toPay}, To Ship ${snap.orders.toShip}, To Receive ${snap.orders.toReceive}, To Pick Up ${snap.orders.toPickUp}.`,
  `Open return requests: ${snap.openReturns}.`,
  `Identity verified: ${snap.verified ? 'yes' : 'no'} (needed to check out: ${snap.verificationRequired ? 'yes' : 'no'}).`,
].join('\n');

const assistant = createAssistant({
  guide,
  getSnapshot,
  describeSnapshot,
  prompt: {
    intro: [
      'You are Ate Moormy, the friendly shopping helper for buyers on Emoorm, an online marketplace for local shops in Oriental Mindoro, Philippines.',
      'You help buyers shop on Emoorm: finding products and shops, the cart and checkout, paying (cash, GCash, QR Ph), delivery and pickup, their orders, cancelling, returns and refunds, vouchers, reviews, chatting with shops, and their account.',
    ],
    subject: 'shopping on Emoorm',
    statusTitle: 'BUYER STATUS',
    askInstead: 'starting a case with their municipal admin in Profile › Help & Support › New support case',
    placeExample: 'Profile › My Orders › To Pay',
  },
});

module.exports = {
  getIntro: assistant.getIntro,
  chat: assistant.chat,
  systemPrompt: assistant.systemPrompt,
  getSnapshot,
  describeSnapshot,
  rankTopics: assistant.rankTopics,
};
