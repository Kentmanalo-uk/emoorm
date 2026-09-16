const municipalityRepository = require('../repositories/municipality.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Municipality Service
 * Contains business logic for municipality operations
 */

/**
 * Get all municipalities
 * @returns {Promise<Array>} List of municipalities
 */
const getAllMunicipalities = async (includeInactive = false) => {
  return municipalityRepository.findAll(includeInactive);
};

/**
 * Get municipality by ID
 * @param {String} id - Municipality ID
 * @returns {Promise<Object>} Municipality
 */
const getMunicipalityById = async (id) => {
  const municipality = await municipalityRepository.findById(id);

  if (!municipality) {
    throw new ApiError('Municipality not found', 404);
  }

  return municipality;
};

/**
 * Get municipality by code
 * @param {String} code - Municipality code
 * @returns {Promise<Object>} Municipality
 */
const getMunicipalityByCode = async (code) => {
  const municipality = await municipalityRepository.findByCode(code);

  if (!municipality) {
    throw new ApiError('Municipality not found', 404);
  }

  return municipality;
};

/**
 * Create municipality (Super Admin only)
 * @param {Object} data - Municipality data
 * @returns {Promise<Object>} Created municipality
 */
const createMunicipality = async (data) => {
  // Check if code already exists
  const existing = await municipalityRepository.findByCode(data.code);
  if (existing) {
    throw new ApiError('Municipality code already exists', 409);
  }

  return municipalityRepository.createMunicipality(data);
};

/**
 * Seed municipalities (Development only)
 * @returns {Promise<Object>} Seed result
 */
const seedMunicipalities = async () => {
  const municipalities = [
    { name: 'Baco', code: 'BACO' },
    { name: 'Bansud', code: 'BANSUD' },
    { name: 'Bongabong', code: 'BONGABONG' },
    { name: 'Bulalacao', code: 'BULALACAO' },
    { name: 'Calapan City', code: 'CALAPAN' },
    { name: 'Gloria', code: 'GLORIA' },
    { name: 'Mansalay', code: 'MANSALAY' },
    { name: 'Naujan', code: 'NAUJAN' },
    { name: 'Pinamalayan', code: 'PINAMALAYAN' },
    { name: 'Pola', code: 'POLA' },
    { name: 'Puerto Galera', code: 'PUERTO_GALERA' },
    { name: 'Roxas', code: 'ROXAS' },
    { name: 'San Teodoro', code: 'SAN_TEODORO' },
    { name: 'Socorro', code: 'SOCORRO' },
    { name: 'Victoria', code: 'VICTORIA' },
  ];

  const count = await municipalityRepository.seedMunicipalities(municipalities);

  return {
    created: count,
    total: municipalities.length,
    alreadyExists: municipalities.length - count,
  };
};

module.exports = {
  getAllMunicipalities,
  getMunicipalityById,
  getMunicipalityByCode,
  createMunicipality,
  updateMunicipality,
  seedMunicipalities,
};

async function updateMunicipality(id, data, actor) {
  const municipality = await municipalityRepository.findById(id);
  if (!municipality) throw new ApiError('Municipality not found', 404);
  if (actor?.role === 'MUNICIPAL_ADMIN' && actor.municipalityId !== id) {
    throw new ApiError('You can only update your assigned municipality', 403);
  }
  const allowed = ['logo', 'tagline', 'description', 'gallery'];
  const updateData = Object.fromEntries(Object.entries(data || {}).filter(([key]) => allowed.includes(key)));
  if (updateData.gallery !== undefined && (!Array.isArray(updateData.gallery) || updateData.gallery.length > 12)) {
    throw new ApiError('Gallery must contain up to 12 images', 400);
  }
  return municipalityRepository.updateMunicipality(id, updateData);
}
