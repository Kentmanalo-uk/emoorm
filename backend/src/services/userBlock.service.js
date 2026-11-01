const blockRepository = require('../repositories/userBlock.repository');
const userRepository = require('../repositories/user.repository');
const storeRepository = require('../repositories/store.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * User Block Service
 *
 * One person deciding they will not deal with another. A seller with a
 * buyer who will not leave them alone; a buyer with a shop that pesters
 * them.
 *
 * Two things it is not:
 *   - it is not a report. Blocking is private and immediate and nobody
 *     reviews it. Reporting still works while blocked, deliberately: being
 *     unable to deal with someone must never mean being unable to report
 *     them.
 *   - it is not a suspension. Neither account is touched. The two of them
 *     simply stop being able to reach each other.
 *
 * Blocks are stored one way and read both ways. Whoever drew the line, the
 * line holds for both of them -- otherwise blocking somebody would leave
 * them free to keep writing while you could not answer.
 *
 * Shops are not blocked, people are: "block this shop" is stored against
 * whoever owns it (`ownerOf`), so one row answers the question whichever
 * side asks it.
 */

const ensureUser = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user || user.deletedAt) throw new ApiError('User not found', 404);
  return user;
};

/**
 * The person behind a shop, for callers that hold a storeId.
 * @param {String} storeId
 * @returns {Promise<String>} the owner's user id
 */
const ownerOf = async (storeId) => {
  const store = await storeRepository.findById(storeId);
  if (!store) throw new ApiError('Store not found', 404);
  return store.ownerId;
};

/**
 * Block someone. Blocking twice is not an error -- the caller wanted them
 * blocked, and they are.
 *
 * @param {String} blockerId
 * @param {String} blockedId
 * @param {String} [reason] kept for the blocker, never shown to the blocked
 */
const blockUser = async (blockerId, blockedId, reason) => {
  if (blockerId === blockedId) {
    throw new ApiError('You cannot block yourself', 400);
  }
  const target = await ensureUser(blockedId);
  // An admin is how a person reaches the platform itself. Blocking one
  // would cut off support, so it is not allowed.
  if (['SUPER_ADMIN', 'MUNICIPAL_ADMIN'].includes(target.role)) {
    throw new ApiError('Administrators cannot be blocked', 400);
  }

  const existing = await blockRepository.findOne(blockerId, blockedId);
  if (!existing) {
    await blockRepository.create(blockerId, blockedId, String(reason || '').trim().slice(0, 200));
  }
  return { blocked: true };
};

/**
 * Let them back in. Unblocking someone who was never blocked is also fine.
 */
const unblockUser = async (blockerId, blockedId) => {
  const existing = await blockRepository.findOne(blockerId, blockedId);
  if (existing) await blockRepository.remove(blockerId, blockedId);
  return { blocked: false };
};

/**
 * What one person should see about another: whether they blocked them, and
 * whether they are shut out themselves.
 *
 * `blockedByThem` is told plainly rather than hidden. A quiet failure
 * ("your message just never arrives") is worse than being told -- people
 * waste days wondering why a shop is ignoring them.
 */
const getBlockStatus = async (viewerId, otherId) => {
  if (!viewerId || viewerId === otherId) {
    return { blocking: false, blockedByThem: false, canInteract: true };
  }
  const rows = await blockRepository.findEither(viewerId, otherId);
  const blocking = rows.some((r) => r.blockerId === viewerId);
  const blockedByThem = rows.some((r) => r.blockerId === otherId);
  return { blocking, blockedByThem, canInteract: !blocking && !blockedByThem };
};

/**
 * May these two deal with each other at all? Either direction counts.
 * @returns {Promise<Boolean>}
 */
const isBlockedEither = async (a, b) => {
  if (!a || !b || a === b) return false;
  const rows = await blockRepository.findEither(a, b);
  return rows.length > 0;
};

/**
 * The gate every interaction calls. Throws 403 if either of them has
 * drawn the line.
 *
 * The two messages differ on purpose: the person who blocked is reminded
 * that they did it, and can undo it; the person blocked is told plainly,
 * without being told why or by what the other person said about them.
 */
const assertNotBlocked = async (actorId, otherId, what = 'do that') => {
  if (!actorId || !otherId || actorId === otherId) return;
  const rows = await blockRepository.findEither(actorId, otherId);
  if (!rows.length) return;

  const iBlocked = rows.some((r) => r.blockerId === actorId);
  throw new ApiError(
    iBlocked
      ? `You blocked this person. Unblock them to ${what}.`
      : `You cannot ${what} right now.`,
    403,
  );
};

const listMyBlocks = (blockerId) => blockRepository.listByBlocker(blockerId);

module.exports = {
  blockUser,
  unblockUser,
  getBlockStatus,
  isBlockedEither,
  assertNotBlocked,
  listMyBlocks,
  ownerOf,
};
