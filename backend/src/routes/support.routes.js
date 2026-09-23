const express = require('express');
const supportCaseController = require('../controllers/supportChat.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Support cases. The old write-only ticket endpoints (POST /, GET /my) are
 * gone — Customer Care and Feedback are support cases now.
 *
 * Access to a single case is checked in the service (its owner, an admin of
 * its municipality, or a super admin), which is why the `:id` routes carry
 * only `authenticate`.
 */

router.get('/inbox', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportCaseController.listInbox);

router.post('/cases', authenticate, supportCaseController.createCase);
router.get('/cases', authenticate, supportCaseController.listMine);
router.post('/cases/for-user/:userId', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportCaseController.openWithUser);
router.get('/cases/:id', authenticate, supportCaseController.getOne);
router.post('/cases/:id/messages', authenticate, supportCaseController.send);
router.patch('/cases/:id/status', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportCaseController.setStatus);
router.post('/cases/:id/rating', authenticate, supportCaseController.rate);

// Thin aliases for the previous `/chat/*` paths so no existing client 404s.
router.post('/chat/municipal', authenticate, supportCaseController.openMunicipal);
router.post('/chat/users/:userId', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportCaseController.openWithUser);
router.get('/chat/my', authenticate, supportCaseController.listMineLegacy);
router.get('/chat/inbox', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportCaseController.listInboxLegacy);
router.get('/chat/:id', authenticate, supportCaseController.getOne);
router.post('/chat/:id/messages', authenticate, supportCaseController.send);
router.patch('/chat/:id/status', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), supportCaseController.setStatus);

module.exports = router;
