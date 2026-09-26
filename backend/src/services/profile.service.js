const profileRepository = require('../repositories/profile.repository');
const storeRepository = require('../repositories/store.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Public profile service.
 *
 * A buyer-only account has a deliberately minimal public face: who they are,
 * roughly where they are, how long they have been around, whether their
 * identity has been checked, and a way to start a chat when one is actually
 * possible. Nothing else — no orders, no reviews, no follows, no stats.
 *
 * A seller's public face is their shop, so the payload only says which store
 * is theirs and the client sends the viewer there.
 */

/** The store, but only while it is genuinely open to the public. */
const activeStore = (store) => (
  store && store.isActive && !store.isSuspended && store.isApproved !== false && !store.deletedAt && !store.deletionRequestedAt
    ? { id: store.id, name: store.name, slug: store.slug, logo: store.logo }
    : null
);

/**
 * Can this viewer start a conversation with this profile?
 *
 * Conversations are buyer <-> store, so a chat only exists when one side is
 * a shop: either the profile is a shop the viewer can message, or the viewer
 * owns a shop this person has ordered from. Two buyers can never chat.
 *
 * @param {Object} user - The profile being viewed
 * @param {Object|null} store - The profile's public store, if any
 * @param {Object|null} viewer - The signed-in viewer
 * @returns {Promise<Boolean>} Whether a Chat action should be offered
 */
const resolveCanChat = async (user, store, viewer) => {
  if (!viewer || viewer.id === user.id) return false;

  // Viewing a shop: anyone signed in who is not its owner may message it.
  if (store) return true;

  // Viewing a buyer: only their seller, and only once they have ordered.
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

  const store = activeStore(user.store);

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    profilePhoto: user.profilePhoto,
    municipality: user.municipality,
    province: user.province,
    memberSince: user.createdAt,
    identityVerified: user.identityVerification?.status === 'VERIFIED',
    isOwnProfile: Boolean(viewer && viewer.id === user.id),
    isSeller: Boolean(store),
    store,
    canChat: await resolveCanChat(user, store, viewer),
  };
};

module.exports = { getPublicProfile };
