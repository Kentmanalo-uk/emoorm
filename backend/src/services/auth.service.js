const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const userRepository = require('../repositories/user.repository');
const storeRepository = require('../repositories/store.repository');
const storeService = require('./store.service');
const notificationService = require('./notification.service');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateTokens, verifyRefreshToken, generateMfaToken } = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../utils/email');
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
  const { email, password, fullName, contactNumber, municipalityId, barangay, address } = userData;

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
    contactNumber: contactNumber || null,
    municipalityId,
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

  if (Object.keys(filteredData).length === 0) {
    throw new ApiError('No valid fields to update', 400);
  }

  const user = await userRepository.updateUser(userId, filteredData);

  return user;
};

/**
 * Change user password
 * @param {String} userId - User ID
 * @param {String} currentPassword - Current password
 * @param {String} newPassword - New password
 * @returns {Promise<void>}
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

  // Update password
  await userRepository.updateUser(userId, {
    password: hashedPassword,
  });
};

/**
 * Apply to become a seller
 * @param {String} userId - User ID
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

  // Save application data + mark as pending
  await userRepository.applyForSeller(userId, data);

  // Immediately promote to SELLER so they can access the dashboard.
  // The store below stays inactive until an admin approves it, so the
  // profile and any products they add remain hidden from the public.
  const updatedUser = await userRepository.promoteToSeller(userId);

  // Create an inactive store from the application data so the seller can
  // immediately start adding products (kept hidden until admin activates).
  const existingStore = await storeRepository.findByOwnerId(userId);
  if (!existingStore && data.shopName) {
    const slug = await storeService.generateSlug(data.shopName);
    await storeRepository.createStore({
      name: data.shopName,
      slug,
      description: data.shopDescription || null,
      logo: null,
      coverImage: null,
      businessHours: null,
      ownerId: userId,
      municipalityId: updatedUser.municipalityId,
      isActive: false,
      isSuspended: false,
    });
  }

  return updatedUser;
};

/**
 * Get user by ID (admin use)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User
 */
const getUserById = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  return user;
};

const KYC_FIELD_COLUMNS = {
  idFront: 'idFrontUrl',
  idBack: 'idBackUrl',
  selfie: 'selfieUrl',
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

  if (actor?.role === 'MUNICIPAL_ADMIN' && user.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only manage sellers in your assigned municipality', 403);
  }

  if (user.sellerApplicationStatus !== 'PENDING') {
    throw new ApiError('No pending seller application found', 400);
  }

  const updatedUser = await userRepository.approveSeller(userId);

  // Activate the seller's store so it and its approved products become public.
  const store = await storeRepository.findByOwnerId(userId);
  if (store) {
    await storeRepository.updateStore(store.id, { isActive: true });
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

  if (actor?.role === 'MUNICIPAL_ADMIN' && user.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only manage sellers in your assigned municipality', 403);
  }

  if (user.sellerApplicationStatus !== 'PENDING') {
    throw new ApiError('No pending seller application found', 400);
  }

  const updatedUser = await userRepository.rejectSeller(userId);

  try {
    await notificationService.notifySellerRejected(userId, reason);
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

  return {
    delivered,
    transport,
    // Exposed by the controller only when NODE_ENV !== 'production'.
    resetToken,
    resetUrl,
  };
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

  await userRepository.updateUser(user.id, { password: hashedPassword });
  await userRepository.clearPasswordResetToken(user.id);
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  applyForSeller,
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
