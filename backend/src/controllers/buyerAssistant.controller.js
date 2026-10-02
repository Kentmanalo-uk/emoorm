const buyerAssistantService = require('../services/buyerAssistant.service');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Buyer Assistant Controller ("Ate Moormy" in the buyer's Messages)
 */

/**
 * The greeting and the suggested questions.
 * @route GET /api/buyer-assistant
 * @access Private (BUYER, SELLER)
 */
const getIntro = asyncHandler(async (req, res) => {
  successResponse(res, await buyerAssistantService.getIntro(req.user, req.query.lang), 'Ate Moormy is ready');
});

/**
 * Answer a buyer's question (typed, or one of the suggested questions).
 * @route POST /api/buyer-assistant/chat
 * @access Private (BUYER, SELLER)
 */
const chat = asyncHandler(async (req, res) => {
  successResponse(res, await buyerAssistantService.chat(req.user, req.body), 'Answered');
});

module.exports = { getIntro, chat };
