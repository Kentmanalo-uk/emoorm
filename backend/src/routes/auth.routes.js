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
  '/refresh-token',
  refreshTokenValidation,
  validate,
  authController.refreshToken
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

module.exports = router;
