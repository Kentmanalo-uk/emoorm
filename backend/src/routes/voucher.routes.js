const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucher.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { voucherValidateLimiter } = require('../middleware/security');

router.post('/validate', authenticate, voucherValidateLimiter, voucherController.validate);

// A seller's own vouchers, and a shop's live ones for its page.
router.get('/shop', authenticate, authorize('SELLER'), voucherController.listShop);
router.post('/shop', authenticate, authorize('SELLER'), voucherController.createShop);
router.put('/shop/:id', authenticate, authorize('SELLER'), voucherController.updateShop);
router.delete('/shop/:id', authenticate, authorize('SELLER'), voucherController.removeShop);
router.get('/store/:storeId', voucherController.liveForStore);

router.get('/', authenticate, authorize('SUPER_ADMIN'), voucherController.listAdmin);
router.post('/', authenticate, authorize('SUPER_ADMIN'), voucherController.create);
router.put('/:id', authenticate, authorize('SUPER_ADMIN'), voucherController.update);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), voucherController.remove);

module.exports = router;
