const prisma = require('../config/database');

/**
 * Address Repository
 * Handles all database operations related to a buyer's saved delivery addresses
 */

const addressInclude = {
  municipality: { select: { id: true, name: true, code: true } },
};

/**
 * List all addresses for a user, default first, then newest first
 * @param {String} userId
 * @returns {Promise<Array>}
 */
const findAllByUser = async (userId) => {
  return prisma.address.findMany({
    where: { userId },
    include: addressInclude,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
};

/**
 * Find an address by id (scoped to owner)
 * @param {String} id
 * @param {String} userId
 * @returns {Promise<Object|null>}
 */
const findByIdForUser = async (id, userId) => {
  return prisma.address.findFirst({
    where: { id, userId },
    include: addressInclude,
  });
};

/**
 * Count addresses owned by a user
 * @param {String} userId
 * @returns {Promise<Number>}
 */
const countByUser = async (userId) => {
  return prisma.address.count({ where: { userId } });
};

/**
 * Clear the default flag from every address of a user
 * @param {String} userId
 */
const clearDefault = async (userId) => {
  return prisma.address.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  });
};

/**
 * Create an address
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const create = async (data) => {
  return prisma.address.create({ data, include: addressInclude });
};

/**
 * Update an address by id
 * @param {String} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const update = async (id, data) => {
  return prisma.address.update({ where: { id }, data, include: addressInclude });
};

/**
 * Delete an address by id
 * @param {String} id
 * @returns {Promise<Object>}
 */
const remove = async (id) => {
  return prisma.address.delete({ where: { id } });
};

/**
 * Find the most recently created address for a user (used to auto-promote a new default)
 * @param {String} userId
 * @returns {Promise<Object|null>}
 */
const findMostRecentByUser = async (userId) => {
  return prisma.address.findFirst({
    where: { userId },
    include: addressInclude,
    orderBy: { createdAt: 'desc' },
  });
};

module.exports = {
  findAllByUser,
  findByIdForUser,
  countByUser,
  clearDefault,
  create,
  update,
  remove,
  findMostRecentByUser,
};
