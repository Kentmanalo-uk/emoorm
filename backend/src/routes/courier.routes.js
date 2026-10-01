const express = require('express');
const router = express.Router();
const courierController = require('../controllers/courier.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Couriers sellers can ship with (active only).
router.get('/', courierController.listActive);

// What delivery would cost: by the seller, and by each courier (product page, checkout).
router.post('/quote', courierController.quote);

// The seller's own delivery choices.
router.get('/my-store', authenticate, authorize('SELLER'), courierController.getMyDelivery);
router.put('/my-store', authenticate, authorize('SELLER'), courierController.setMyDelivery);

// The list itself is the super admin's.
router.get('/admin', authenticate, authorize('SUPER_ADMIN'), courierController.listAll);
router.post('/', authenticate, authorize('SUPER_ADMIN'), courierController.create);
router.put('/:id', authenticate, authorize('SUPER_ADMIN'), courierController.update);
router.delete('/:id', authenticate, authorize('SUPER_ADMIN'), courierController.remove);

module.exports = router;
