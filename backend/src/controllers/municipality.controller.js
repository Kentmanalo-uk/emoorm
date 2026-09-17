const municipalityService = require('../services/municipality.service');
const auditLog = require('../services/auditLog.service');
const { successResponse, createdResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Municipality Controller
 * Handles HTTP requests for municipality operations
 */

/**
 * Get all municipalities
 * @route GET /api/municipalities
 * @access Public
 */
const getAllMunicipalities = asyncHandler(async (req, res) => {
  const { includeInactive } = req.query;
  const municipalities = await municipalityService.getAllMunicipalities(includeInactive === 'true');
  successResponse(res, municipalities, 'Municipalities retrieved successfully');
});

/**
 * Get municipality by ID
 * @route GET /api/municipalities/:id
 * @access Public
 */
const getMunicipalityById = asyncHandler(async (req, res) => {
  const municipality = await municipalityService.getMunicipalityById(req.params.id);

  successResponse(res, municipality, 'Municipality retrieved successfully');
});

/**
 * Get municipality by code
 * @route GET /api/municipalities/code/:code
 * @access Public
 */
const getMunicipalityByCode = asyncHandler(async (req, res) => {
  const municipality = await municipalityService.getMunicipalityByCode(req.params.code);

  successResponse(res, municipality, 'Municipality retrieved successfully');
});

/**
 * Create municipality
 * @route POST /api/municipalities
 * @access Private (Super Admin only)
 */
const createMunicipality = asyncHandler(async (req, res) => {
  const municipality = await municipalityService.createMunicipality(req.body);

  createdResponse(res, municipality, 'Municipality created successfully');
});

/**
 * Seed municipalities (Development only)
 * @route POST /api/municipalities/seed
 * @access Private (Super Admin only)
 */
const seedMunicipalities = asyncHandler(async (req, res) => {
  const result = await municipalityService.seedMunicipalities();

  successResponse(res, result, 'Municipalities seeded successfully');
});

const updateMunicipality = asyncHandler(async (req, res) => {
  const municipality = await municipalityService.updateMunicipality(req.params.id, req.body, req.user);
  await auditLog.record({
    actor: req.user,
    action: 'UPDATE_MUNICIPALITY_PAGE',
    entity: 'Municipality',
    entityId: req.params.id,
    details: { fields: Object.keys(req.body || {}) },
    municipalityId: req.params.id,
    req,
  });
  successResponse(res, municipality, 'Municipality updated successfully');
});

module.exports = {
  getAllMunicipalities,
  getMunicipalityById,
  getMunicipalityByCode,
  createMunicipality,
  updateMunicipality,
  seedMunicipalities,
};
