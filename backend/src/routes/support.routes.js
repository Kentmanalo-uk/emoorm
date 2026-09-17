const express = require('express');
const supportController = require('../controllers/support.controller');
const supportChatController = require('../controllers/supportChat.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, supportController.createTicket);
router.get('/my', authenticate, supportController.getMyTickets);

// User ↔ municipal admin help chat. Access to a conversation is checked in the
// service (its user, the admin of its municipality, or a superadmin).
router.post('/chat/municipal', authenticate, supportChatController.openMunicipal);
router.post('/chat/users/:userId', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportChatController.openWithUser);
router.get('/chat/my', authenticate, supportChatController.listMine);
router.get('/chat/inbox', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportChatController.listInbox);
router.get('/chat/:id', authenticate, supportChatController.getOne);
router.post('/chat/:id/messages', authenticate, supportChatController.send);
router.patch('/chat/:id/status', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportChatController.setStatus);

module.exports = router;
