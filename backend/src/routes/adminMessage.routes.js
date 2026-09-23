const express = require('express');
const adminMessageController = require('../controllers/adminMessage.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Admin messaging: super admin <-> municipal admin.
 * The role gate here is the coarse one; which *thread* a municipal admin may
 * open is decided in adminMessage.service (adminId === actor.id).
 */
const admins = authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN');

router.post('/', authenticate, authorize('SUPER_ADMIN'), adminMessageController.create);
router.get('/', authenticate, admins, adminMessageController.list);
router.get('/unread-count', authenticate, admins, adminMessageController.unreadCount);
router.get('/:id', authenticate, admins, adminMessageController.getOne);
router.post('/:id/messages', authenticate, admins, adminMessageController.send);
router.patch('/:id/status', authenticate, authorize('SUPER_ADMIN'), adminMessageController.setStatus);

module.exports = router;
