const courierService = require('../services/courier.service');
const storeRepository = require('../repositories/store.repository');
const auditLog = require('../services/auditLog.service');
const { successResponse } = require('../utils/response');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const listActive = asyncHandler(async (req, res) => {
  successResponse(res, await courierService.listActive(), 'Couriers retrieved');
});

const listAll = asyncHandler(async (req, res) => {
  successResponse(res, await courierService.listAll(), 'Couriers retrieved');
});

const create = asyncHandler(async (req, res) => {
  const courier = await courierService.create(req.body);
  await auditLog.record({
    actor: req.user, action: 'CREATE_COURIER', entity: 'Courier', entityId: courier.id, details: { name: courier.name }, req,
  });
  successResponse(res, courier, 'Courier added', 201);
});

const update = asyncHandler(async (req, res) => {
  const courier = await courierService.update(req.params.id, req.body);
  await auditLog.record({
    actor: req.user, action: 'UPDATE_COURIER', entity: 'Courier', entityId: courier.id, details: { name: courier.name, isActive: courier.isActive }, req,
  });
  successResponse(res, courier, 'Courier updated');
});

const remove = asyncHandler(async (req, res) => {
  const courier = await courierService.remove(req.params.id);
  await auditLog.record({
    actor: req.user, action: 'DELETE_COURIER', entity: 'Courier', entityId: courier.id, details: { name: courier.name }, req,
  });
  successResponse(res, null, 'Courier removed');
});

const myStoreId = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('Create your store first', 404);
  return store.id;
};

/** The seller's delivery choices: couriers they ship with, and self-delivery. */
const getMyDelivery = asyncHandler(async (req, res) => {
  successResponse(res, await courierService.getStoreDelivery(await myStoreId(req.user.id)), 'Delivery options retrieved');
});

const setMyDelivery = asyncHandler(async (req, res) => {
  const { selfDelivery, courierIds, moormoveEnabled } = req.body || {};
  const data = await courierService.setStoreDelivery(await myStoreId(req.user.id), { selfDelivery, courierIds, moormoveEnabled });
  successResponse(res, data, 'Delivery options saved');
});

/** POST /couriers/quote — delivery by the seller and by each courier, for some items. */
const quote = asyncHandler(async (req, res) => {
  const { storeId, items, municipalityId, barangay } = req.body || {};
  successResponse(res, await courierService.quote({ storeId, items, municipalityId, barangay }), 'Delivery options');
});

module.exports = { quote, listActive, listAll, create, update, remove, getMyDelivery, setMyDelivery };
