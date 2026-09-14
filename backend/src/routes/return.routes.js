const express = require('express');
const router = express.Router();
const controller = require('../controllers/return.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Buyer endpoints
router.post('/', authenticate, authorize('BUYER', 'SELLER'), controller.create);
router.get('/my', authenticate, authorize('BUYER', 'SELLER'), controller.myList);
router.post('/:id/cancel', authenticate, authorize('BUYER', 'SELLER'), controller.cancel);
router.post('/:id/close', authenticate, authorize('BUYER', 'SELLER'), controller.close);

// Seller endpoints
router.get('/store', authenticate, authorize('SELLER'), controller.storeList);
router.patch('/:id/decision', authenticate, authorize('SELLER'), controller.decide);
router.patch('/:id/received', authenticate, authorize('SELLER'), controller.received);
router.patch('/:id/refund', authenticate, authorize('SELLER'), controller.refund);

// Shared (buyer + seller + admin) - keep last so specific routes match first
router.get('/:id', authenticate, controller.getOne);

module.exports = router;
