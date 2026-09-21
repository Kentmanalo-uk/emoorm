const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const userRepository = require('../repositories/user.repository');
const storeRepository = require('../repositories/store.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const storeService = require('./store.service');
const notificationService = require('./notification.service');
const identityVerificationService = require('./identityVerification.service');
const googleService = require('./google.service');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateTokens, verifyRefreshToken, generateMfaToken, generateGoogleProfileToken, verifyGoogleProfileToken } = require('../utils/jwt');
const { sendPasswordResetEmail, sendPasswordChangedEmail } = require('../utils/email');
const { normalizeUsername, validateUsername, suggestFromName } = require('../utils/username');

/**
 * Pick a free public handle for a brand-new account.
 *
 * Every account needs one, and the person has not chosen anything yet, so
 * this derives a base from their display name (or the email local part) and
 * appends digits until it is free. They can change it later in Settings.
 *
 * A handle is not worth failing a signup over: if the column is somehow
 * contended past the attempt limit, the account is created without one and
 * the person is asked for a handle when they next edit their profile.
 *
 * @param {String} fullName - Display name
 * @param {String} email - Email address (only the local part is used)
 * @returns {Promise<String|null>} A free username, or null
 */
const allocateUsername = async (fullName, email) => {
  const base = suggestFromName(fullName, email);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    // The first attempt tries the bare base, then base2, base3, ...
    const suffix = attempt === 0 ? '' : String(attempt + 1);
    const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    if (validateUsername(candidate)) continue;
    // eslint-disable-next-line no-await-in-loop -- candidates must be tried in order
    const taken = await userRepository.findByUsername(candidate);
    if (!taken) return candidate;
  }
  return null;
};
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Authentication Service
 * Contains business logic for authentication operations
 */

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user and tokens
 */
const register = async (userData) => {
  const { email, password, fullName, contactNumber, municipalityId, barangay, address, province } = userData;

  // Check if email already exists
  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    throw new ApiError('Email already registered', 409);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await userRepository.createUser({
    email,
    password: hashedPassword,
    fullName,
    username: await allocateUsername(fullName, email),
    contactNumber: contactNumber || null,
    municipalityId,
    province: province || 'Oriental Mindoro',
    barangay: barangay || null,
    address: address || null,
    role: 'BUYER', // Default role
    isActive: true,
    isVerified: false,
  });

  // Generate tokens
  const tokens = generateTokens(user);

  // Remove password from response
  delete user.password;

  return {
    user,
    ...tokens,
  };
};

/**
 * Login user
 * @param {String} email - User email
 * @param {String} password - User password
 * @returns {Promise<Object>} User and tokens
 */
const login = async (email, password) => {
  // Find user with password
  const user = await userRepository.findByEmail(email, true);

  if (!user) {
    throw new ApiError('Invalid email or password', 401);
  }

  // Check if user is deleted
  if (user.deletedAt) {
    throw new ApiError('Account has been deleted', 403);
  }

  // Check if user is active
  if (!user.isActive) {
    throw new ApiError('Account is suspended. Please contact support.', 403);
  }

  // Compare password
  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError('Invalid email or password', 401);
  }

  // Admin accounts must clear a second factor before a full session is issued.
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'MUNICIPAL_ADMIN';
  if (isAdmin) {
    if (user.mfaEnabled) {
      return {
        requiresMfa: true,
        mfaToken: generateMfaToken(user, 'mfa-verify'),
        email: user.email,
      };
    }
    // Admin has no MFA yet — force enrolment before finishing login.
    return {
      requiresMfaSetup: true,
      mfaToken: generateMfaToken(user, 'mfa-setup'),
      email: user.email,
    };
  }

  // Generate tokens
  const tokens = generateTokens(user);

  // Remove password from response
  delete user.password;

  return {
    user,
    ...tokens,
  };
};

/**
 * Refresh access token
 * @param {String} refreshToken - Refresh token
 * @returns {Promise<Object>} New tokens
 */
const refreshToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user
    const user = await userRepository.findById(decoded.id);

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Check if user is active
    if (!user.isActive || user.deletedAt) {
      throw new ApiError('Account is not active', 403);
    }

    // Refuse to mint a new session from a refresh token that predates a
    // password change. Without this the tokenVersion check is decorative:
    // an access token dies in minutes, but the refresh token it came with
    // would go on issuing replacements for weeks.
    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new ApiError('Session expired', 401);
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    return tokens;
  } catch (error) {
    throw new ApiError('Invalid or expired refresh token', 401);
  }
};

/**
 * Get current user profile
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User profile
 */
const getProfile = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  return user;
};

/**
 * Update user profile
 * @param {String} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated user
 */
const updateProfile = async (userId, updateData) => {
  // Validate allowed fields
  const allowedFields = [
    'fullName',
    'contactNumber',
    'province',
    'barangay',
    'address',
    'profilePhoto',
  ];

  const filteredData = {};
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field];
    }
  }

  // Username is public and unique, so it is checked rather than just copied.
  let usernameUnchanged = false;
  if (updateData.username !== undefined) {
    const username = normalizeUsername(updateData.username);
    const current = await userRepository.findById(userId);
    if (!current) throw new ApiError('User not found', 404);

    // Re-submitting the handle they already have is not an error.
    if (username === (current.username || '')) {
      usernameUnchanged = true;
    } else {
      const problem = validateUsername(username);
      if (problem) throw new ApiError(problem, 400);

      const owner = await userRepository.findByUsername(username);
      if (owner && owner.id !== userId) throw new ApiError('That username is taken', 409);

      filteredData.username = username;
    }
  }

  if (Object.keys(filteredData).length === 0) {
    // Only an unchanged username was sent: nothing to write, nothing to fail.
    if (usernameUnchanged) return getProfile(userId);
    throw new ApiError('No valid fields to update', 400);
  }

  let user;
  try {
    user = await userRepository.updateUser(userId, filteredData);
  } catch (err) {
    // Lost a race with another account claiming the same handle.
    if (err.code === 'P2002' && String(err.meta?.target || '').includes('username')) {
      throw new ApiError('That username is taken', 409);
    }
    throw err;
  }

  return user;
};

/**
 * Change user password while signed in.
 *
 * Signs out every other device by bumping tokenVersion, then hands the
 * caller a replacement pair so the device that made the change stays in.
 *
 * @param {String} userId - User ID
 * @param {String} currentPassword - Current password
 * @param {String} newPassword - New password
 * @returns {Promise<{ accessToken: String, refreshToken: String }>}
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  // Get user with password
  const user = await userRepository.findByEmail(
    (await userRepository.findById(userId)).email,
    true
  );

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  // Verify current password
  const isPasswordValid = await comparePassword(currentPassword, user.password);
  if (!isPasswordValid) {
    throw new ApiError('Current password is incorrect', 401);
  }

  // Hash new password
  const hashedPassword = await hashPassword(newPassword);

  // One write: the new password, and the counter that retires every token
  // issued under the old one.
  await userRepository.updateUser(userId, {
    password: hashedPassword,
    tokenVersion: { increment: 1 },
  });

  // Re-read so the replacement tokens carry the bumped version. Minting
  // them from the stale `user` would hand back a pair that the very next
  // request rejects — signing the caller out of their own password change.
  const updated = await userRepository.findById(userId);
  const tokens = generateTokens(updated);

  await notifyPasswordChanged(updated || user);

  return tokens;
};

/** Terms revision an applicant consents to. Bump when the seller terms change. */
const SELLER_TERMS_VERSION = '2026-09-20';

const BUSINESS_TYPES = ['INDIVIDUAL', 'REGISTERED'];
const PAYOUT_METHODS = ['GCASH', 'MAYA', 'BANK', 'COD_ONLY'];
const FULFILLMENT_PREFERENCES = ['DELIVERY', 'PICKUP', 'BOTH'];

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Validate and normalise a seller application on the server. The browser form
 * checks the same rules for a friendlier experience, but this is the gate that
 * actually holds — a direct API call goes through here too.
 * @param {Object} data - Raw request body
 * @param {Object} context - { identityVerified }
 * @returns {Promise<Object>} Normalised application data
 */
const normalizeSellerApplication = async (data = {}, context = {}) => {
  const shopName = trimmed(data.shopName);
  if (!shopName) throw new ApiError('Shop name is required', 400);
  if (shopName.length < 3 || shopName.length > 60) {
    throw new ApiError('Shop name must be between 3 and 60 characters', 400);
  }

  const shopAddress = trimmed(data.shopAddress);
  if (!shopAddress) throw new ApiError('Shop address is required', 400);

  const shopMunicipalityId = trimmed(data.shopMunicipalityId) || trimmed(data.municipalityId);
  if (!shopMunicipalityId) throw new ApiError('Shop municipality is required', 400);
  const municipality = await municipalityRepository.findById(shopMunicipalityId);
  if (!municipality) throw new ApiError('Invalid shop municipality', 400);

  if (!data.acceptedTerms) {
    throw new ApiError('You must accept the Seller Terms of Service to apply', 400);
  }

  const shopDescription = trimmed(data.shopDescription);
  if (shopDescription.length > 1000) {
    throw new ApiError('Shop description must be 1000 characters or fewer', 400);
  }

  const shopTagline = trimmed(data.shopTagline);
  if (shopTagline.length > 80) {
    throw new ApiError('Tagline must be 80 characters or fewer', 400);
  }

  const shopCategories = Array.isArray(data.shopCategories)
    ? data.shopCategories.map(trimmed).filter(Boolean).slice(0, 5)
    : [];
  if (shopCategories.length === 0) {
    throw new ApiError('Select at least one category your shop sells in', 400);
  }

  const sellerBusinessType = trimmed(data.sellerBusinessType).toUpperCase() || 'INDIVIDUAL';
  if (!BUSINESS_TYPES.includes(sellerBusinessType)) {
    throw new ApiError('Invalid business type', 400);
  }

  const payoutMethod = trimmed(data.payoutMethod).toUpperCase();
  if (payoutMethod && !PAYOUT_METHODS.includes(payoutMethod)) {
    throw new ApiError('Invalid payout method', 400);
  }
  const payoutAccountNumber = trimmed(data.payoutAccountNumber);
  const payoutAccountName = trimmed(data.payoutAccountName);
  if (payoutMethod && payoutMethod !== 'COD_ONLY') {
    if (!payoutAccountName) throw new ApiError('Payout account name is required', 400);
    if (!payoutAccountNumber) throw new ApiError('Payout account number is required', 400);
  }

  const fulfillmentPreference = trimmed(data.fulfillmentPreference).toUpperCase() || 'DELIVERY';
  if (!FULFILLMENT_PREFERENCES.includes(fulfillmentPreference)) {
    throw new ApiError('Invalid fulfillment preference', 400);
  }

  // A buyer who already passed OCR identity verification does not upload an ID
  // a second time — that record is the proof, and it stores no photo.
  const idType = trimmed(data.idType);
  const idFrontUrl = trimmed(data.idFrontUrl);
  const idBackUrl = trimmed(data.idBackUrl);
  if (!context.identityVerified) {
    if (!idType) throw new ApiError('Please select the type of valid ID', 400);
    if (!idFrontUrl) throw new ApiError('A photo of the front of your ID is required', 400);
    if (!idBackUrl) throw new ApiError('A photo of the back of your ID is required', 400);
  }

  return {
    shopName,
    shopDescription: shopDescription || null,
    shopAddress,
    shopMunicipalityId,
    shopBarangay: trimmed(data.shopBarangay) || null,
    shopTagline: shopTagline || null,
    shopLogoUrl: trimmed(data.shopLogoUrl) || null,
    shopCategories,
    sellerBusinessType,
    sellerPermitNumber: trimmed(data.sellerPermitNumber) || null,
    sellerPermitUrl: trimmed(data.sellerPermitUrl) || null,
    sellerBirTin: trimmed(data.sellerBirTin) || null,
    payoutMethod: payoutMethod || null,
    payoutAccountName: payoutAccountName || null,
    payoutAccountNumber: payoutAccountNumber || null,
    fulfillmentPreference,
    idType: idType || null,
    idFrontUrl: idFrontUrl || null,
    idBackUrl: idBackUrl || null,
    termsVersion: SELLER_TERMS_VERSION,
  };
};

/**
 * Apply to become a seller. The applicant stays a BUYER — the SELLER role and
 * the store are only granted when an admin approves, so a rejected or pending
 * applicant never has Seller Center access.
 * @param {String} userId - User ID
 * @param {Object} data - Application form data
 * @returns {Promise<Object>} Updated user
 */
const applyForSeller = async (userId, data = {}) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (user.role === 'SELLER') {
    throw new ApiError('You are already a seller', 400);
  }

  if (user.sellerApplicationStatus === 'PENDING') {
    throw new ApiError('You already have a pending seller application', 400);
  }

  if (!user.contactNumber) {
    throw new ApiError('Add a contact number to your profile before applying', 400);
  }

  const identityVerified = await identityVerificationService.isVerified(userId);
  const application = await normalizeSellerApplication(data, { identityVerified });

  // Two shops sharing a display name confuses buyers even though their URLs
  // differ, so the name has to be free before the application is accepted.
  if (await storeRepository.nameExists(application.shopName, userId)) {
    throw new ApiError('That shop name is already taken. Please choose another.', 409);
  }

  const existing = await userRepository.findSellerApplication(userId);
  const updatedUser = await userRepository.applyForSeller(
    userId,
    application,
    existing?.sellerApplicationHistory
  );

  // Route the review to the admin of the municipality the SHOP is in, which
  // is not necessarily the municipality on the applicant's own profile.
  await notificationService.notifyMunicipalAdmins(application.shopMunicipalityId, {
    type: 'SELLER_APPLICATION_SUBMITTED',
    title: 'New seller application',
    message: `${updatedUser.fullName} applied to sell as "${application.shopName}".`,
    relatedId: userId,
  });

  return updatedUser;
};

/**
 * Current application status, the reason if it was rejected, and any saved
 * draft, so the applicant can pick up where they left off.
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Application state
 */
const getSellerApplication = async (userId) => {
  const record = await userRepository.findSellerApplication(userId);
  if (!record) {
    throw new ApiError('User not found', 404);
  }

  return {
    status: record.sellerApplicationStatus || null,
    submittedAt: record.sellerApplicationDate,
    reviewedAt: record.sellerReviewedAt,
    rejectionReason: record.sellerRejectionReason,
    termsVersion: SELLER_TERMS_VERSION,
    acceptedTermsVersion: record.sellerTermsVersion,
    history: Array.isArray(record.sellerApplicationHistory) ? record.sellerApplicationHistory : [],
    draft: record.sellerApplicationDraft || null,
    identityVerified: await identityVerificationService.isVerified(userId),
  };
};

/** Fields the draft is allowed to carry — anything else is dropped. */
const DRAFT_FIELDS = [
  'shopName', 'shopDescription', 'shopAddress', 'shopTagline', 'shopLogoUrl',
  'shopCategories', 'province', 'provinceCode', 'municipalityId', 'municipalityName',
  'municipalityCode', 'barangay', 'barangayCode', 'street', 'sellerBusinessType',
  'sellerPermitNumber', 'sellerPermitUrl', 'sellerBirTin', 'payoutMethod',
  'payoutAccountName', 'payoutAccountNumber', 'fulfillmentPreference',
  'idType', 'idFrontUrl', 'idBackUrl',
];

/**
 * Save the in-progress application form. Nothing here is validated — it is a
 * draft — but it is filtered and size-capped so it cannot be used as storage.
 * @param {String} userId - User ID
 * @param {Object|null} draft - Form contents, or null to clear
 * @returns {Promise<Object>} Saved draft
 */
const saveSellerApplicationDraft = async (userId, draft) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new ApiError('User not found', 404);
  if (user.role === 'SELLER') {
    throw new ApiError('You are already a seller', 400);
  }

  if (!draft) {
    await userRepository.saveSellerApplicationDraft(userId, null);
    return { draft: null };
  }

  const clean = {};
  for (const field of DRAFT_FIELDS) {
    const value = draft[field];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) clean[field] = value.slice(0, 5).map((v) => String(v).slice(0, 200));
    else clean[field] = String(value).slice(0, 1200);
  }

  const saved = await userRepository.saveSellerApplicationDraft(userId, clean);
  return { draft: saved.sellerApplicationDraft };
};

/**
 * A municipal admin manages the users of their own municipality, plus anyone
 * whose seller application is for a shop located there — an applicant may live
 * in one town and open a shop in another, and the town the shop is in is the
 * one that reviews it.
 * @param {Object} actor - The acting admin (req.user)
 * @param {Object} user - The target user
 * @returns {Promise<Boolean>} True if the actor may manage this user
 */
const canAdminManageUser = async (actor, user) => {
  if (actor?.role !== 'MUNICIPAL_ADMIN') return true;
  if (user.municipalityId === actor.municipalityId) return true;
  if (!user.sellerApplicationStatus) return false;

  const application = await userRepository.findSellerApplication(user.id);
  return application?.shopMunicipalityId === actor.municipalityId;
};

/**
 * Get user by ID (admin use)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User
 */
const getUserById = async (userId, actor) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (!(await canAdminManageUser(actor, user))) {
    throw new ApiError('You can only access users in your assigned municipality', 403);
  }

  if (actor?.role === 'MUNICIPAL_ADMIN' && !['BUYER', 'SELLER'].includes(user.role)) {
    throw new ApiError('Municipal admins can only access buyer and seller accounts', 403);
  }

  return user;
};

const KYC_FIELD_COLUMNS = {
  idFront: 'idFrontUrl',
  idBack: 'idBackUrl',
  selfie: 'selfieUrl',
  permit: 'sellerPermitUrl',
};

/**
 * Resolve the on-disk path of a user's KYC document, enforcing that only the
 * document owner or an authorized admin (super admin, or municipal admin of
 * the same municipality) can retrieve it.
 * @param {String} targetUserId - Owner of the KYC document
 * @param {String} field - One of 'idFront' | 'idBack' | 'selfie'
 * @param {Object} requester - req.user (authenticated caller)
 * @returns {Promise<{absolutePath: String}>}
 */
const getKycPhoto = async (targetUserId, field, requester) => {
  const column = KYC_FIELD_COLUMNS[field];
  if (!column) {
    throw new ApiError('Invalid document field', 400);
  }

  const record = await userRepository.findKycRecordById(targetUserId);
  if (!record) {
    throw new ApiError('User not found', 404);
  }

  const isSelf = requester.id === record.id;
  const isSuperAdmin = requester.role === 'SUPER_ADMIN';
  const isScopedMunicipalAdmin =
    requester.role === 'MUNICIPAL_ADMIN' && requester.municipalityId && requester.municipalityId === record.municipalityId;

  if (!isSelf && !isSuperAdmin && !isScopedMunicipalAdmin) {
    throw new ApiError('You are not authorized to view this document', 403);
  }

  const storedValue = record[column];
  if (!storedValue) {
    throw new ApiError('Document not found', 404);
  }

  // Strip any directory components so the lookup can never escape the
  // expected directory (defense against path traversal).
  const safeFilename = path.basename(storedValue);
  const isLegacyPublicPath = storedValue.startsWith('/uploads/');
  const baseDir = isLegacyPublicPath ? config.upload.uploadDir : config.upload.privateUploadDir;
  const absolutePath = path.resolve(baseDir, safeFilename);

  if (!fs.existsSync(absolutePath)) {
    throw new ApiError('Document not found', 404);
  }

  return { absolutePath };
};

/**
 * Get all users with filters (admin use)
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Users and pagination
 */
const getUsers = async (options) => {
  return userRepository.findAll(options);
};

/**
 * Approve seller application (admin use)
 * @param {String} userId - User ID
 * @param {Object} [actor] - The acting admin for municipality scope enforcement
 * @returns {Promise<Object>} Updated user
 */
const approveSeller = async (userId, actor) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (!(await canAdminManageUser(actor, user))) {
    throw new ApiError('You can only manage sellers in your assigned municipality', 403);
  }

  if (user.sellerApplicationStatus !== 'PENDING') {
    throw new ApiError('No pending seller application found', 400);
  }

  const application = await userRepository.findSellerApplication(userId);

  const updatedUser = await userRepository.approveSeller(userId, {
    reviewedById: actor?.id || null,
    reviewerName: actor?.fullName || null,
    history: application?.sellerApplicationHistory,
  });

  // The store is created here, at approval — not at submission — so a pending
  // or rejected applicant never owns one. An existing store is reactivated.
  let store = await storeRepository.findByOwnerId(userId);
  if (store) {
    await storeRepository.updateStore(store.id, { isActive: true });
  } else if (application?.shopName) {
    const slug = await storeService.generateSlug(application.shopName);
    store = await storeRepository.createStore({
      name: application.shopName,
      slug,
      description: application.shopDescription || null,
      logo: application.shopLogoUrl || null,
      coverImage: null,
      businessHours: null,
      ownerId: userId,
      // The municipality the applicant picked for the shop, which may differ
      // from the one on their own profile.
      municipalityId: application.shopMunicipalityId || user.municipalityId,
      pickupAddress: application.shopAddress || null,
      fulfillmentMode: FULFILLMENT_PREFERENCES.includes(application.fulfillmentPreference)
        ? application.fulfillmentPreference
        : 'DELIVERY',
      isActive: true,
      isSuspended: false,
    });
  }

  // Notify the newly approved seller (non-blocking on failure).
  try {
    await notificationService.notifySellerApproved(userId, store?.name || user.shopName);
  } catch (err) {
    console.error('[approveSeller] notification failed:', err.message);
  }

  return updatedUser;
};

/**
 * Reject seller application (admin use)
 * @param {String} userId - User ID
 * @param {Object} [actor] - The acting admin for municipality scope enforcement
 * @param {String} [reason] - Rejection reason (passed to notification)
 * @returns {Promise<Object>} Updated user
 */
const rejectSeller = async (userId, actor, reason) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (!(await canAdminManageUser(actor, user))) {
    throw new ApiError('You can only manage sellers in your assigned municipality', 403);
  }

  if (user.sellerApplicationStatus !== 'PENDING') {
    throw new ApiError('No pending seller application found', 400);
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw new ApiError('A reason is required so the applicant knows what to fix', 400);
  }

  const application = await userRepository.findSellerApplication(userId);

  // The reason is stored (not only sent as a notification) and the account
  // drops back to BUYER so the applicant can correct things and re-apply.
  const updatedUser = await userRepository.rejectSeller(userId, {
    reason: trimmedReason,
    reviewedById: actor?.id || null,
    reviewerName: actor?.fullName || null,
    history: application?.sellerApplicationHistory,
  });

  // Legacy applicants promoted under the old flow may already own a store —
  // hide it so a rejected shop cannot stay reachable.
  const store = await storeRepository.findByOwnerId(userId);
  if (store?.isActive) {
    await storeRepository.updateStore(store.id, { isActive: false });
  }

  try {
    await notificationService.notifySellerRejected(userId, trimmedReason);
  } catch (err) {
    console.error('[rejectSeller] notification failed:', err.message);
  }

  return updatedUser;
};

/**
 * Suspend user account (admin use)
 * @param {String} userId - User ID
 * @param {Object} [actor] - Acting admin for scope enforcement
 * @returns {Promise<Object>} Updated user
 */
const suspendUser = async (userId, actor) => {
  const target = await userRepository.findById(userId);
  if (!target) throw new ApiError('User not found', 404);

  if (actor?.role === 'MUNICIPAL_ADMIN' && target.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only manage users in your assigned municipality', 403);
  }
  if (target.role === 'SUPER_ADMIN') {
    throw new ApiError('Super admins cannot be suspended', 403);
  }
  if (actor?.role === 'MUNICIPAL_ADMIN' && target.role === 'MUNICIPAL_ADMIN') {
    throw new ApiError('Only a super admin can suspend a municipal admin', 403);
  }

  const user = await userRepository.updateUser(userId, {
    isActive: false,
  });

  return user;
};

/**
 * Activate user account (admin use)
 * @param {String} userId - User ID
 * @param {Object} [actor] - Acting admin for scope enforcement
 * @returns {Promise<Object>} Updated user
 */
const activateUser = async (userId, actor) => {
  const target = await userRepository.findById(userId);
  if (!target) throw new ApiError('User not found', 404);

  if (actor?.role === 'MUNICIPAL_ADMIN' && target.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only manage users in your assigned municipality', 403);
  }

  const user = await userRepository.updateUser(userId, {
    isActive: true,
  });

  return user;
};

/**
 * Delete user account (admin use - soft delete)
 * @param {String} userId - User ID
 * @returns {Promise<void>}
 */
const deleteUser = async (userId) => {
  await userRepository.softDeleteUser(userId);
};

/**
 * Initiate password reset — generates a token valid for 1 hour and emails
 * the user a reset link. Always returns the same shape regardless of whether
 * the email exists to prevent user enumeration.
 * @param {String} email
 * @returns {Promise<{ delivered: boolean, transport: string|null, resetToken: string|null }>}
 */
const forgotPassword = async (email) => {
  const user = await userRepository.findByEmail(email);

  // Silently succeed for unknown/deleted accounts to avoid leaking membership.
  if (!user || user.deletedAt) {
    return { delivered: false, transport: null, resetToken: null };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await userRepository.setPasswordResetToken(user.id, hashedToken, expiry);

  const resetUrl = `${config.frontendUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

  let delivered = false;
  let transport = null;
  try {
    const info = await sendPasswordResetEmail({
      user: { email: user.email, fullName: user.fullName },
      token: resetToken,
      resetUrl,
    });
    delivered = info?.delivered || false;
    transport = info?.transport || null;
  } catch (err) {
    // Do not surface the failure to the caller — respond generically.
    console.error('[forgotPassword] Failed to send email:', err.message);
  }

  // The plaintext token is deliberately NOT returned. Only its SHA-256 is
  // stored, and the token itself exists solely inside the email that was just
  // sent. Handing it back to the caller made the whole reset flow bypassable
  // by anyone who could name a user's email address.
  //
  // resetUrl is returned for the development console log only, and the
  // controller never puts it in an HTTP response.
  return {
    delivered,
    transport,
    resetUrl,
  };
};

/**
 * Tell the account owner their password moved. If they didn't do it, this
 * email is the only warning they get, so it goes out on both password
 * paths — but a mail failure must never roll back a completed change, so
 * it is logged and swallowed.
 */
const notifyPasswordChanged = async (user) => {
  if (!user?.email) return;
  try {
    await sendPasswordChangedEmail({ user });
  } catch (err) {
    console.error('[password] Failed to send change notification:', err.message);
  }
};

/**
 * Reset password using the token issued by forgotPassword
 * @param {String} token - Plain reset token from email link
 * @param {String} newPassword
 */
const resetPassword = async (token, newPassword) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await userRepository.findByResetToken(hashedToken);

  if (!user) {
    throw new ApiError('Invalid or expired password reset token', 400);
  }

  const hashedPassword = await hashPassword(newPassword);

  // Bumping tokenVersion here is the point of the whole recovery flow: if
  // the account was taken over, the thief is holding a live session, and
  // changing the password alone would not have touched it.
  await userRepository.updateUser(user.id, {
    password: hashedPassword,
    tokenVersion: { increment: 1 },
  });
  await userRepository.clearPasswordResetToken(user.id);

  await notifyPasswordChanged(user);
};

/**
 * Continue with Google — verifies the Google credential (either an authorization
 * code from the popup flow or an ID token), resolves or creates the matching
 * E-MOORM user, links the Google account, and issues the existing JWTs.
 */
const loginWithGoogle = async ({ code, idToken }) => {
  const profile = code
    ? await googleService.exchangeCodeForProfile(code)
    : await googleService.verifyIdToken(idToken);

  // 1) Existing Google-linked account.
  let user = await userRepository.findByGoogleId(profile.googleId);

  // 2) Fall back to email match, then link Google to that account.
  if (!user) {
    const byEmail = await userRepository.findByEmail(profile.email, true);
    if (byEmail) {
      if (byEmail.deletedAt) {
        throw new ApiError('Account has been deleted', 403);
      }
      if (!byEmail.isActive) {
        throw new ApiError('Account is suspended. Please contact support.', 403);
      }
      await userRepository.updateUser(byEmail.id, {
        googleId: profile.googleId,
        isVerified: true,
        profilePhoto: byEmail.profilePhoto || profile.profilePhoto || null,
      });
      user = await userRepository.findByGoogleId(profile.googleId);
    }
  }

  // 3) Brand-new Google user — don't create the account yet. Hand back a
  // short-lived token so the client can collect name/address/contact/password
  // via the "complete your profile" step before we persist anything.
  if (!user) {
    return {
      requiresProfile: true,
      googleToken: generateGoogleProfileToken(profile),
      email: profile.email,
      fullName: profile.fullName,
      profilePhoto: profile.profilePhoto,
    };
  }

  if (user.deletedAt) {
    throw new ApiError('Account has been deleted', 403);
  }
  if (!user.isActive) {
    throw new ApiError('Account is suspended. Please contact support.', 403);
  }

  // Admin accounts still need MFA — mirror the password login response shape.
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'MUNICIPAL_ADMIN';
  if (isAdmin) {
    if (user.mfaEnabled) {
      return {
        requiresMfa: true,
        mfaToken: generateMfaToken(user, 'mfa-verify'),
        email: user.email,
      };
    }
    return {
      requiresMfaSetup: true,
      mfaToken: generateMfaToken(user, 'mfa-setup'),
      email: user.email,
    };
  }

  const tokens = generateTokens(user);
  return { user, ...tokens };
};

/**
 * Complete a first-time Google sign-in — verifies the short-lived profile
 * token, validates the user-supplied name/address/contact/password, then
 * creates the E-MOORM account linked to the Google ID and logs them in.
 */
const completeGoogleSignup = async (googleToken, data) => {
  let decoded;
  try {
    decoded = verifyGoogleProfileToken(googleToken);
  } catch (err) {
    throw new ApiError(err.message || 'Invalid Google sign-in session', 401);
  }

  const { googleId, email, profilePhoto } = decoded;

  // Guard against a duplicate account being created while the profile form
  // was open (e.g. registered separately, or completed in another tab).
  const existingByGoogle = await userRepository.findByGoogleId(googleId);
  if (existingByGoogle) {
    throw new ApiError('This Google account is already linked to an E-MOORM account', 409);
  }
  const existingByEmail = await userRepository.findByEmail(email);
  if (existingByEmail) {
    throw new ApiError('Email already registered', 409);
  }

  const { fullName, contactNumber, municipalityId, province, barangay, address, password } = data;

  if (!fullName || !String(fullName).trim()) {
    throw new ApiError('Full name is required', 400);
  }
  if (!municipalityId) {
    throw new ApiError('Municipality is required', 400);
  }
  if (!password || String(password).length < 8) {
    throw new ApiError('Password must be at least 8 characters', 400);
  }

  const hashedPassword = await hashPassword(password);

  await userRepository.createUser({
    email,
    password: hashedPassword,
    fullName: String(fullName).trim(),
    username: await allocateUsername(String(fullName).trim(), email),
    contactNumber: contactNumber || null,
    profilePhoto: profilePhoto || null,
    googleId,
    municipalityId,
    province: province || 'Oriental Mindoro',
    barangay: barangay || null,
    address: address || null,
    role: 'BUYER',
    isActive: true,
    isVerified: true,
  });

  const user = await userRepository.findByGoogleId(googleId);
  if (!user) {
    throw new ApiError('Unable to complete Google sign-in', 500);
  }

  const tokens = generateTokens(user);
  return { user, ...tokens };
};

module.exports = {
  register,
  login,
  loginWithGoogle,
  completeGoogleSignup,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  applyForSeller,
  getSellerApplication,
  saveSellerApplicationDraft,
  SELLER_TERMS_VERSION,
  getUserById,
  getUsers,
  approveSeller,
  rejectSeller,
  suspendUser,
  activateUser,
  deleteUser,
  setUserRole,
  getKycPhoto,
};

async function setUserRole(userId, role, opts = {}) {
  const { ApiError } = require('../middleware/errorHandler');
  const user = await userRepository.findById(userId);
  if (!user) throw new ApiError('User not found', 404);

  const actor = opts.actor;
  // Only SUPER_ADMIN can promote to admin roles
  if ((role === 'MUNICIPAL_ADMIN' || role === 'SUPER_ADMIN') && actor?.role !== 'SUPER_ADMIN') {
    throw new ApiError('Only a super admin can assign admin roles', 403);
  }

  // Promoting to MUNICIPAL_ADMIN requires a municipalityId
  const update = { role };
  if (role === 'MUNICIPAL_ADMIN') {
    const municipalityId = opts.municipalityId || user.municipalityId;
    if (!municipalityId) {
      throw new ApiError('municipalityId is required when assigning MUNICIPAL_ADMIN', 400);
    }
    update.municipalityId = municipalityId;
  }

  return userRepository.updateUser(userId, update);
}
