const { publicCache } = require('../middleware/httpCache');
const config = require('../config/env');
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
  publicCache(config.cache.ttl.municipalities),
  municipalityController.getAllMunicipalities
);

router.get(
  '/:id',
  publicCache(config.cache.ttl.municipalities),
  municipalityController.getMunicipalityById
);

router.get(
  '/code/:code',
  publicCache(config.cache.ttl.municipalities),
  municipalityController.getMunicipalityByCode
);

// Admin routes
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  municipalityController.createMunicipality
);

router.put(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'),
  municipalityController.updateMunicipality
);

router.post(
  '/seed',
  authenticate,
  authorize('SUPER_ADMIN'),
  municipalityController.seedMunicipalities
);

module.exports = router;
