const addressService = require('../services/address.service');
const { successResponse, createdResponse, noContentResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Address Controller
 * Handles HTTP requests for a buyer's saved delivery addresses
 */

/**
 * List my addresses
 * @route GET /api/addresses
 * @access Private
 */
const getMyAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.listAddresses(req.user.id);

  successResponse(res, addresses, 'Addresses retrieved successfully');
});

/**
 * Create a new address
 * @route POST /api/addresses
 * @access Private
 */
const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.createAddress(req.user.id, req.body);

  createdResponse(res, address, 'Address created successfully');
});

/**
 * Update an address
 * @route PUT /api/addresses/:id
 * @access Private
 */
const updateAddress = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress(req.user.id, req.params.id, req.body);

  successResponse(res, address, 'Address updated successfully');
});

/**
 * Set an address as the default
 * @route PUT /api/addresses/:id/default
 * @access Private
 */
const setDefaultAddress = asyncHandler(async (req, res) => {
  const address = await addressService.setDefaultAddress(req.user.id, req.params.id);

  successResponse(res, address, 'Default address updated successfully');
});

/**
 * Delete an address
 * @route DELETE /api/addresses/:id
 * @access Private
 */
const deleteAddress = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(req.user.id, req.params.id);

  noContentResponse(res);
});

module.exports = {
  getMyAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
