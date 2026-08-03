const prisma = require('../config/database');

/**
 * Municipality Repository
 * Handles all database operations related to municipalities
 */

/**
 * Create a municipality
 * @param {Object} data - Municipality data
 * @returns {Promise<Object>} Created municipality
 */
const createMunicipality = async (data) => {
  return prisma.municipality.create({ data });
};

/**
 * Find all municipalities
 * @returns {Promise<Array>} List of municipalities
 */
const findAll = async () => {
  return prisma.municipality.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
};

/**
 * Find municipality by ID
 * @param {String} id - Municipality ID
 * @returns {Promise<Object|null>} Municipality or null
 */
const findById = async (id) => {
  return prisma.municipality.findUnique({
    where: { id },
  });
};

/**
 * Find municipality by code
 * @param {String} code - Municipality code
 * @returns {Promise<Object|null>} Municipality or null
 */
const findByCode = async (code) => {
  return prisma.municipality.findUnique({
    where: { code },
  });
};

/**
 * Seed municipalities (for development)
 * @param {Array} municipalities - Array of municipality data
 * @returns {Promise<Number>} Count of created municipalities
 */
const seedMunicipalities = async (municipalities) => {
  let count = 0;
  
  for (const mun of municipalities) {
    const existing = await findByCode(mun.code);
    if (!existing) {
      await createMunicipality(mun);
      count++;
    }
  }
  
  return count;
};

module.exports = {
  createMunicipality,
  findAll,
  findById,
  findByCode,
  seedMunicipalities,
};
