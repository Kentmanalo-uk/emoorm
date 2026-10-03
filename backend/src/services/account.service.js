const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { comparePassword } = require('../utils/password');
const auditLogService = require('./auditLog.service');
const { purgeUser } = require('./userPurge.service');
const { sendMail, escapeHtml } = require('../utils/email');
const config = require('../config/env');

/**
 * The owner's own account: closing it (Data Privacy Act, right to erasure)
 * and taking a copy of what Emoorm holds about them (right to access).
 *
 * Closing happens in two steps. At once: the account stops working, every
 * session ends and a shop closes. Thirty days later the daily job erases it
 * with the same purge a super admin uses, so a mistaken or forced request can
 * still be undone through support in the meantime.
 */

const ERASE_AFTER_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// Orders and returns still owed a finish, on either side.
const FINISHED_ORDER = ['COMPLETED', 'CANCELLED'];
const OPEN_RETURN = ['REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED', 'DISPUTED'];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What stands between the user and closing the account, in plain words. */
const blockersFor = async (user) => {
  const store = await prisma.store.findUnique({ where: { ownerId: user.id }, select: { id: true } });
  const [orders, returns, shopOrders, shopReturns] = await Promise.all([
    prisma.order.count({ where: { buyerId: user.id, status: { notIn: FINISHED_ORDER } } }),
    prisma.returnRequest.count({ where: { buyerId: user.id, status: { in: OPEN_RETURN } } }),
    store ? prisma.order.count({ where: { storeId: store.id, status: { notIn: FINISHED_ORDER } } }) : 0,
    store ? prisma.returnRequest.count({ where: { storeId: store.id, status: { in: OPEN_RETURN } } }) : 0,
  ]);
  const out = [];
  if (orders) out.push(`You have ${plural(orders, 'order')} in progress. Wait for ${orders === 1 ? 'it' : 'them'} to arrive, or cancel ${orders === 1 ? 'it' : 'them'}.`);
  if (returns) out.push(`You have ${plural(returns, 'return')} in progress.`);
  if (shopOrders) out.push(`Your shop has ${plural(shopOrders, 'open order')} to finish or cancel.`);
  if (shopReturns) out.push(`Your shop has ${plural(shopReturns, 'open return')} to settle.`);
  return out;
};

const loadSelf = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, role: true, password: true, googleId: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new ApiError('Account not found', 404);
  return user;
};

// Admin accounts are handed over, not closed: a town would lose its admin.
const assertCanClose = (user) => {
  if (user.role === 'SUPER_ADMIN' || user.role === 'MUNICIPAL_ADMIN') {
    throw new ApiError('Admin accounts cannot be closed here. Ask the super admin to remove your access first.', 403);
  }
};

/** For the settings page: may this account be closed now, and how to confirm it. */
const deletionCheck = async (userId) => {
  const user = await loadSelf(userId);
  const adminRole = user.role === 'SUPER_ADMIN' || user.role === 'MUNICIPAL_ADMIN';
  return {
    allowed: !adminRole,
    blockers: adminRole ? [] : await blockersFor(user),
    // A Google-made account has no password its owner knows: they type
    // their email instead.
    confirmWith: user.googleId ? 'email' : 'password',
    eraseAfterDays: ERASE_AFTER_DAYS,
  };
};

const sendClosedEmail = async (user, eraseOn) => {
  const when = eraseOn.toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' });
  const help = `${String(config.frontendUrl || '').replace(/\/$/, '')}/help-center`;
  const name = user.fullName || 'there';
  const text = [
    `Hi ${name},`,
    '',
    'Your Emoorm account was closed at your request, and you were signed out everywhere.',
    `On ${when} it will be erased for good, with your orders, messages and reviews.`,
    'Sales you made at other shops stay in their records, without your name, address or number.',
    '',
    `Changed your mind, or wasn't this you? Contact us before ${when}: ${help}`,
    '',
    '— The Emoorm team',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#374151;">
      <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#111827;">Your account was closed</h1>
      <p>Hi ${escapeHtml(name)}, your Emoorm account was closed at your request, and you were signed out everywhere.</p>
      <p>On <strong>${escapeHtml(when)}</strong> it will be erased for good, with your orders, messages and reviews.
        Sales you made at other shops stay in their records, without your name, address or number.</p>
      <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;color:#991b1b;font-size:13px;">
        Changed your mind, or wasn't this you? <a href="${escapeHtml(help)}" style="color:#991b1b;">Contact us</a> before ${escapeHtml(when)}.
      </p>
    </div>`;
  return sendMail({ to: user.email, subject: 'Your Emoorm account was closed', html, text });
};

/**
 * Close the signed-in user's account.
 * @param {{ password?: string, email?: string }} proof - Whichever deletionCheck asked for
 */
const requestDeletion = async (userId, proof = {}, req) => {
  const user = await loadSelf(userId);
  assertCanClose(user);

  if (user.googleId) {
    if (String(proof.email || '').trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new ApiError('Type your email address exactly to confirm', 400);
    }
  } else if (!proof.password || !(await comparePassword(String(proof.password), user.password))) {
    // 400, not 401: a wrong password here must not sign the user out.
    throw new ApiError('Your password is not correct', 400);
  }

  const blockers = await blockersFor(user);
  if (blockers.length) throw new ApiError(blockers.join(' '), 409);

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: now,
        deletionRequestedAt: now,
        isActive: false,
        // Every access and refresh token stops working.
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.store.updateMany({ where: { ownerId: user.id }, data: { isActive: false } }),
    prisma.pushToken.deleteMany({ where: { userId: user.id } }),
    prisma.cartItem.deleteMany({ where: { userId: user.id } }),
  ]);

  await auditLogService.record({
    actor: { id: user.id, email: user.email, role: user.role },
    action: 'CLOSE_OWN_ACCOUNT',
    entity: 'User',
    entityId: user.id,
    details: { eraseAfterDays: ERASE_AFTER_DAYS },
    req,
  });

  const eraseOn = new Date(now.getTime() + ERASE_AFTER_DAYS * DAY);
  sendClosedEmail(user, eraseOn).catch((err) => console.error('[account] closing email failed:', err.message));
  return { closed: true, eraseOn };
};

/** Daily: erase accounts closed by their owners more than 30 days ago. */
const eraseClosedAccounts = async () => {
  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: new Date(Date.now() - ERASE_AFTER_DAYS * DAY) } },
    select: { id: true },
    take: 50,
  });
  let erased = 0;
  for (const { id } of due) {
    try {
      await purgeUser(id, null, 'DELETE');
      erased += 1;
    } catch (err) {
      console.error(`[account] could not erase ${id}:`, err.message);
    }
  }
  return { erased, due: due.length };
};

/** Super admin: undo a closing within the 30 days (the owner asked support). */
const cancelDeletion = async (userId, actor, req) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, deletionRequestedAt: true, email: true } });
  if (!user || !user.deletionRequestedAt) throw new ApiError('This account is not waiting to be erased', 404);
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null, deletionRequestedAt: null, isActive: true },
  });
  await auditLogService.record({ actor, action: 'RESTORE_CLOSED_ACCOUNT', entity: 'User', entityId: userId, req });
  return { restored: true };
};

/**
 * Everything Emoorm holds about the user, as one JSON document. Secrets
 * (password hash, MFA keys, tokens) and ID-document images are left out;
 * other people appear only as what the user already saw (a shop's name).
 */
const exportData = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, username: true, fullName: true, contactNumber: true, role: true,
      address: true, barangay: true, province: true, profilePhoto: true, isVerified: true,
      mfaEnabled: true, googleId: true, createdAt: true, updatedAt: true,
      municipality: { select: { name: true } },
      phoneVerifiedAt: true, phoneVerifiedNumber: true,
      sellerApplicationStatus: true, sellerApplicationDate: true, shopName: true, sellerBusinessType: true,
      sellerPermitNumber: true, payoutMethod: true, payoutAccountName: true, payoutAccountNumber: true,
    },
  });
  if (!user) throw new ApiError('Account not found', 404);
  const { googleId, ...profile } = user;

  const [addresses, orders, returns, reviews, wishlist, cart, follows, conversations, notifications, reports, questions, identity, store] = await Promise.all([
    prisma.address.findMany({ where: { userId }, select: { label: true, fullName: true, contactNumber: true, province: true, barangay: true, street: true, latitude: true, longitude: true, isDefault: true, municipality: { select: { name: true } } } }),
    prisma.order.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        orderNumber: true, status: true, subtotal: true, deliveryFee: true, discountAmount: true, total: true,
        fulfillmentMethod: true, paymentMethod: true, paymentStatus: true, deliveryAddress: true, deliveryNotes: true,
        contactNumber: true, voucherCode: true, createdAt: true, completedAt: true, cancelledAt: true,
        store: { select: { name: true } },
        items: { select: { productName: true, price: true, quantity: true, subtotal: true, selectedVariations: true } },
      },
    }),
    prisma.returnRequest.findMany({ where: { buyerId: userId }, select: { requestNumber: true, status: true, reason: true, buyerNote: true, requestedAmount: true, refundedAmount: true, createdAt: true, order: { select: { orderNumber: true } } } }),
    prisma.review.findMany({ where: { userId }, select: { rating: true, comment: true, images: true, createdAt: true, product: { select: { name: true } } } }),
    prisma.wishlistItem.findMany({ where: { userId }, select: { createdAt: true, product: { select: { name: true } } } }),
    prisma.cartItem.findMany({ where: { userId }, select: { quantity: true, product: { select: { name: true } } } }),
    prisma.storeFollow.findMany({ where: { buyerId: userId }, select: { createdAt: true, store: { select: { name: true } } } }),
    prisma.conversation.findMany({
      where: { buyerId: userId },
      select: {
        createdAt: true,
        store: { select: { name: true } },
        messages: { orderBy: { createdAt: 'asc' }, select: { body: true, createdAt: true, senderId: true } },
      },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500, select: { type: true, title: true, message: true, isRead: true, createdAt: true } }),
    prisma.report.findMany({ where: { reporterId: userId }, select: { type: true, reason: true, description: true, status: true, createdAt: true } }),
    prisma.productQuestion.findMany({ where: { askerId: userId }, select: { question: true, answer: true, createdAt: true, product: { select: { name: true } } } }),
    prisma.identityVerification.findUnique({ where: { userId }, select: { status: true, createdAt: true, updatedAt: true } }).catch(() => null),
    prisma.store.findUnique({
      where: { ownerId: userId },
      select: {
        name: true, slug: true, description: true, businessHours: true, pickupAddress: true, createdAt: true,
        municipality: { select: { name: true } },
        products: { where: { deletedAt: null }, select: { name: true, price: true, stock: true, status: true, createdAt: true } },
      },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note: 'Your Emoorm data. Passwords, security keys and ID-document images are not included.',
    profile: { ...profile, signsInWithGoogle: Boolean(googleId) },
    addresses,
    orders,
    returns,
    reviews,
    wishlist,
    cart,
    followedShops: follows,
    // Messages show "you" or the shop, never another person's account id.
    conversations: conversations.map((c) => ({
      shop: c.store?.name,
      startedAt: c.createdAt,
      messages: c.messages.map((m) => ({ from: m.senderId === userId ? 'you' : 'shop', body: m.body, at: m.createdAt })),
    })),
    notifications,
    reports,
    productQuestions: questions,
    identityVerification: identity,
    shop: store,
  };
};

module.exports = { deletionCheck, requestDeletion, eraseClosedAccounts, cancelDeletion, exportData, ERASE_AFTER_DAYS };
