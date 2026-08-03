const authService = require('../services/auth.service');
const {
  successResponse,
  createdResponse,
  noContentResponse,
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
  const user = await authService.applyForSeller(req.user.id);

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
  } = req.query;

  const options = {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    role,
    municipalityId,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    search,
  };

  const result = await authService.getUsers(options);

  successResponse(res, result, 'Users retrieved successfully');
});

/**
 * Approve seller application (Admin)
 * @route POST /api/auth/users/:id/approve-seller
 * @access Private (ADMIN only)
 */
const approveSeller = asyncHandler(async (req, res) => {
  const user = await authService.approveSeller(req.params.id);

  successResponse(res, user, 'Seller application approved successfully');
});

/**
 * Reject seller application (Admin)
 * @route POST /api/auth/users/:id/reject-seller
 * @access Private (ADMIN only)
 */
const rejectSeller = asyncHandler(async (req, res) => {
  const user = await authService.rejectSeller(req.params.id);

  successResponse(res, user, 'Seller application rejected');
});

/**
 * Suspend user account (Admin)
 * @route POST /api/auth/users/:id/suspend
 * @access Private (ADMIN only)
 */
const suspendUser = asyncHandler(async (req, res) => {
  const user = await authService.suspendUser(req.params.id);

  successResponse(res, user, 'User suspended successfully');
});

/**
 * Activate user account (Admin)
 * @route POST /api/auth/users/:id/activate
 * @access Private (ADMIN only)
 */
const activateUser = asyncHandler(async (req, res) => {
  const user = await authService.activateUser(req.params.id);

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

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  applyForSeller,
  getUserById,
  getUsers,
  approveSeller,
  rejectSeller,
  suspendUser,
  activateUser,
  deleteUser,
};
