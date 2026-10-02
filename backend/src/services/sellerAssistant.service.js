const prisma = require('../config/database');
const sellerSetup = require('./sellerSetup.service');
const sellerAttention = require('./sellerAttention.service');
const shopReadiness = require('./shopReadiness.service');
const guide = require('./sellerAssistantGuide');
const { createAssistant, firstName } = require('./assistantCore');

/**
 * Seller Assistant Service ("Ate Moormy")
 *
 * Answers sellers' questions about selling on Emoorm, and nothing else, from
 * the seller guide and the seller's own shop status (assistantCore.js does
 * the answering).
 */

/* ── The seller's shop, as the answers need it ─────────────────────── */

const STEP_LABELS = {
  'delivery-areas': 'Choose where you deliver',
  'delivery-fee': 'Set your delivery fee',
  pickup: 'Add your pickup spot',
  payment: 'Add a way for buyers to pay (cash or a QR)',
};

/**
 * @param {Object} user - req.user
 * @returns {Promise<Object>} What the seller's shop looks like right now
 *   (no buyer data): its name, whether it can sell and what is missing,
 *   and what is waiting on the seller.
 */
const getSnapshot = async (user) => {
  const store = await prisma.store.findFirst({
    where: { ownerId: user.id, deletedAt: null },
    select: {
      id: true, name: true, isApproved: true, isActive: true, isSuspended: true,
      fulfillmentMode: true, acceptsCod: true, paymentQrImage: true, paymentQrType: true,
      municipality: { select: { name: true } },
    },
  });
  if (!store) return { store: null, firstName: firstName(user) };

  const [setup, attention, liveProducts, products] = await Promise.all([
    sellerSetup.getSetup(user.id).catch(() => null),
    sellerAttention.getSellerAttention(user).catch(() => []),
    shopReadiness.countLiveProducts({ storeId: store.id }),
    prisma.product.count({ where: { storeId: store.id, deletedAt: null } }),
  ]);
  const waiting = Object.fromEntries((attention || []).map((q) => [q.key, q.count || 0]));
  return {
    firstName: firstName(user),
    store: {
      name: store.name,
      town: store.municipality?.name || null,
      approved: store.isApproved !== false,
      open: store.isActive !== false,
      suspended: store.isSuspended === true,
      mode: store.fulfillmentMode,
      cash: store.acceptsCod !== false,
      qr: store.paymentQrImage ? (store.paymentQrType === 'QRPH' ? 'QR Ph' : 'GCash') : null,
    },
    readyToSell: setup?.readyToSell ?? null,
    missing: (setup?.sellMissing || []).filter((k) => STEP_LABELS[k]),
    identity: setup?.steps?.find((s) => s.key === 'identity')?.status || null,
    products,
    liveProducts,
    waiting,
  };
};

/** The shop status, as lines the model reads. */
const describeSnapshot = (snap) => {
  if (!snap.store) return 'The seller has no shop yet.';
  const s = snap.store;
  const modes = { DELIVERY: 'delivery only', PICKUP: 'pickup only', BOTH: 'delivery and pickup' };
  const lines = [
    `Shop: ${s.name}${s.town ? ` (${s.town})` : ''}.`,
    s.suspended ? 'The shop is suspended by an admin.' : null,
    !s.approved ? 'The shop is private: an admin has not approved it yet.' : null,
    !s.open ? 'The shop is closed (not active).' : null,
    `Ready to sell: ${snap.readyToSell ? 'yes' : 'no'}${snap.missing.length ? ` — still needed: ${snap.missing.map((k) => STEP_LABELS[k]).join('; ')}` : ''}.`,
    `Buyers get orders by ${modes[s.mode] || 'delivery'}. Payment: ${[s.cash && 'cash', s.qr && `${s.qr} QR`].filter(Boolean).join(' and ') || 'none set'}.`,
    `Products: ${snap.products} (${snap.liveProducts} live to buyers).`,
    `Waiting now: ${snap.waiting.pendingOrders || 0} new orders to confirm, ${snap.waiting.openReturns || 0} return requests, ${snap.waiting.unreadMessages || 0} unread buyer chats, ${snap.waiting.lowStock || 0} products low on stock.`,
  ];
  return lines.filter(Boolean).join('\n');
};

const assistant = createAssistant({
  guide,
  getSnapshot,
  describeSnapshot,
  prompt: {
    intro: [
      'You are Ate Moormy, the friendly assistant for sellers on Emoorm, an online marketplace for shops in Oriental Mindoro, Philippines.',
      'You help sellers use the Emoorm Seller Center: their shop, products, orders, delivery and pickup, payments, returns and refunds, reviews, chat with buyers, marketing, earnings and their seller account. Simple tips to sell more on Emoorm are welcome too.',
    ],
    subject: 'selling on Emoorm',
    statusTitle: 'SHOP STATUS',
    askInstead: 'messaging the admin: on phones Me › Message the admin; on computers Admin in the sidebar',
    placeExample: 'Me › Delivery & payment › Payment options',
  },
});

module.exports = {
  getIntro: assistant.getIntro,
  chat: assistant.chat,
  systemPrompt: assistant.systemPrompt,
  getSnapshot,
  describeSnapshot,
  rankTopics: assistant.rankTopics,
  domainHits: assistant.domainHits,
  looksTagalog: assistant.looksTagalog,
};
