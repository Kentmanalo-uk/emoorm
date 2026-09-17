const authService = require('../services/auth.service');
const auditLog = require('../services/auditLog.service');
const identityVerificationService = require('../services/identityVerification.service');
const {
  successResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse,
} = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Authentication Controller
 * Handles HTTP requests and responses for authentication
 */

/**
 * Register a new user
 * @route POST /api/auth/register
 * @access Public
 */
const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);

  createdResponse(res, result, 'Registration successful');
});

/**
 * Login user
 * @route POST /api/auth/login
 * @access Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await authService.login(email, password);

  successResponse(res, result, 'Login successful');
});

/**
 * Refresh access token
 * @route POST /api/auth/refresh-token
 * @access Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const tokens = await authService.refreshToken(refreshToken);

  successResponse(res, tokens, 'Token refreshed successfully');
});

/**
 * Logout user
 * @route POST /api/auth/logout
 * @access Private
 */
const logout = asyncHandler(async (req, res) => {
  // In a stateless JWT setup, logout is handled client-side
  // by removing the token from storage
  // For enhanced security, implement token blacklisting here

  successResponse(res, null, 'Logout successful');
});

/**
 * Get current user profile
 * @route GET /api/auth/profile
 * @access Private
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);

  successResponse(res, user, 'Profile retrieved successfully');
});

/**
 * Update current user profile
 * @route PUT /api/auth/profile
 * @access Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const before = await authService.getProfile(req.user.id);
  const user = await authService.updateProfile(req.user.id, req.body);

  // Identity verification was matched against these fields; changing them revokes it.
  const changedFields = ['fullName', 'barangay', 'address', 'province'].filter(
    (field) => (before?.[field] || '') !== (user?.[field] || '')
  );
  if (changedFields.length > 0) {
    await identityVerificationService.invalidateIfVerified(req.user, changedFields, req);
  }

  successResponse(res, user, 'Profile updated successfully');
});

/**
 * Change password
 * @route POST /api/auth/change-password
 * @access Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(req.user.id, currentPassword, newPassword);

  successResponse(res, null, 'Password changed successfully');
});

/**
 * Apply to become a seller
 * @route POST /api/auth/apply-seller
 * @access Private (BUYER only)
 */
const applyForSeller = asyncHandler(async (req, res) => {
  const { shopName, shopDescription, shopAddress, idType, idFrontUrl, idBackUrl, selfieUrl } = req.body;

  const user = await authService.applyForSeller(req.user.id, {
    shopName,
    shopDescription,
    shopAddress,
    idType,
    idFrontUrl,
    idBackUrl,
    selfieUrl,
  });

  successResponse(
    res,
    user,
    'Seller application submitted successfully. Awaiting admin approval.'
  );
});

/**
 * Get user by ID (Admin)
 * @route GET /api/auth/users/:id
 * @access Private (ADMIN only)
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.params.id, req.user);

  successResponse(res, user, 'User retrieved successfully');
});

/**
 * Stream a user's KYC document (ID front/back or selfie).
 * Only the document owner or an authorized admin may view it. Files live in
 * a private, non-statically-served directory — this is the only way to read them.
 * @route GET /api/auth/users/:id/kyc-photo/:field
 * @access Private (self or admin)
 */
const getKycPhoto = asyncHandler(async (req, res) => {
  const { absolutePath } = await authService.getKycPhoto(req.params.id, req.params.field, req.user);

  res.sendFile(absolutePath);
});

/**
 * Get all users (Admin)
 * @route GET /api/auth/users
 * @access Private (ADMIN only)
 */
const getUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    role,
    municipalityId,
    isActive,
    search,
    sellerApplicationStatus,
  } = req.query;

  // Municipal admins can only see users in their assigned municipality.
  const scopedMunicipalityId =
    req.user?.role === 'MUNICIPAL_ADMIN'
      ? req.user.municipalityId
      : municipalityId;

  if (req.user?.role === 'MUNICIPAL_ADMIN' && role && !['BUYER', 'SELLER'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Municipal admins can only manage buyers and sellers.' });
  }

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    role: req.user?.role === 'MUNICIPAL_ADMIN' ? (role || ['BUYER', 'SELLER']) : role,
    municipalityId: scopedMunicipalityId,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    search,
    sellerApplicationStatus,
  };

  const result = await authService.getUsers(options);

  paginatedResponse(
    res,
    result.users,
    result.total,
    result.page,
    result.pageSize,
    'Users retrieved successfully'
  );
});

/**
 * Approve seller application (Admin)
 * @route POST /api/auth/users/:id/approve-seller
 * @access Private (ADMIN only)
 */
const approveSeller = asyncHandler(async (req, res) => {
  const user = await authService.approveSeller(req.params.id, req.user);

  await auditLog.record({
    actor: req.user,
    action: 'APPROVE_SELLER',
    entity: 'User',
    entityId: req.params.id,
    req,
  });

  successResponse(res, user, 'Seller application approved successfully');
});

/**
 * Reject seller application (Admin)
 * @route POST /api/auth/users/:id/reject-seller
 * @access Private (ADMIN only)
 */
const rejectSeller = asyncHandler(async (req, res) => {
  const { reason } = req.body || {};
  const user = await authService.rejectSeller(req.params.id, req.user, reason);

  await auditLog.record({
    actor: req.user,
    action: 'REJECT_SELLER',
    entity: 'User',
    entityId: req.params.id,
    details: reason ? { reason } : null,
    req,
  });

  successResponse(res, user, 'Seller application rejected');
});

/**
 * Suspend user account (Admin)
 * @route POST /api/auth/users/:id/suspend
 * @access Private (ADMIN only)
 */
const suspendUser = asyncHandler(async (req, res) => {
  const user = await authService.suspendUser(req.params.id, req.user);

  await auditLog.record({
    actor: req.user,
    action: 'SUSPEND_USER',
    entity: 'User',
    entityId: req.params.id,
    req,
  });

  successResponse(res, user, 'User suspended successfully');
});

/**
 * Activate user account (Admin)
 * @route POST /api/auth/users/:id/activate
 * @access Private (ADMIN only)
 */
const activateUser = asyncHandler(async (req, res) => {
  const user = await authService.activateUser(req.params.id, req.user);

  await auditLog.record({
    actor: req.user,
    action: 'ACTIVATE_USER',
    entity: 'User',
    entityId: req.params.id,
    req,
  });

  successResponse(res, user, 'User activated successfully');
});

/**
 * Delete user account (Admin)
 * @route DELETE /api/auth/users/:id
 * @access Private (ADMIN only)
 */
const deleteUser = asyncHandler(async (req, res) => {
  await authService.deleteUser(req.params.id);

  noContentResponse(res);
});

/**
 * @route POST /api/auth/forgot-password
 * @access Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);

  const isDev = process.env.NODE_ENV !== 'production';
  const payload = {};
  if (isDev && result?.resetToken) {
    // Dev/test only — lets QA and this smoke-test flow skip a real inbox.
    payload.resetToken = result.resetToken;
    if (result.resetUrl) payload.resetUrl = result.resetUrl;
    if (result.transport) payload.transport = result.transport;
    payload.delivered = result.delivered;
  }

  successResponse(
    res,
    payload,
    'If that email is registered, a reset link has been sent.',
  );
});

/**
 * @route POST /api/auth/reset-password
 * @access Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  await authService.resetPassword(token, password);

  successResponse(res, null, 'Password has been reset successfully.');
});

const setUserRole = asyncHandler(async (req, res) => {
  const { role, municipalityId } = req.body;
  const ALLOWED = ['BUYER', 'SELLER', 'MUNICIPAL_ADMIN', 'SUPER_ADMIN'];
  if (!ALLOWED.includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }

  const user = await authService.setUserRole(req.params.id, role, {
    actor: req.user,
    municipalityId,
  });

  await auditLog.record({
    actor: req.user,
    action: 'SET_USER_ROLE',
    entity: 'User',
    entityId: req.params.id,
    details: { role, municipalityId },
    req,
  });

  successResponse(res, user, `User role updated to ${role}`);
});

/**
 * Continue with Google — verifies the Google ID token and issues E-MOORM JWTs.
 * @route POST /api/auth/google
 * @access Public
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { code, idToken } = req.body || {};
  if (!code && !idToken) {
    return res.status(400).json({ success: false, message: 'Google authorization code or ID token is required' });
  }
  const result = await authService.loginWithGoogle({ code, idToken });
  successResponse(res, result, 'Google sign-in successful');
});

/**
 * Complete a first-time Google sign-in with name/address/contact/password.
 * @route POST /api/auth/google/complete
 * @access Public
 */
const completeGoogleSignup = asyncHandler(async (req, res) => {
  const { googleToken, ...profileData } = req.body || {};
  if (!googleToken) {
    return res.status(400).json({ success: false, message: 'Google sign-in session is required' });
  }
  const result = await authService.completeGoogleSignup(googleToken, profileData);
  createdResponse(res, result, 'Account created successfully');
});

module.exports = {
  register,
  login,
  googleLogin,
  completeGoogleSignup,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  applyForSeller,
  getUserById,
  getKycPhoto,
  getUsers,
  approveSeller,
  rejectSeller,
  suspendUser,
  activateUser,
  deleteUser,
  setUserRole,
};
