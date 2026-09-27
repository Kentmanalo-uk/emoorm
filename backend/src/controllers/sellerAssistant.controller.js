const sellerAssistantService = require('../services/sellerAssistant.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Seller Assistant Controller ("Ate Moormy")
 */

/**
 * The greeting and the suggested questions.
 * @route GET /api/seller-assistant
 * @access Private (SELLER)
 */
const getIntro = asyncHandler(async (req, res) => {
  successResponse(res, await sellerAssistantService.getIntro(req.user), 'Ate Moormy is ready');
});

/**
 * Answer a seller's question (typed, or one of the suggested questions).
 * @route POST /api/seller-assistant/chat
 * @access Private (SELLER)
 */
const chat = asyncHandler(async (req, res) => {
  successResponse(res, await sellerAssistantService.chat(req.user, req.body), 'Answered');
});

module.exports = { getIntro, chat };
