const profileRepository = require('../repositories/profile.repository');
const storeRepository = require('../repositories/store.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Public profile service.
 *
 * Every account has the same deliberately minimal public face: who they are,
 * roughly where they are, how long they have been around, whether their
 * identity has been checked, and a way to start a chat when one is actually
 * possible. Nothing else — no orders, no reviews, no follows, no stats.
 *
 * This is the person, not their business. Someone who owns a shop can still
 * buy from others, and the seller of that order is asking about the customer,
 * so the shop is left out of this entirely: it has its own page.
 */

/**
 * Can this viewer start a conversation with this person?
 *
 * Conversations are buyer <-> store, and from a person's page the only one
 * that can start is their seller's: the viewer owns a shop this person has
 * ordered from. Two buyers can never chat. Messaging a shop starts on the
 * shop's page.
 *
 * @param {Object} user - The profile being viewed
 * @param {Object|null} viewer - The signed-in viewer
 * @returns {Promise<Boolean>} Whether a Chat action should be offered
 */
const resolveCanChat = async (user, viewer) => {
  if (!viewer || viewer.id === user.id) return false;

  if (viewer.role !== 'SELLER') return false;
  const viewerStore = await storeRepository.findByOwnerId(viewer.id);
  if (!viewerStore || viewerStore.deletedAt) return false;

  return profileRepository.hasOrderedFromStore(user.id, viewerStore.id);
};

/**
 * Public profile of an active account.
 * @param {String} userId - User ID
 * @param {Object|null} viewer - Signed-in viewer, or null
 * @returns {Promise<Object>} Public profile payload
 */
const getPublicProfile = async (userId, viewer) => {
  const user = await profileRepository.findPublicUser(userId);
  if (!user) throw new ApiError('Profile not found', 404);

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    profilePhoto: user.profilePhoto,
    avatarKey: user.avatarKey,
    municipality: user.municipality,
    province: user.province,
    memberSince: user.createdAt,
    identityVerified: user.identityVerification?.status === 'VERIFIED',
    isOwnProfile: Boolean(viewer && viewer.id === user.id),
    canChat: await resolveCanChat(user, viewer),
  };
};

module.exports = { getPublicProfile };
