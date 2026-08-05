const authService = require('../services/auth.service');
const auditLog = require('../services/auditLog.service');
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
  const user = await authService.updateProfile(req.user.id, req.body);

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
  const user = await authService.getUserById(req.params.id);

  successResponse(res, user, 'User retrieved successfully');
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

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    role,
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
  const resetToken = await authService.forgotPassword(email);

  // In production, send the token via email. Here we return it for dev/testing.
  successResponse(res, 200, 'If that email is registered, a reset link has been sent.', {
    ...(process.env.NODE_ENV !== 'production' && resetToken ? { resetToken } : {}),
  });
});

/**
 * @route POST /api/auth/reset-password
 * @access Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  await authService.resetPassword(token, password);

  successResponse(res, 200, 'Password has been reset successfully.');
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

module.exports = {
  register,
  login,
  refreshToken,
  logout,
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
