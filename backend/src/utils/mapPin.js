/**
 * A map pin (latitude, longitude) inside the Philippines, or null for none.
 * Both or neither: half a pin is no pin.
 */
const { ApiError } = require('../middleware/errorHandler');

const normalizePin = (latitude, longitude) => {
  const empty = (v) => v === null || v === undefined || v === '';
  if (empty(latitude) && empty(longitude)) return { latitude: null, longitude: null };
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4 || lat > 22 || lng < 116 || lng > 127) {
    throw new ApiError('The map pin must be in the Philippines', 400);
  }
  return { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 };
};

module.exports = { normalizePin };
