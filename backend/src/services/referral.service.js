const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const appSettingService = require('./appSetting.service');
const notificationService = require('./notification.service');
const sms = require('../utils/sms');
const manila = require('../utils/manilaTime');

/**
 * Invites (referrals). No real cash anywhere:
 *
 *   Shop invites (BUYER): someone joins with a person's code, through a shop
 *   whose invite rewards are on. They get that shop's welcome voucher; when
 *   their first order there of at least the shop's minimum is completed, the
 *   inviter gets the shop's thank-you voucher. The shop pays both discounts,
 *   on its own sales. Joining with a code and no shop is still recorded and
 *   counted, with nothing to give.
 *
 *   Seller invites (SELLER): someone a seller brought in opens a shop. Once
 *   enough different buyers completed an order there, both shops are shown
 *   higher in For You for a while (store_boosts).
 *
 * Everything is off until a super admin turns it on (lib/referralSettings),
 * and a shop's rewards are off until its seller turns them on. Nothing here
 * may ever stop a sign-up or an order: every hook catches its own errors.
 *
 * Statuses (schema ReferralStatus): PENDING until the order (or the orders)
 * that make it count; then REWARDED, COUNTED (nothing to give: no program,
 * a cap, the inviter's own shop), HELD (something looked off: an admin
 * decides) or REJECTED.
 */

// Codes: no 0/O, 1/I/L, so one read out loud is typed right.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomPart = (n) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');
// Invite vouchers' codes say which kind they are: a person's checkout shows
// the code, and the phone check below applies to welcome vouchers only.
const WELCOME_PREFIX = 'HELLO-';
const THANKS_PREFIX = 'THANKS-';

const settings = async () => (await appSettingService.get()).referralSettings;
// The SMS check can only be asked for while SMS is set up.
const phoneCheckOn = (s) => s.requireVerifiedPhone && sms.enabled();

const normalizeCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const cleanNumber = (n) => String(n || '').replace(/[\s-]/g, '').replace(/^\+63/, '0');
const cleanText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const money = (v) => (v == null ? null : Number(v));

/** The start of this month in Manila, for the monthly caps. */
const monthStart = (now = new Date()) => manila.dayStart(`${manila.monthKey(now)}-01`);

const inviteLink = (code, shopSlug) => `${config.site.url}/invite/${encodeURIComponent(code)}${shopSlug ? `?shop=${encodeURIComponent(shopSlug)}` : ''}`;

/** "Maria Santos" -> "Maria S.": enough for the inviter to know who it is. */
const shortName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Someone';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};
const firstName = (fullName) => String(fullName || '').trim().split(/\s+/)[0] || 'Someone';

const SHOP_LIVE = { deletedAt: null, isActive: true, isSuspended: false };

/** A shop's invite rewards, as the apps show them. */
const programView = (p) => (p ? {
  isActive: p.isActive,
  welcomeType: p.welcomeType,
  welcomeValue: money(p.welcomeValue),
  rewardType: p.rewardType,
  rewardValue: money(p.rewardValue),
  maxDiscount: money(p.maxDiscount),
  minOrderAmount: money(p.minOrderAmount),
  monthlyCap: p.monthlyCap,
} : null);

/** A value a shop set, kept inside what the super admin allows today. */
const withinLimits = (type, value, s) => Math.min(Number(value), type === 'PERCENT' ? s.maxShopPercent : s.maxShopReward);

/* ── Codes ──────────────────────────────────────────────────────────── */

const stemOf = (user) => String(user.username || user.fullName || '')
  .normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'EMOORM';

/** A person's own code, made the first time it is asked for. */
const codeFor = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true, username: true, fullName: true },
  });
  if (!user) throw new ApiError('User not found', 404);
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = `${stemOf(user)}${randomPart(attempt < 3 ? 3 : 5)}`;
    try {
      const { count } = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      if (count) return code;
      // Made at the same moment by another request: theirs stands.
      return (await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } })).referralCode;
    } catch (err) {
      if (err.code !== 'P2002') throw err;
    }
  }
  throw new ApiError('Could not make an invite code. Try again.', 503);
};

const findInviter = (code) => (code ? prisma.user.findFirst({
  where: { referralCode: code, deletedAt: null, isActive: true },
  select: {
    id: true, fullName: true, profilePhoto: true, avatarKey: true, role: true, sellerApplicationStatus: true,
    store: {
      select: {
        id: true, name: true, slug: true, deletedAt: true, isActive: true, isSuspended: true,
      },
    },
  },
}) : null);

const isLiveShop = (store) => Boolean(store && !store.deletedAt && store.isActive && !store.isSuspended);
/** A seller whose shop is approved and open: who may invite sellers. */
const hasLiveShop = (user) => Boolean(user?.role === 'SELLER' && user.sellerApplicationStatus === 'APPROVED' && isLiveShop(user.store));

/** A shop by id or slug, open, with its invite rewards. */
const findShop = (value) => {
  const key = String(value || '').trim().slice(0, 191);
  if (!key) return null;
  return prisma.store.findFirst({
    where: { ...SHOP_LIVE, OR: [{ id: key }, { slug: key }] },
    select: { id: true, name: true, slug: true, logo: true, ownerId: true, referralProgram: true },
  });
};

/* ── Invite vouchers ────────────────────────────────────────────────── */

/** A shop voucher only `ownerId` can use, once. */
const makeVoucher = async ({
  prefix, store, ownerId, referralId, type, value, program, s, description,
}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.voucher.create({
        data: {
          code: `${prefix}${randomPart(8)}`,
          description,
          discountType: type,
          discountValue: withinLimits(type, value, s),
          maxDiscount: type === 'PERCENT' ? program.maxDiscount : null,
          minOrderAmount: program.minOrderAmount,
          usageLimit: 1,
          perUserLimit: 1,
          expiresAt: new Date(Date.now() + s.voucherDays * 86400e3),
          isActive: true,
          storeId: store.id,
          ownerId,
          referralId,
        },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
    }
  }
  throw new Error('no free voucher code');
};

const offText = (type, value) => (type === 'PERCENT' ? `${Number(value)}% off` : `₱${Number(value).toLocaleString('en-PH')} off`);

const notify = (userId, title, message, { audience, target = { kind: 'invites' } } = {}) => notificationService.createNotification({
  userId, type: 'SYSTEM_ANNOUNCEMENT', title, message, audience, target,
}).catch((err) => console.error('[referrals] notice failed:', err.message));

/** The friend's welcome voucher, when the shop's rewards are on. */
const giveWelcome = async (referral, store, s) => {
  const program = store?.referralProgram;
  if (!program?.isActive || !s.shopInvites) return null;
  const voucher = await makeVoucher({
    prefix: WELCOME_PREFIX,
    store,
    ownerId: referral.inviteeId,
    referralId: referral.id,
    type: program.welcomeType,
    value: program.welcomeValue,
    program,
    s,
    description: `Welcome to ${store.name}: your invite voucher`,
  });
  await prisma.referral.update({ where: { id: referral.id }, data: { welcomeVoucherId: voucher.id } });
  await notify(
    referral.inviteeId,
    `${offText(voucher.discountType, voucher.discountValue)} at ${store.name}`,
    `You were invited to ${store.name}. Use voucher ${voucher.code} on an order of ₱${Number(program.minOrderAmount).toLocaleString('en-PH')} or more there within ${s.voucherDays} days.`,
  );
  return voucher;
};

/* ── Joining with a code ────────────────────────────────────────────── */

/**
 * A new account joined with an invite code (sign-up, either way). Never
 * throws: a wrong or stale code must not stop anyone joining.
 * @param {String} inviteeId - The new account
 * @param {Object} input - { referralCode, referralShop (id or slug) }
 */
const attachAtSignup = async (inviteeId, input = {}) => {
  try {
    const code = normalizeCode(input.referralCode);
    if (!code) return null;
    const s = await settings();
    if (!s.enabled) return null;
    const inviter = await findInviter(code);
    if (!inviter || inviter.id === inviteeId) return null;
    // Set once: the first code is the one that counts.
    const { count } = await prisma.user.updateMany({ where: { id: inviteeId, referredById: null }, data: { referredById: inviter.id } });
    if (!count) return null;
    const store = s.shopInvites ? await findShop(input.referralShop) : null;
    const referral = await prisma.referral.create({
      data: { kind: 'BUYER', inviterId: inviter.id, inviteeId, storeId: store?.id || null },
    });
    await giveWelcome(referral, store, s);
    return referral;
  } catch (err) {
    console.error('[referrals] invite at sign-up failed:', err.message);
    return null;
  }
};

/**
 * Someone applying to sell names the seller who brought them in, when no
 * code was given at sign-up. Only a seller with an open shop invites sellers.
 * Never throws.
 */
const attachAtSellerApplication = async (userId, value) => {
  try {
    const code = normalizeCode(value);
    if (!code) return;
    const s = await settings();
    if (!s.enabled || !s.sellerInvites) return;
    const inviter = await findInviter(code);
    if (!inviter || inviter.id === userId || !hasLiveShop(inviter)) return;
    await prisma.user.updateMany({ where: { id: userId, referredById: null }, data: { referredById: inviter.id } });
  } catch (err) {
    console.error('[referrals] invite at seller application failed:', err.message);
  }
};

/**
 * The seller invite for a shop just approved, when a seller brought its
 * owner in. Also asked for lazily when that shop's orders complete, which
 * covers shops approved before invites were turned on. Never throws.
 */
const ensureSellerReferral = async (ownerId) => {
  try {
    const s = await settings();
    if (!s.enabled || !s.sellerInvites) return null;
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true, referredById: true, role: true, sellerApplicationStatus: true,
        store: { select: { id: true, deletedAt: true, isActive: true, isSuspended: true } },
      },
    });
    if (!owner?.referredById || !hasLiveShop(owner)) return null;
    const existing = await prisma.referral.findUnique({ where: { inviteeId_kind: { inviteeId: ownerId, kind: 'SELLER' } } });
    if (existing) return existing;
    const inviter = await prisma.user.findUnique({
      where: { id: owner.referredById },
      select: { id: true, role: true, sellerApplicationStatus: true, store: { select: { id: true, deletedAt: true, isActive: true, isSuspended: true } } },
    });
    if (!hasLiveShop(inviter)) return null;
    return await prisma.referral.create({
      data: { kind: 'SELLER', inviterId: inviter.id, inviteeId: ownerId, storeId: owner.store.id },
    });
  } catch (err) {
    if (err.code === 'P2002') return prisma.referral.findUnique({ where: { inviteeId_kind: { inviteeId: ownerId, kind: 'SELLER' } } });
    console.error('[referrals] seller invite failed:', err.message);
    return null;
  }
};

/* ── Counting ───────────────────────────────────────────────────────── */

/**
 * Claims a PENDING (or, for an admin, HELD) invite and writes the outcome in
 * one conditional update, so two orders completing at once cannot both
 * reward it. True when this call won.
 */
const claim = async (id, from, data) => {
  const { count } = await prisma.referral.updateMany({ where: { id, status: { in: from } }, data });
  return count > 0;
};

/** Why a friend's reward should wait for an admin, or null. */
const heldReason = async (referral, order, s) => {
  const [invitee, inviter] = await Promise.all([
    prisma.user.findUnique({ where: { id: referral.inviteeId }, select: { phoneVerifiedAt: true, phoneVerifiedNumber: true } }),
    prisma.user.findUnique({
      where: { id: referral.inviterId },
      select: { phoneVerifiedNumber: true, contactNumber: true, addresses: { select: { street: true, barangay: true } } },
    }),
  ]);
  if (phoneCheckOn(s)) {
    if (!invitee?.phoneVerifiedAt || !invitee.phoneVerifiedNumber) return 'NO_PHONE';
    const number = cleanNumber(invitee.phoneVerifiedNumber);
    if ([inviter?.phoneVerifiedNumber, inviter?.contactNumber].some((n) => n && cleanNumber(n) === number)) return 'SAME_PHONE';
    const others = await prisma.user.count({ where: { id: { not: referral.inviteeId }, phoneVerifiedNumber: invitee.phoneVerifiedNumber } });
    if (others > 0) return 'SHARED_PHONE';
  }
  // Delivered to one of the inviter's own addresses.
  const delivered = cleanText(order.deliveryAddress);
  if (order.fulfillmentMethod !== 'PICKUP' && delivered) {
    const same = (inviter?.addresses || []).some((a) => {
      const street = cleanText(a.street);
      return street.length >= 6 && delivered.includes(street) && delivered.includes(cleanText(a.barangay));
    });
    if (same) return 'SAME_ADDRESS';
  }
  return null;
};

/** The inviter's thank-you voucher for a counted shop invite. */
const giveThanks = async (referral, store, s) => {
  const program = store.referralProgram;
  const voucher = await makeVoucher({
    prefix: THANKS_PREFIX,
    store,
    ownerId: referral.inviterId,
    referralId: referral.id,
    type: program.rewardType,
    value: program.rewardValue,
    program,
    s,
    description: `Thank you for inviting a friend to ${store.name}`,
  });
  await prisma.referral.update({ where: { id: referral.id }, data: { rewardVoucherId: voucher.id } });
  const friend = await prisma.user.findUnique({ where: { id: referral.inviteeId }, select: { fullName: true } });
  await notify(
    referral.inviterId,
    `You earned ${offText(voucher.discountType, voucher.discountValue)} at ${store.name}`,
    `${firstName(friend?.fullName)} made their first order at ${store.name}. Your thank-you voucher ${voucher.code} is in Invite friends, valid for ${s.voucherDays} days.`,
  );
  return voucher;
};

/** What a counted shop invite earns: REWARDED, or COUNTED with why not. */
const shopOutcome = async (referral, store, s) => {
  const program = store?.referralProgram;
  if (!s.shopInvites || !program?.isActive) return { status: 'COUNTED', reason: 'NO_PROGRAM' };
  if (store.ownerId === referral.inviterId) return { status: 'COUNTED', reason: 'OWN_SHOP' };
  const inviter = await prisma.user.findUnique({ where: { id: referral.inviterId }, select: { isActive: true, deletedAt: true } });
  if (!inviter?.isActive || inviter.deletedAt) return { status: 'COUNTED', reason: 'INVITER_INACTIVE' };
  const since = monthStart();
  const [mine, shops] = await Promise.all([
    prisma.referral.count({ where: { inviterId: referral.inviterId, status: 'REWARDED', countedAt: { gte: since } } }),
    prisma.referral.count({ where: { storeId: store.id, kind: 'BUYER', status: 'REWARDED', countedAt: { gte: since } } }),
  ]);
  if (mine >= s.inviterMonthlyCap) return { status: 'COUNTED', reason: 'INVITER_CAP' };
  if (shops >= program.monthlyCap) return { status: 'COUNTED', reason: 'SHOP_CAP' };
  return { status: 'REWARDED', reason: null };
};

/** A completed order may be the one a friend's invite was waiting for. */
const countBuyerInvite = async (order, s) => {
  const referral = await prisma.referral.findUnique({ where: { inviteeId_kind: { inviteeId: order.buyerId, kind: 'BUYER' } } });
  if (!referral || referral.status !== 'PENDING') return;
  const store = referral.storeId ? await findShop(referral.storeId) : null;
  const program = store?.referralProgram;
  // A shop invite with rewards on waits for an order at that shop, of at
  // least its minimum (before the discount). Any other counts on any order.
  if (s.shopInvites && program?.isActive) {
    if (order.storeId !== store.id) return;
    if (Number(order.subtotal) < Number(program.minOrderAmount)) return;
  }
  let outcome = await shopOutcome(referral, store, s);
  if (outcome.status === 'REWARDED') {
    const held = await heldReason(referral, order, s);
    if (held) outcome = { status: 'HELD', reason: held };
  }
  const won = await claim(referral.id, ['PENDING'], {
    status: outcome.status, reason: outcome.reason, orderId: order.id, countedAt: new Date(),
  });
  if (!won) return;
  if (outcome.status === 'REWARDED') await giveThanks(referral, store, s);
};

/** Both shops of a counted seller invite, shown higher for a while. */
const boost = async (storeId, days, referralId) => {
  const current = await prisma.storeBoost.findFirst({ where: { storeId, until: { gt: new Date() } }, orderBy: { until: 'desc' } });
  const from = current ? current.until.getTime() : Date.now();
  return prisma.storeBoost.create({ data: { storeId, until: new Date(from + days * 86400e3), referralId } });
};

const giveBoosts = async (referral, inviterStoreId, s) => {
  await Promise.all([boost(inviterStoreId, s.boostDays, referral.id), boost(referral.storeId, s.boostDays, referral.id)]);
  const shops = await prisma.store.findMany({ where: { id: { in: [inviterStoreId, referral.storeId] } }, select: { id: true, name: true } });
  const nameOf = (id) => shops.find((x) => x.id === id)?.name || 'your shop';
  const target = { kind: 'seller-invites' };
  await Promise.all([
    notify(referral.inviterId, 'Your shop is shown higher', `${nameOf(referral.storeId)}, the shop you brought in, is up and selling. ${nameOf(inviterStoreId)} is shown higher in For You for ${s.boostDays} days.`, { audience: 'SELLER', target }),
    notify(referral.inviteeId, 'Your shop is shown higher', `${nameOf(referral.storeId)} is shown higher in For You for ${s.boostDays} days, a thank-you for joining through an invite.`, { audience: 'SELLER', target }),
  ]);
};

/** Different buyers (not the two sellers) who completed an order at a shop, up to `need`. */
const buyersAt = async (referral, need) => (await prisma.order.findMany({
  where: { storeId: referral.storeId, status: 'COMPLETED', buyerId: { notIn: [referral.inviterId, referral.inviteeId] } },
  distinct: ['buyerId'],
  select: { buyerId: true },
  take: need,
})).length;

const countSellerInvite = async (order, s) => {
  const ownerId = order.store?.ownerId;
  if (!ownerId) return;
  const referral = await ensureSellerReferral(ownerId);
  if (!referral || referral.status !== 'PENDING' || referral.storeId !== order.storeId) return;
  if (await buyersAt(referral, s.sellerOrdersToQualify) < s.sellerOrdersToQualify) return;
  const inviter = await prisma.user.findUnique({
    where: { id: referral.inviterId },
    select: { role: true, sellerApplicationStatus: true, store: { select: { id: true, deletedAt: true, isActive: true, isSuspended: true } } },
  });
  const rewarded = hasLiveShop(inviter);
  const won = await claim(referral.id, ['PENDING'], {
    status: rewarded ? 'REWARDED' : 'COUNTED', reason: rewarded ? null : 'INVITER_NO_SHOP', orderId: order.id, countedAt: new Date(),
  });
  if (won && rewarded) await giveBoosts(referral, inviter.store.id, s);
};

/**
 * An order was completed (order.repository updateStatus). Never throws:
 * completing the order has already happened.
 */
const onOrderCompleted = async (orderId) => {
  try {
    const s = await settings();
    if (!s.enabled) return;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, buyerId: true, storeId: true, status: true, subtotal: true, deliveryAddress: true, fulfillmentMethod: true,
        store: { select: { ownerId: true } },
      },
    });
    if (!order || order.status !== 'COMPLETED') return;
    await countBuyerInvite(order, s);
    if (s.sellerInvites) await countSellerInvite(order, s);
  } catch (err) {
    console.error('[referrals] counting an order failed:', err.message);
  }
};

/**
 * A refund on the order an invite counted on. When what the friend kept is
 * now under the shop's minimum, the invite no longer counts and the
 * thank-you voucher, if not used yet, is turned off. Never throws.
 */
const onOrderRefunded = async (orderId, refundedAmount) => {
  try {
    const referral = await prisma.referral.findFirst({ where: { orderId, kind: 'BUYER', status: { in: ['REWARDED', 'HELD', 'COUNTED'] } } });
    if (!referral) return;
    const [order, program] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId }, select: { subtotal: true } }),
      referral.storeId ? prisma.shopReferralProgram.findUnique({ where: { storeId: referral.storeId } }) : null,
    ]);
    const kept = Number(order?.subtotal || 0) - Number(refundedAmount || 0);
    if (program && kept >= Number(program.minOrderAmount)) return;
    if (!await claim(referral.id, ['REWARDED', 'HELD', 'COUNTED'], { status: 'REJECTED', reason: 'REFUNDED' })) return;
    if (referral.rewardVoucherId) {
      await prisma.voucher.updateMany({ where: { id: referral.rewardVoucherId, timesUsed: 0 }, data: { isActive: false } });
    }
  } catch (err) {
    console.error('[referrals] refund check failed:', err.message);
  }
};

/* ── Using an invite voucher ────────────────────────────────────────── */

/**
 * At checkout (voucher.service assertUsable): a welcome voucher needs the
 * friend's mobile number confirmed, and one number gets one shop's welcome
 * once, however many accounts it is on.
 */
const assertInviteVoucherUsable = async (voucher, userId) => {
  if (!voucher.code.startsWith(WELCOME_PREFIX)) return;
  const s = await settings();
  if (!phoneCheckOn(s)) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneVerifiedAt: true, phoneVerifiedNumber: true } });
  if (!user?.phoneVerifiedAt || !user.phoneVerifiedNumber) {
    throw new ApiError('Confirm your mobile number in Account Settings to use this invite voucher', 400);
  }
  const used = await prisma.voucherRedemption.count({
    where: {
      userId: { not: userId },
      user: { phoneVerifiedNumber: user.phoneVerifiedNumber },
      voucher: { storeId: voucher.storeId, code: { startsWith: WELCOME_PREFIX } },
    },
  });
  if (used > 0) throw new ApiError('A welcome voucher for this shop was already used with this mobile number', 400);
};

/* ── What the apps show ─────────────────────────────────────────────── */

const voucherView = (v) => ({
  id: v.id,
  code: v.code,
  kind: v.code.startsWith(THANKS_PREFIX) ? 'thanks' : 'welcome',
  discountType: v.discountType,
  discountValue: money(v.discountValue),
  maxDiscount: money(v.maxDiscount),
  minOrderAmount: money(v.minOrderAmount),
  expiresAt: v.expiresAt,
  store: v.store ? { id: v.store.id, name: v.store.name, slug: v.store.slug, logo: v.store.logo } : null,
});

/** A person's invite vouchers they can still use (optionally for one shop). */
const myVouchers = async (userId, storeId = null) => {
  const now = new Date();
  const rows = await prisma.voucher.findMany({
    where: {
      ownerId: userId,
      isActive: true,
      timesUsed: 0,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(storeId ? { storeId } : {}),
    },
    orderBy: { expiresAt: 'asc' },
    take: 50,
    include: { store: { select: { id: true, name: true, slug: true, logo: true } } },
  });
  return rows.map(voucherView);
};

/** Shops with invite rewards on, the person's own town first. */
const shopsWithRewards = async (municipalityId, excludeOwnerId) => {
  const rows = await prisma.shopReferralProgram.findMany({
    where: { isActive: true, store: { ...SHOP_LIVE, ownerId: { not: excludeOwnerId || undefined } } },
    include: { store: { select: { id: true, name: true, slug: true, logo: true, municipalityId: true } } },
    take: 60,
    orderBy: { updatedAt: 'desc' },
  });
  return rows
    .sort((a, b) => Number(b.store.municipalityId === municipalityId) - Number(a.store.municipalityId === municipalityId))
    .slice(0, 20)
    .map((p) => ({ ...p.store, municipalityId: undefined, program: programView(p) }));
};

const statusLine = (r, need) => {
  if (r.kind === 'SELLER' && r.status === 'PENDING') return `${r.progress ?? 0} of ${need} buyers`;
  return null;
};

/**
 * Invite friends: the person's code and link, who they invited and how far
 * each got, their invite vouchers and the shops whose invites give rewards.
 */
const getMine = async (userId) => {
  const s = await settings();
  if (!s.enabled) return { enabled: false };
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      municipalityId: true, role: true, sellerApplicationStatus: true,
      referredBy: { select: { fullName: true } },
      store: { select: { id: true, slug: true, deletedAt: true, isActive: true, isSuspended: true } },
    },
  });
  const code = await codeFor(userId);
  const since = monthStart();
  const [sent, rewardedThisMonth, vouchers, shops] = await Promise.all([
    prisma.referral.findMany({
      where: { inviterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        invitee: { select: { fullName: true, profilePhoto: true, avatarKey: true } },
        store: { select: { name: true, slug: true } },
      },
    }),
    prisma.referral.count({ where: { inviterId: userId, status: 'REWARDED', countedAt: { gte: since } } }),
    myVouchers(userId),
    s.shopInvites ? shopsWithRewards(me?.municipalityId, userId) : [],
  ]);
  // How far each pending seller invite is.
  const pendingSellers = sent.filter((r) => r.kind === 'SELLER' && r.status === 'PENDING' && r.storeId);
  await Promise.all(pendingSellers.map(async (r) => { r.progress = await buyersAt(r, s.sellerOrdersToQualify); }));
  const canInviteSellers = s.sellerInvites && hasLiveShop(me);

  return {
    enabled: true,
    shopInvites: s.shopInvites,
    sellerInvites: s.sellerInvites,
    code,
    link: inviteLink(code),
    sellerLink: canInviteSellers ? `${inviteLink(code)}?as=seller` : null,
    myShopLink: canInviteSellers && me.store?.slug ? inviteLink(code, me.store.slug) : null,
    invitedBy: me?.referredBy ? firstName(me.referredBy.fullName) : null,
    canInviteSellers,
    limits: {
      inviterMonthlyCap: s.inviterMonthlyCap,
      rewardedThisMonth,
      sellerOrdersToQualify: s.sellerOrdersToQualify,
      boostDays: s.boostDays,
      voucherDays: s.voucherDays,
      phoneCheck: phoneCheckOn(s),
    },
    totals: {
      joined: sent.filter((r) => r.kind === 'BUYER').length,
      counted: sent.filter((r) => ['REWARDED', 'COUNTED'].includes(r.status)).length,
      rewarded: sent.filter((r) => r.status === 'REWARDED').length,
      sellers: sent.filter((r) => r.kind === 'SELLER').length,
    },
    invites: sent.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: shortName(r.invitee?.fullName),
      photo: r.invitee?.profilePhoto || null,
      avatarKey: r.invitee?.avatarKey || null,
      status: r.status,
      reason: r.reason,
      shop: r.store ? { name: r.store.name, slug: r.store.slug } : null,
      progress: statusLine(r, s.sellerOrdersToQualify),
      createdAt: r.createdAt,
      countedAt: r.countedAt,
    })),
    vouchers,
    shops: shops.map((shop) => ({ ...shop, link: inviteLink(code, shop.slug) })),
  };
};

/**
 * The invite landing page (/invite/:code): who invited them and, through a
 * shop, what that shop gives. Public.
 */
const getInvite = async (rawCode, shopKey) => {
  const s = await settings();
  if (!s.enabled) return { enabled: false };
  const code = normalizeCode(rawCode);
  const inviter = await findInviter(code);
  if (!inviter) return { enabled: true, valid: false };
  const store = s.shopInvites && shopKey ? await findShop(shopKey) : null;
  const program = store?.referralProgram?.isActive ? store.referralProgram : null;
  return {
    enabled: true,
    valid: true,
    code,
    inviter: {
      firstName: firstName(inviter.fullName),
      photo: inviter.profilePhoto || null,
      avatarKey: inviter.avatarKey || null,
      shop: hasLiveShop(inviter) ? { name: inviter.store.name, slug: inviter.store.slug } : null,
    },
    shop: store ? {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logo: store.logo,
      welcome: program ? {
        type: program.welcomeType,
        value: withinLimits(program.welcomeType, program.welcomeValue, s),
        maxDiscount: money(program.maxDiscount),
        minOrderAmount: money(program.minOrderAmount),
        voucherDays: s.voucherDays,
      } : null,
    } : null,
    sellerInvites: s.sellerInvites && hasLiveShop(inviter),
  };
};

/** A shop's invite rewards for its page, when they are on. Public. */
const getShopRewards = async (storeId) => {
  const s = await settings();
  if (!s.enabled || !s.shopInvites) return null;
  const program = await prisma.shopReferralProgram.findFirst({ where: { storeId, isActive: true, store: SHOP_LIVE } });
  if (!program) return null;
  const view = programView(program);
  return {
    ...view,
    welcomeValue: withinLimits(view.welcomeType, view.welcomeValue, s),
    rewardValue: withinLimits(view.rewardType, view.rewardValue, s),
    monthlyCap: undefined,
    voucherDays: s.voucherDays,
  };
};

/* ── A seller's invite rewards ──────────────────────────────────────── */

const ownStore = async (userId) => {
  const store = await prisma.store.findUnique({ where: { ownerId: userId }, select: { id: true, slug: true, deletedAt: true } });
  if (!store || store.deletedAt) throw new ApiError('You do not have a shop', 403);
  return store;
};

const PROGRAM_DEFAULTS = {
  isActive: false, welcomeType: 'FIXED', welcomeValue: 30, rewardType: 'FIXED', rewardValue: 30, maxDiscount: null, minOrderAmount: 200, monthlyCap: 20,
};

/** The seller's own invite rewards, with the limits they must keep within. */
const getMyProgram = async (userId) => {
  const s = await settings();
  const store = await ownStore(userId);
  const program = await prisma.shopReferralProgram.findUnique({ where: { storeId: store.id } });
  const since = monthStart();
  const [rewardedThisMonth, joined] = await Promise.all([
    prisma.referral.count({ where: { storeId: store.id, kind: 'BUYER', status: 'REWARDED', countedAt: { gte: since } } }),
    prisma.referral.count({ where: { storeId: store.id, kind: 'BUYER' } }),
  ]);
  return {
    enabled: s.enabled && s.shopInvites,
    program: programView(program) || PROGRAM_DEFAULTS,
    limits: { maxShopReward: s.maxShopReward, maxShopPercent: s.maxShopPercent, voucherDays: s.voucherDays },
    stats: { joined, rewardedThisMonth },
  };
};

const TYPES = ['FIXED', 'PERCENT'];

const saveMyProgram = async (userId, input = {}) => {
  const s = await settings();
  if (!s.enabled || !s.shopInvites) throw new ApiError('Invites are not open yet', 403);
  const store = await ownStore(userId);
  const current = programView(await prisma.shopReferralProgram.findUnique({ where: { storeId: store.id } })) || PROGRAM_DEFAULTS;
  const next = { ...current };
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new ApiError('isActive must be true or false', 400);
    next.isActive = input.isActive;
  }
  for (const [typeKey, valueKey, label] of [['welcomeType', 'welcomeValue', 'Friend\'s welcome'], ['rewardType', 'rewardValue', 'Inviter\'s thank-you']]) {
    if (input[typeKey] !== undefined) {
      const type = String(input[typeKey]).toUpperCase();
      if (!TYPES.includes(type)) throw new ApiError(`${label} must be pesos or percent off`, 400);
      next[typeKey] = type;
    }
    if (input[valueKey] !== undefined) next[valueKey] = Number(input[valueKey]);
    const max = next[typeKey] === 'PERCENT' ? s.maxShopPercent : s.maxShopReward;
    const value = next[valueKey];
    if (!Number.isFinite(value) || value <= 0 || value > max) {
      throw new ApiError(`${label} must be more than 0 and at most ${next[typeKey] === 'PERCENT' ? `${max}%` : `₱${max}`}`, 400);
    }
    next[valueKey] = Math.round(value * 100) / 100;
  }
  if (input.maxDiscount !== undefined) {
    if (input.maxDiscount === null || input.maxDiscount === '') next.maxDiscount = null;
    else {
      const n = Number(input.maxDiscount);
      if (!Number.isFinite(n) || n <= 0 || n > s.maxShopReward) throw new ApiError(`The most off must be more than 0 and at most ₱${s.maxShopReward}`, 400);
      next.maxDiscount = Math.round(n * 100) / 100;
    }
  }
  if (input.minOrderAmount !== undefined) {
    const n = Number(input.minOrderAmount);
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new ApiError('Minimum order must be ₱0 to ₱100,000', 400);
    next.minOrderAmount = Math.round(n * 100) / 100;
  }
  if (input.monthlyCap !== undefined) {
    const n = Number(input.monthlyCap);
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new ApiError('Thank-you vouchers a month must be 1 to 500', 400);
    next.monthlyCap = n;
  }
  // A fixed voucher may not take off more than the minimum order it needs.
  for (const [typeKey, valueKey] of [['welcomeType', 'welcomeValue'], ['rewardType', 'rewardValue']]) {
    if (next[typeKey] === 'FIXED' && next.minOrderAmount > 0 && next[valueKey] > next.minOrderAmount) {
      throw new ApiError('A voucher cannot take off more than the minimum order', 400);
    }
  }
  const data = {
    isActive: next.isActive,
    welcomeType: next.welcomeType,
    welcomeValue: next.welcomeValue,
    rewardType: next.rewardType,
    rewardValue: next.rewardValue,
    maxDiscount: next.welcomeType === 'PERCENT' || next.rewardType === 'PERCENT' ? next.maxDiscount : null,
    minOrderAmount: next.minOrderAmount,
    monthlyCap: next.monthlyCap,
  };
  await prisma.shopReferralProgram.upsert({ where: { storeId: store.id }, create: { storeId: store.id, ...data }, update: data });
  return getMyProgram(userId);
};

/* ── Admin ──────────────────────────────────────────────────────────── */

// Municipal admins see the invites of people in their own town.
const scopeWhere = (actor, municipalityId) => {
  const town = actor.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : (municipalityId || undefined);
  return town ? { invitee: { municipalityId: town } } : {};
};

const STATUSES = ['PENDING', 'HELD', 'REWARDED', 'COUNTED', 'REJECTED'];

const listAdmin = async (actor, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  const status = STATUSES.includes(String(query.status || '').toUpperCase()) ? String(query.status).toUpperCase() : undefined;
  const kind = ['BUYER', 'SELLER'].includes(String(query.kind || '').toUpperCase()) ? String(query.kind).toUpperCase() : undefined;
  const search = String(query.search || '').trim().slice(0, 100);
  const scope = scopeWhere(actor, query.municipalityId);
  const where = {
    ...scope,
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(search ? {
      OR: [
        { inviter: { fullName: { contains: search } } },
        { invitee: { fullName: { contains: search } } },
        { inviter: { referralCode: { contains: search.toUpperCase() } } },
        { store: { name: { contains: search } } },
      ],
    } : {}),
  };
  const person = { select: { id: true, fullName: true, email: true, referralCode: true, phoneVerifiedAt: true } };
  const [items, total, byStatus] = await Promise.all([
    prisma.referral.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        inviter: person,
        invitee: { select: { ...person.select, municipality: { select: { name: true } } } },
        store: { select: { name: true, slug: true } },
      },
    }),
    prisma.referral.count({ where }),
    prisma.referral.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      inviter: r.inviter,
      invitee: { ...r.invitee, town: r.invitee.municipality?.name || null, municipality: undefined },
      shop: r.store,
      orderId: r.orderId,
      createdAt: r.createdAt,
      countedAt: r.countedAt,
      decidedAt: r.decidedAt,
    })),
    total,
    page,
    pageSize,
    counts: Object.fromEntries(STATUSES.map((st) => [st, byStatus.find((g) => g.status === st)?._count._all || 0])),
  };
};

/**
 * An admin decides a held invite: approve gives the reward the checks held
 * back (if the shop still has rewards on), reject counts it as nothing.
 */
const decide = async (actor, id, action) => {
  if (!['approve', 'reject'].includes(action)) throw new ApiError('Choose approve or reject', 400);
  const referral = await prisma.referral.findUnique({ where: { id }, include: { invitee: { select: { municipalityId: true } } } });
  if (!referral) throw new ApiError('Invite not found', 404);
  if (actor.role === 'MUNICIPAL_ADMIN' && referral.invitee?.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only decide invites in your own town', 403);
  }
  if (referral.status !== 'HELD') throw new ApiError('Only a held invite can be decided', 409);
  const decided = { decidedById: actor.id, decidedAt: new Date() };
  if (action === 'reject') {
    await claim(id, ['HELD'], { status: 'REJECTED', ...decided });
    return { id, status: 'REJECTED' };
  }
  const s = await settings();
  const store = referral.storeId ? await findShop(referral.storeId) : null;
  const rewardable = s.enabled && s.shopInvites && store?.referralProgram?.isActive;
  if (!await claim(id, ['HELD'], { status: rewardable ? 'REWARDED' : 'COUNTED', reason: rewardable ? null : 'NO_PROGRAM', ...decided })) {
    throw new ApiError('This invite was decided elsewhere. Refresh and try again.', 409);
  }
  if (rewardable) await giveThanks(referral, store, s);
  return { id, status: rewardable ? 'REWARDED' : 'COUNTED' };
};

/** Shops shown higher right now (recommendation.service). */
const boostedStoreIds = async () => {
  const rows = await prisma.storeBoost.findMany({ where: { until: { gt: new Date() } }, select: { storeId: true }, distinct: ['storeId'] });
  return new Set(rows.map((r) => r.storeId));
};

module.exports = {
  codeFor,
  attachAtSignup,
  attachAtSellerApplication,
  ensureSellerReferral,
  onOrderCompleted,
  onOrderRefunded,
  assertInviteVoucherUsable,
  myVouchers,
  getMine,
  getInvite,
  getShopRewards,
  getMyProgram,
  saveMyProgram,
  listAdmin,
  decide,
  boostedStoreIds,
  WELCOME_PREFIX,
  THANKS_PREFIX,
};
