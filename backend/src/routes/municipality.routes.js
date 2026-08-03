const express = require('express');
const router = express.Router();
const municipalityController = require('../controllers/municipality.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Municipality Routes
 */

// Public routes
router.get(
  '/',
  municipalityController.getAllMunicipalities
);

router.get(
  '/:id',
  municipalityController.getMunicipalityById
);

router.get(
  '/code/:code',
  municipalityController.getMunicipalityByCode
);

// Admin routes
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  municipalityController.createMunicipality
);

router.post(
  '/seed',
  authenticate,
  authorize('SUPER_ADMIN'),
  municipalityController.seedMunicipalities
);

module.exports = router;
