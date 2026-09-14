const returnService = require('../services/return.service');
const storeRepository = require('../repositories/store.repository');
const { successResponse, createdResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const getSellerContext = async (req) => {
  const store = await storeRepository.findByOwnerId(req.user.id);
  if (!store) throw new ApiError('Seller store not found', 404);
  return { id: req.user.id, storeId: store.id };
};

const create = asyncHandler(async (req, res) => {
  const result = await returnService.createRequest(req.user.id, req.body);
  createdResponse(res, result, 'Return request submitted');
});

const getOne = asyncHandler(async (req, res) => {
  let actor = { id: req.user.id, role: req.user.role };
  if (req.user.role === 'SELLER') {
    const store = await storeRepository.findByOwnerId(req.user.id);
    actor.storeId = store?.id;
  }
  const result = await returnService.getForActor(req.params.id, actor);
  successResponse(res, result);
});

const myList = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, status } = req.query;
  const result = await returnService.listForBuyer(req.user.id, {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    status,
  });
  paginatedResponse(res, result.rows, result.total, result.page, result.pageSize);
});

const storeList = asyncHandler(async (req, res) => {
  const { storeId } = await getSellerContext(req);
  const { page = 1, pageSize = 20, status } = req.query;
  const result = await returnService.listForStore(storeId, {
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    status,
  });
  paginatedResponse(res, result.rows, result.total, result.page, result.pageSize);
});

const decide = asyncHandler(async (req, res) => {
  const actor = await getSellerContext(req);
  const result = await returnService.decide(req.params.id, actor, req.body);
  successResponse(res, result, 'Return request updated');
});

const received = asyncHandler(async (req, res) => {
  const actor = await getSellerContext(req);
  const result = await returnService.markReceived(req.params.id, actor);
  successResponse(res, result, 'Return marked as received');
});

const refund = asyncHandler(async (req, res) => {
  const actor = await getSellerContext(req);
  const result = await returnService.markRefunded(req.params.id, actor, req.body);
  successResponse(res, result, 'Refund recorded');
});

const cancel = asyncHandler(async (req, res) => {
  const result = await returnService.cancelByBuyer(req.params.id, req.user.id);
  successResponse(res, result, 'Return request cancelled');
});

const close = asyncHandler(async (req, res) => {
  const result = await returnService.closeByBuyer(req.params.id, req.user.id);
  successResponse(res, result, 'Return request closed');
});

module.exports = { create, getOne, myList, storeList, decide, received, refund, cancel, close };
