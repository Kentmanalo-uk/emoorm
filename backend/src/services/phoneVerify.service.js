const crypto = require('crypto');
const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const sms = require('../utils/sms');
const manila = require('../utils/manilaTime');
const counters = require('../lib/securityCounters');

/**
 * Proving a mobile number with a 6-digit code by SMS, so shops can trust a
 * cash-on-delivery buyer's number (and, when COD_REQUIRES_VERIFIED_PHONE is
 * on, so cash on delivery needs one).
 *
 * Codes are kept for 10 minutes, and every limit below is counted, in the
 * database (lib/securityCounters): a restart keeps them, so it is neither a
 * way round the limits nor a reason to ask for a new code.
 */

const CODE_TTL = 10 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const MAX_SENDS = 5; // per account per hour
const MAX_TRIES = 5;
const HOUR = 3600e3;

/*
 * Each text costs money. Besides the per-account limits above, one number
 * gets at most 5 codes a day (so nobody can flood a stranger's phone from
 * several accounts) and the whole site sends at most 500 a day. Counted per
 * Manila day; the counts start again with the date.
 */
const MAX_PER_NUMBER_PER_DAY = 5;
const MAX_SITE_PER_DAY = 500;
/** The rest of today in Manila, and its name, for the daily counters. */
const today = () => {
  const day = manila.dayKey(new Date());
  return { day, left: Math.max(60e3, manila.dayEnd(day).getTime() + 1 - Date.now()) };
};
const hitsOf = async (name) => (await counters.peek(name))?.hits || 0;

const PH_MOBILE = /^09\d{9}$/;
const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const cleanNumber = (n) => String(n || '').replace(/[\s-]/g, '').replace(/^\+63/, '0');

const config = () => ({ enabled: sms.enabled() });

const sendCode = async (userId, rawNumber) => {
  if (!sms.enabled()) throw new ApiError('Number verification is not available yet', 503);
  const number = cleanNumber(rawNumber);
  if (!PH_MOBILE.test(number)) throw new ApiError('Enter a mobile number like 09171234567', 400);
  // One code a minute per account, claimed in one step: two requests at
  // once cannot both get past it.
  if ((await counters.hit(`sms-wait:${userId}`, RESEND_AFTER)).hits > 1) {
    throw new ApiError('Wait a minute before asking for another code', 429);
  }
  const { day, left } = today();
  const [sends, toNumber, site] = await Promise.all([
    hitsOf(`sms-sends:${userId}`), hitsOf(`sms-day:${day}:${number}`), hitsOf(`sms-day:${day}`),
  ]);
  if (sends >= MAX_SENDS) throw new ApiError('Too many codes asked for. Try again in an hour.', 429);
  if (toNumber >= MAX_PER_NUMBER_PER_DAY) {
    throw new ApiError('This number has had too many codes today. Try again tomorrow.', 429);
  }
  if (site >= MAX_SITE_PER_DAY) {
    throw new ApiError('Number verification is busy today. Please try again tomorrow.', 503);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  // Recorded before the text goes out. A failed or timed-out send still
  // counts (the gateway may have delivered, and billed, it), and the code
  // stays valid in case it arrives.
  await Promise.all([
    counters.put(`sms-code:${userId}`, { number, hash: hash(code) }, new Date(Date.now() + CODE_TTL)),
    counters.hit(`sms-sends:${userId}`, HOUR),
    counters.hit(`sms-day:${day}:${number}`, left),
    counters.hit(`sms-day:${day}`, left),
  ]);
  await sms.sendSms(number, `Your Emoorm code is ${code}. It expires in 10 minutes. Never share it with anyone, even Emoorm staff.`)
    .catch(() => { throw new ApiError('The text could not be sent. Try again in a while.', 502); });
  return { sentTo: `${number.slice(0, 4)}***${number.slice(-3)}` };
};

const verifyCode = async (userId, code) => {
  const name = `sms-code:${userId}`;
  const entry = await counters.peek(name);
  if (!entry?.data?.hash) throw new ApiError('The code has expired. Ask for a new one.', 400);
  // hits: the wrong codes typed for it.
  if (entry.hits >= MAX_TRIES) throw new ApiError('Too many wrong codes. Ask for a new one.', 429);
  if (hash(String(code || '').trim()) !== entry.data.hash) {
    await counters.hit(name, CODE_TTL);
    throw new ApiError('That code is not right', 400);
  }
  // Taken once: of two requests with the right code, the second finds none.
  const { count } = await prisma.securityCounter.deleteMany({ where: { name: counters.nameOf(name) } });
  if (!count) throw new ApiError('The code has expired. Ask for a new one.', 400);
  const { number } = entry.data;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { phoneVerifiedAt: new Date(), phoneVerifiedNumber: number, contactNumber: number },
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
