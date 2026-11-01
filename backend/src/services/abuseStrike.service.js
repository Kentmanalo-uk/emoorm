const prisma = require('../config/database');
const notificationService = require('./notification.service');
const { ApiError } = require('../middleware/errorHandler');

/**
 * The warn-then-restrict ladder, shared by every place a person can type
 * something at someone else.
 *
 * It started inside message.service, for chat alone. Review comments are
 * the second such place, and they must count on the same tally: someone
 * who is abusive in a chat and then abusive under a review is one person
 * being abusive twice, not two people one strike each. Keeping one
 * counter also means one restriction to lift.
 *
 * chatStrikes and chatRestrictedUntil keep their column names -- renaming
 * a live column buys nothing and costs a migration.
 */

// Three because a word list is a guess: one is an accident or a bad
// guess, three is a person. A week because it has to be long enough to
// matter and short enough that nobody need remember to undo it.
const STRIKE_LIMIT = 3;
const RESTRICTION_DAYS = 7;

/**
 * Whether this person may type anything public right now. A restriction
 * is words only: they can still buy, sell and be paid, which is exactly
 * why it is not isActive.
 *
 * @param {String} userId
 * @param {String} what - what is being refused, for the message ('messaging')
 */
const assertNotRestricted = async (userId, what = 'messaging') => {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { chatRestrictedUntil: true },
  });
  if (me?.chatRestrictedUntil && me.chatRestrictedUntil > new Date()) {
    throw new ApiError(
      `Your ${what} is paused while an administrator reviews earlier messages. You can still buy and sell.`,
      403,
    );
  }
};

/**
 * One strike against a person whose words were just flagged, and the
 * notice that goes with it. At STRIKE_LIMIT their words close for a week.
 *
 * The caller has already stored and delivered whatever was written: this
 * runs afterwards, in a try/catch, and nothing in it is worth losing that
 * for.
 *
 * @param {String} userId - who wrote it
 * @param {Object} copy
 * @param {String} copy.warnTitle - notice title below the limit
 * @param {String} copy.warnMessage - notice body below the limit
 * @param {String} [copy.relatedId] - what the notice links to
 * @returns {Promise<{reached: Boolean}>} whether this strike reached the limit
 */
const addStrike = async (userId, { warnTitle, warnMessage, relatedId } = {}) => {
  const after = await prisma.user.update({
    where: { id: userId },
    data: { chatStrikes: { increment: 1 } },
    select: { chatStrikes: true },
  });

  const reached = after.chatStrikes >= STRIKE_LIMIT;
  if (reached) {
    // The counter goes back to nought with the restriction, so a week
    // from now they start fresh rather than one word from another week.
    await prisma.user.update({
      where: { id: userId },
      data: {
        chatRestrictedUntil: new Date(Date.now() + RESTRICTION_DAYS * 86400000),
        chatStrikes: 0,
      },
    });
  }

  // SYSTEM_ANNOUNCEMENT, as a removed review uses (moderation.service
  // removeReview): a moderation notice to one person. A type of its own
  // would mean editing the Prisma enum, the second list in
  // notification.service and the category maps -- three places to drift.
  await notificationService.createNotification({
    userId,
    type: 'SYSTEM_ANNOUNCEMENT',
    title: reached ? 'Your messaging is paused' : warnTitle,
    message: reached
      ? `What you write is being reviewed and you cannot post for ${RESTRICTION_DAYS} days. You can still buy and sell as normal.`
      : warnMessage,
    relatedId,
  });

  return { reached };
};

module.exports = {
  STRIKE_LIMIT,
  RESTRICTION_DAYS,
  assertNotRestricted,
  addStrike,
};
