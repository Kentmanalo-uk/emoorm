const supportService = require('../services/support.service');
const { createdResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const createTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.createTicket(req.user.id, req.body);
  createdResponse(res, ticket, 'Your request has been submitted to Emoorm Support');
});

const getMyTickets = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const type = req.query.type ? String(req.query.type).toUpperCase() : undefined;
  const result = await supportService.getMyTickets(req.user.id, { page, pageSize, type });
  paginatedResponse(res, result.tickets, result.total, result.page, result.pageSize, 'Support requests retrieved successfully');
});

module.exports = { createTicket, getMyTickets };