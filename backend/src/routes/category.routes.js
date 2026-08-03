const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Category Routes
 */

// Public routes
router.get(
  '/',
  categoryController.getAllCategories
);

router.get(
  '/:id',
  categoryController.getCategoryById
);

router.get(
  '/slug/:slug',
  categoryController.getCategoryBySlug
);

// Admin routes
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  categoryController.createCategory
);

router.put(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN'),
  categoryController.updateCategory
);

router.delete(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN'),
  categoryController.deleteCategory
);

router.post(
  '/:id/toggle',
  authenticate,
  authorize('SUPER_ADMIN'),
  categoryController.toggleCategoryStatus
);

router.post(
  '/seed',
  authenticate,
  authorize('SUPER_ADMIN'),
  categoryController.seedCategories
);

module.exports = router;
