const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth');

// All messaging endpoints require a logged-in user; authorization for individual
// conversations is enforced in the service (buyer OR store owner only).
router.use(authenticate);

router.get('/conversations', messageController.listConversations);
router.post('/conversations', messageController.openConversation);
router.get('/conversations/:id', messageController.getConversation);
router.post('/conversations/:id/messages', messageController.sendMessage);
router.post('/conversations/:id/read', messageController.markRead);
router.post('/conversations/:id/rate-service', messageController.rateService);

module.exports = router;
