const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendPlayTesterAddedEmail } = require('../utils/email');

/**
 * The early version on Google Play (closed testing). Google lets only the
 * accounts on the Play Console tester list install it, so people leave their
 * Gmail on the /app page; a super admin copies the waiting ones into Play
 * Console and marks them added, which emails each the link to join.
 */

const PACKAGE = 'shop.emoorm.app';
const JOIN_URL = `https://play.google.com/apps/testing/${PACKAGE}`;
const STORE_URL = `https://play.google.com/store/apps/details?id=${PACKAGE}`;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,180}\.[a-z]{2,24}$/i;

const normalise = (value) => String(value || '').trim().toLowerCase();

/**
 * Puts an email on the waiting list. Asking twice is fine: the answer is the
 * same, and an account signed in now is linked to it.
 * @returns {Promise<{ email: string, added: boolean }>}
 */
const join = async ({ email, userId = null }) => {
  const address = normalise(email);
  if (address.length > 191 || !EMAIL.test(address)) {
    throw new ApiError('Enter the Gmail address you use on Google Play', 400);
  }
  const row = await prisma.playTester.upsert({
    where: { email: address },
    create: { email: address, userId },
    update: userId ? { userId } : {},
  });
  return { email: row.email, added: Boolean(row.addedAt) };
};

/** Everyone on the list, waiting first, newest first (super admin). */
const list = async () => {
  const rows = await prisma.playTester.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 2000,
    select: {
      id: true, email: true, addedAt: true, createdAt: true,
      user: { select: { id: true, fullName: true } },
    },
  });
  const waiting = rows.filter((r) => !r.addedAt);
  return {
    joinUrl: JOIN_URL,
    storeUrl: STORE_URL,
    waiting: waiting.length,
    added: rows.length - waiting.length,
    testers: [...waiting, ...rows.filter((r) => r.addedAt)],
  };
};

/**
 * Marks testers added to Play Console and emails each the link to join. An
 * email that cannot be sent leaves them marked: the admin sees it failed.
 * @returns {Promise<{ marked: number, emailed: number, failed: string[] }>}
 */
const markAdded = async (ids) => {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'))].slice(0, 500);
  if (!wanted.length) throw new ApiError('Choose who was added', 400);
  const rows = await prisma.playTester.findMany({
    where: { id: { in: wanted }, addedAt: null },
    select: { id: true, email: true, user: { select: { fullName: true } } },
  });
  if (!rows.length) return { marked: 0, emailed: 0, failed: [] };
  await prisma.playTester.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, addedAt: null },
    data: { addedAt: new Date() },
  });
  const failed = [];
  for (const row of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendPlayTesterAddedEmail({
        email: row.email, name: row.user?.fullName || null, joinUrl: JOIN_URL, storeUrl: STORE_URL,
      });
    } catch (err) {
      console.error(`[play-testers] could not email ${row.email}: ${err.message}`);
      failed.push(row.email);
    }
  }
  return { marked: rows.length, emailed: rows.length - failed.length, failed };
};

/** Takes someone off the list (asked to, or a mistyped address). */
const remove = async (id) => {
  const { count } = await prisma.playTester.deleteMany({ where: { id: String(id) } });
  if (!count) throw new ApiError('Not on the list', 404);
};

module.exports = {
  join, list, markAdded, remove, JOIN_URL, STORE_URL,
};
