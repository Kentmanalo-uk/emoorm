const express = require('express');
const router = express.Router();
const addressController = require('../controllers/address.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { addressValidation, addressUpdateValidation } = require('../validators/address.validator');

/**
 * Address Routes
 * All routes require authentication and are scoped to the current user
 */

router.get('/', authenticate, addressController.getMyAddresses);

router.post('/', authenticate, addressValidation, validate, addressController.createAddress);

router.put('/:id', authenticate, addressUpdateValidation, validate, addressController.updateAddress);

router.put('/:id/default', authenticate, addressController.setDefaultAddress);

router.delete('/:id', authenticate, addressController.deleteAddress);

module.exports = router;
