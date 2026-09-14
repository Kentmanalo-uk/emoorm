const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  registerValidation,
  loginValidation,
  refreshTokenValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  googleCompleteValidation,
} = require('../validators/auth.validator');

/**
 * Authentication Routes
 */

// Public routes
router.post(
  '/register',
  registerValidation,
  validate,
  authController.register
);

router.post(
  '/login',
  loginValidation,
  validate,
  authController.login
);

router.post(
  '/google',
  authController.googleLogin
);

router.post(
  '/google/complete',
  googleCompleteValidation,
  validate,
  authController.completeGoogleSignup
);

router.post(
  '/refresh-token',
  refreshTokenValidation,
  validate,
  authController.refreshToken
);

router.post(
  '/forgot-password',
  forgotPasswordValidation,
  validate,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  resetPasswordValidation,
  validate,
  authController.resetPassword
);

// Protected routes (require authentication)
router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.get(
  '/profile',
  authenticate,
  authController.getProfile
);

router.put(
  '/profile',
  authenticate,
  authController.updateProfile
);

router.post(
  '/change-password',
  authenticate,
  changePasswordValidation,
  validate,
  authController.changePassword
);

router.post(
  '/apply-seller',
  authenticate,
  authorize('BUYER'),
  authController.applyForSeller
);

// Admin routes
router.get(
  '/users',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  authController.getUsers
);

router.get(
  '/users/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  authController.getUserById
);

// Access control for the specific document is enforced in the service layer
// (self, or an authorized admin) since both regular users and admins may call this.
router.get(
  '/users/:id/kyc-photo/:field',
  authenticate,
  authController.getKycPhoto
);

router.post(
  '/users/:id/approve-seller',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  authController.approveSeller
);

router.post(
  '/users/:id/reject-seller',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  authController.rejectSeller
);

router.post(
  '/users/:id/suspend',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  authController.suspendUser
);

router.post(
  '/users/:id/activate',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  authController.activateUser
);

router.delete(
  '/users/:id',
  authenticate,
  authorize('SUPER_ADMIN'),
  authController.deleteUser
);

router.post(
  '/users/:id/set-role',
  authenticate,
  authorize('SUPER_ADMIN'),
  authController.setUserRole
);

module.exports = router;
