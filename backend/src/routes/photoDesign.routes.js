const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const service = require('../services/photoDesign.service');

/**
 * A shop's own photo designs (services/photoDesign). Sellers keep theirs;
 * admins see every shop's (a town admin's town) and can remove one.
 */
const router = express.Router();

router.use(authenticate);

const admin = authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN');

router.get('/admin', admin, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listAdmin(req.user, req.query) });
}));

router.post('/admin/:id/remove', admin, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.removeAdmin(req.user, req.params.id, req.body, req) });
}));

const seller = authorize('SELLER');

router.get('/', seller, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listMine(req.user.id) });
}));

router.post('/', seller, asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.create(req.user.id, req.body) });
}));

router.put('/:id', seller, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.user.id, req.params.id, req.body) });
}));

router.delete('/:id', seller, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.remove(req.user.id, req.params.id) });
}));

module.exports = router;
