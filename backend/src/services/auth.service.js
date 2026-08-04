const crypto = require('crypto');
const userRepository = require('../repositories/user.repository');
const storeRepository = require('../repositories/store.repository');
const storeService = require('./store.service');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt');
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
 * @returns {Promise<Object>} Updated user
 */
const approveSeller = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
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

  // TODO: Send notification to user

  return updatedUser;
};

/**
 * Reject seller application (admin use)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const rejectSeller = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (user.sellerApplicationStatus !== 'PENDING') {
    throw new ApiError('No pending seller application found', 400);
  }

  const updatedUser = await userRepository.rejectSeller(userId);

  // TODO: Send notification to user

  return updatedUser;
};

/**
 * Suspend user account (admin use)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const suspendUser = async (userId) => {
  const user = await userRepository.updateUser(userId, {
    isActive: false,
  });

  return user;
};

/**
 * Activate user account (admin use)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const activateUser = async (userId) => {
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
 * Initiate password reset — generates a token valid for 1 hour
 * @param {String} email
 * @returns {Promise<String>} resetToken (returned so dev/test can use it without email)
 */
const forgotPassword = async (email) => {
  const user = await userRepository.findByEmail(email);

  // Always respond the same way to prevent email enumeration
  if (!user || user.deletedAt) return null;

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await userRepository.setPasswordResetToken(user.id, hashedToken, expiry);

  return resetToken;
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
};

async function setUserRole(userId, role) {
  const user = await userRepository.findById(userId);
  if (!user) throw new (require('../middleware/errorHandler').ApiError)('User not found', 404);
  return userRepository.updateUser(userId, { role });
}
