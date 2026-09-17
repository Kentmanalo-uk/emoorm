const express = require('express');
const controller = require('../controllers/moderation.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Admin work queues. Municipal admins are scoped to their municipality in the service.
const router = express.Router();
router.use(authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'));

router.get('/attention', controller.attention);
router.get('/store-health', controller.storeHealth);
router.get('/reviews', controller.reviews);
router.get('/returns', controller.returns);
router.get('/identity/:userId', controller.identity);
router.post('/identity/:userId/review', controller.reviewIdentity);

module.exports = router;
