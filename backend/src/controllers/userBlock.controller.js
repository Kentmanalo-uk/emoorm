const blockService = require('../services/userBlock.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * User Block Controller
 *
 * Thin, as the others are: everything that decides anything lives in
 * services/userBlock.
 */

/**
 * Everyone I have blocked.
 * @route GET /api/blocks/me
 * @access Private
 */
const listMine = asyncHandler(async (req, res) => {
  const blocks = await blockService.listMyBlocks(req.user.id);
  successResponse(res, blocks, 'Blocked people retrieved');
});

/**
 * Where this person and I stand.
 * @route GET /api/blocks/status/:userId
 * @access Private
 */
const getStatus = asyncHandler(async (req, res) => {
  const status = await blockService.getBlockStatus(req.user.id, req.params.userId);
  successResponse(res, status, 'Block status retrieved');
});

/**
 * The same question when all the caller holds is a shop.
 * @route GET /api/blocks/status/store/:storeId
 * @access Private
 */
const getStoreStatus = asyncHandler(async (req, res) => {
  const ownerId = await blockService.ownerOf(req.params.storeId);
  const status = await blockService.getBlockStatus(req.user.id, ownerId);
  successResponse(res, { ...status, ownerId }, 'Block status retrieved');
});

/**
 * Block someone.
 * @route POST /api/blocks/:userId
 * @access Private
 */
const block = asyncHandler(async (req, res) => {
  const result = await blockService.blockUser(req.user.id, req.params.userId, req.body?.reason);
  successResponse(res, result, 'Blocked');
});

/**
 * Block whoever owns this shop.
 * @route POST /api/blocks/store/:storeId
 * @access Private
 */
const blockStore = asyncHandler(async (req, res) => {
  const ownerId = await blockService.ownerOf(req.params.storeId);
  const result = await blockService.blockUser(req.user.id, ownerId, req.body?.reason);
  successResponse(res, { ...result, ownerId }, 'Blocked');
});

/**
 * Let them back in.
 * @route DELETE /api/blocks/:userId
 * @access Private
 */
const unblock = asyncHandler(async (req, res) => {
  const result = await blockService.unblockUser(req.user.id, req.params.userId);
  successResponse(res, result, 'Unblocked');
});

/**
 * @route DELETE /api/blocks/store/:storeId
 * @access Private
 */
const unblockStore = asyncHandler(async (req, res) => {
  const ownerId = await blockService.ownerOf(req.params.storeId);
  const result = await blockService.unblockUser(req.user.id, ownerId);
  successResponse(res, { ...result, ownerId }, 'Unblocked');
});

module.exports = {
  listMine, getStatus, getStoreStatus, block, blockStore, unblock, unblockStore,
};
