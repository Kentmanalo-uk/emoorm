const addressRepository = require('../repositories/address.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Address Service
 * Business logic for a buyer's saved delivery addresses
 */

const ALLOWED_FIELDS = ['label', 'fullName', 'contactNumber', 'municipalityId', 'barangay', 'street'];

const pickAllowed = (data) => {
  const result = {};
  for (const field of ALLOWED_FIELDS) {
    if (data[field] !== undefined) result[field] = data[field];
  }
  return result;
};

const assertMunicipalityExists = async (municipalityId) => {
  const municipality = await municipalityRepository.findById(municipalityId);
  if (!municipality) {
    throw new ApiError('Invalid municipality', 400);
  }
};

/**
 * List a user's saved addresses
 */
const listAddresses = async (userId) => {
  return addressRepository.findAllByUser(userId);
};

/**
 * Create a new address for a user
 */
const createAddress = async (userId, data) => {
  const payload = pickAllowed(data);
  const required = ['fullName', 'contactNumber', 'municipalityId', 'barangay', 'street'];
  for (const field of required) {
    if (!payload[field] || !String(payload[field]).trim()) {
      throw new ApiError(`${field} is required`, 400);
    }
  }

  await assertMunicipalityExists(payload.municipalityId);

  const existingCount = await addressRepository.countByUser(userId);
  const makeDefault = data.isDefault === true || existingCount === 0;

  if (makeDefault) {
    await addressRepository.clearDefault(userId);
  }

  return addressRepository.create({
    ...payload,
    userId,
    isDefault: makeDefault,
  });
};

/**
 * Update an existing address (must belong to the user)
 */
const updateAddress = async (userId, addressId, data) => {
  const existing = await addressRepository.findByIdForUser(addressId, userId);
  if (!existing) {
    throw new ApiError('Address not found', 404);
  }

  const payload = pickAllowed(data);
  if (payload.municipalityId) {
    await assertMunicipalityExists(payload.municipalityId);
  }

  if (data.isDefault === true && !existing.isDefault) {
    await addressRepository.clearDefault(userId);
    payload.isDefault = true;
  }

  return addressRepository.update(addressId, payload);
};

/**
 * Mark an address as the default one, unsetting all others
 */
const setDefaultAddress = async (userId, addressId) => {
  const existing = await addressRepository.findByIdForUser(addressId, userId);
  if (!existing) {
    throw new ApiError('Address not found', 404);
  }
  if (existing.isDefault) return existing;

  await addressRepository.clearDefault(userId);
  return addressRepository.update(addressId, { isDefault: true });
};

/**
 * Delete an address (must belong to the user); auto-promotes another as default if needed
 */
const deleteAddress = async (userId, addressId) => {
  const existing = await addressRepository.findByIdForUser(addressId, userId);
  if (!existing) {
    throw new ApiError('Address not found', 404);
  }

  await addressRepository.remove(addressId);

  if (existing.isDefault) {
    const nextDefault = await addressRepository.findMostRecentByUser(userId);
    if (nextDefault) {
      await addressRepository.update(nextDefault.id, { isDefault: true });
    }
  }
};

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
