const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const team = require('../services/adminTeam.service');
const chat = require('../services/teamChat.service');

// A town's admin team (services/adminTeam.service.js). A super admin names
// the town with ?municipalityId=; a municipal admin always gets their own.
router.use(authenticate, authorize('MUNICIPAL_ADMIN', 'SUPER_ADMIN'));

const town = (req) => ({ municipalityId: req.query.municipalityId || req.body?.municipalityId });

router.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await team.list(req.user, town(req)) });
}));

router.get('/lookup', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await team.lookup(req.user, { email: req.query.email, ...town(req) }) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const member = await team.add(req.user, { ...req.body, ...town(req) }, req);
  res.status(201).json({ success: true, data: member, message: `${member.fullName} is now on the admin team` });
}));

// The team's chats: the whole team's ('team'), and one per pair of admins.
router.get('/chats', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await chat.listChats(req.user) });
}));

router.get('/chats/:thread', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await chat.getMessages(req.user, req.params.thread, req.query) });
}));

router.post('/chats/:thread', asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await chat.send(req.user, req.params.thread, req.body) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await team.extend(req.user, req.params.id, { accessExpiresAt: req.body?.accessExpiresAt, ...town(req) }, req) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await team.remove(req.user, req.params.id, town(req), req) });
}));

module.exports = router;
