const categoryService = require('../services/category.service');
const { successResponse, createdResponse, noContentResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Category Controller
 * Handles HTTP requests for category operations
 */

/**
 * Get all categories
 * @route GET /api/categories
 * @access Public
 */
const getAllCategories = asyncHandler(async (req, res) => {
  const { includeInactive } = req.query;
  const activeOnly = includeInactive !== 'true';

  const categories = await categoryService.getAllCategories(activeOnly);

  successResponse(res, categories, 'Categories retrieved successfully');
});

/**
 * Get category by ID
 * @route GET /api/categories/:id
 * @access Public
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);

  successResponse(res, category, 'Category retrieved successfully');
});

/**
 * Get category by slug
 * @route GET /api/categories/slug/:slug
 * @access Public
 */
const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);

  successResponse(res, category, 'Category retrieved successfully');
});

/**
 * Create category
 * @route POST /api/categories
 * @access Private (Super Admin only)
 */
const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);

  createdResponse(res, category, 'Category created successfully');
});

/**
 * Update category
 * @route PUT /api/categories/:id
 * @access Private (Super Admin only)
 */
const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);

  successResponse(res, category, 'Category updated successfully');
});

/**
 * Delete category
 * @route DELETE /api/categories/:id
 * @access Private (Super Admin only)
 */
const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);

  noContentResponse(res);
});

/**
 * Toggle category status
 * @route POST /api/categories/:id/toggle
 * @access Private (Super Admin only)
 */
const toggleCategoryStatus = asyncHandler(async (req, res) => {
  const category = await categoryService.toggleCategoryStatus(req.params.id);

  successResponse(res, category, 'Category status toggled successfully');
});

/**
 * Seed categories (Development only)
 * @route POST /api/categories/seed
 * @access Private (Super Admin only)
 */
const seedCategories = asyncHandler(async (req, res) => {
  const result = await categoryService.seedCategories();

  successResponse(res, result, 'Categories seeded successfully');
});

module.exports = {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  seedCategories,
};
