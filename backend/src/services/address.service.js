const addressRepository = require('../repositories/address.repository');
const municipalityRepository = require('../repositories/municipality.repository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Address Service
 * Business logic for a buyer's saved delivery addresses
 */

const ALLOWED_FIELDS = ['label', 'fullName', 'contactNumber', 'province', 'municipalityId', 'barangay', 'street'];

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
 * The account's own address, kept as its first delivery address (the
 * default) once it has everything a delivery needs: the town, barangay,
 * street and a contact number. Otherwise it stays on the profile only.
 * Never fails the sign-up or profile save it is part of.
 * @param {String} userId
 * @param {Object} details - { fullName, contactNumber, municipalityId, barangay, address }
 * @returns {Promise<Object|null>} The saved address, or null
 */
const saveProfileAddress = async (userId, details = {}) => {
  const street = String(details.address || '').trim();
  const barangay = String(details.barangay || '').trim();
  const contactNumber = String(details.contactNumber || '').trim();
  if (!details.municipalityId || !barangay || !street || !contactNumber || !details.fullName) return null;
  try {
    return await createAddress(userId, {
      label: 'Home',
      fullName: String(details.fullName).trim(),
      contactNumber,
      municipalityId: details.municipalityId,
      province: 'Oriental Mindoro',
      barangay,
      street,
      isDefault: true,
    });
  } catch (err) {
    console.error('[address] could not keep the profile address:', err.message);
    return null;
  }
};

const sameText = (a, b) => String(a || '').trim() === String(b || '').trim();

/**
 * After the account's own address, contact number or name changes: the
 * "Home" delivery address copied from it follows, as long as it still
 * matches the old address (one the buyer edited in My Addresses is theirs
 * and is left alone). An account with no delivery addresses gets one once
 * its address is complete. Never fails the profile save.
 * @param {String} userId
 * @param {Object} before - The profile before the change
 * @param {Object} after - The profile after it
 */
const followProfileAddress = async (userId, before = {}, after = {}) => {
  const moved = ['municipalityId', 'barangay', 'address'].some((k) => !sameText(before[k], after[k]));
  const reachable = !sameText(before.contactNumber, after.contactNumber);
  const renamed = !sameText(before.fullName, after.fullName);
  if (!moved && !reachable && !renamed) return null;
  try {
    const book = await addressRepository.findAllByUser(userId);
    if (book.length === 0) {
      return (moved || reachable) ? await saveProfileAddress(userId, after) : null;
    }
    const copy = book.find((a) => a.label === 'Home'
      && sameText(a.municipalityId, before.municipalityId)
      && sameText(a.barangay, before.barangay)
      && sameText(a.street, before.address));
    if (!copy) return null;

    const changes = {};
    if (moved && after.municipalityId && String(after.barangay || '').trim() && String(after.address || '').trim()) {
      Object.assign(changes, {
        municipalityId: after.municipalityId,
        barangay: String(after.barangay).trim(),
        street: String(after.address).trim(),
      });
    }
    if (reachable && String(after.contactNumber || '').trim() && sameText(copy.contactNumber, before.contactNumber)) {
      changes.contactNumber = String(after.contactNumber).trim();
    }
    if (renamed && String(after.fullName || '').trim() && sameText(copy.fullName, before.fullName)) {
      changes.fullName = String(after.fullName).trim();
    }
    return Object.keys(changes).length ? await addressRepository.update(copy.id, changes) : null;
  } catch (err) {
    console.error('[address] could not update the Home address:', err.message);
    return null;
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
  saveProfileAddress,
  followProfileAddress,
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
