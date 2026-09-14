const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucher.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/validate', authenticate, voucherController.validate);

router.get('/', authenticate, authorize('SUPER_ADMIN'), voucherController.listAdmin);
router.post('/', authenticate, authorize('SUPER_ADMIN'), voucherController.create);
router.put('/:id', authenticate, authorize('SUPER_ADMIN'), voucherController.update);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), voucherController.remove);

module.exports = router;
