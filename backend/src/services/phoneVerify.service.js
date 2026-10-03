const crypto = require('crypto');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const sms = require('../utils/sms');

/**
 * Proving a mobile number with a 6-digit code by SMS, so shops can trust a
 * cash-on-delivery buyer's number (and, when COD_REQUIRES_VERIFIED_PHONE is
 * on, so cash on delivery needs one).
 *
 * Codes are kept in this process for 10 minutes (one server process on
 * Hostinger); a restart only means asking for a new code.
 */

const CODE_TTL = 10 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const MAX_SENDS = 5; // per account per hour
const MAX_TRIES = 5;
const pending = new Map(); // userId → { number, hash, expires, tries, sends: [times] }

const PH_MOBILE = /^09\d{9}$/;
const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const cleanNumber = (n) => String(n || '').replace(/[\s-]/g, '').replace(/^\+63/, '0');

const config = () => ({ enabled: sms.enabled() });

const sendCode = async (userId, rawNumber) => {
  if (!sms.enabled()) throw new ApiError('Number verification is not available yet', 503);
  const number = cleanNumber(rawNumber);
  if (!PH_MOBILE.test(number)) throw new ApiError('Enter a mobile number like 09171234567', 400);
  const now = Date.now();
  const entry = pending.get(userId) || { sends: [] };
  entry.sends = (entry.sends || []).filter((t) => now - t < 3600e3);
  if (entry.sends.length && now - entry.sends[entry.sends.length - 1] < RESEND_AFTER) {
    throw new ApiError('Wait a minute before asking for another code', 429);
  }
  if (entry.sends.length >= MAX_SENDS) throw new ApiError('Too many codes asked for. Try again in an hour.', 429);

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await sms.sendSms(number, `Your Emoorm code is ${code}. It expires in 10 minutes. Never share it with anyone, even Emoorm staff.`)
    .catch(() => { throw new ApiError('The text could not be sent. Try again in a while.', 502); });
  pending.set(userId, { number, hash: hash(code), expires: now + CODE_TTL, tries: 0, sends: [...entry.sends, now] });
  return { sentTo: `${number.slice(0, 4)}***${number.slice(-3)}` };
};

const verifyCode = async (userId, code) => {
  const entry = pending.get(userId);
  if (!entry || Date.now() > entry.expires) throw new ApiError('The code has expired. Ask for a new one.', 400);
  if (entry.tries >= MAX_TRIES) throw new ApiError('Too many wrong codes. Ask for a new one.', 429);
  if (hash(String(code || '').trim()) !== entry.hash) {
    entry.tries += 1;
    throw new ApiError('That code is not right', 400);
  }
  pending.delete(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { phoneVerifiedAt: new Date(), phoneVerifiedNumber: entry.number, contactNumber: entry.number },
    select: { phoneVerifiedAt: true, phoneVerifiedNumber: true, contactNumber: true },
  });
  return user;
};

/** For checkout: is a verified number required for cash on delivery, and does this buyer have one? */
const assertCodAllowed = async (userId) => {
  if (process.env.COD_REQUIRES_VERIFIED_PHONE !== 'true' || !sms.enabled()) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneVerifiedAt: true } });
  if (!user?.phoneVerifiedAt) {
    throw new ApiError('Verify your mobile number to order with cash on delivery (Account Settings).', 400);
  }
};

module.exports = { config, sendCode, verifyCode, assertCodAllowed };
