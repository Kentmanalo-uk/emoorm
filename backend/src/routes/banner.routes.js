const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/banner.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', bannerController.listPublic);

router.get('/admin', authenticate, authorize('SUPER_ADMIN'), bannerController.listAdmin);
router.post('/', authenticate, authorize('SUPER_ADMIN'), bannerController.create);
router.put('/:id', authenticate, authorize('SUPER_ADMIN'), bannerController.update);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), bannerController.remove);

module.exports = router;
