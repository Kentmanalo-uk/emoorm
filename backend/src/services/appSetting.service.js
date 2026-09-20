const appSettingRepository = require('../repositories/appSetting.repository');
const { cached, invalidate, TAGS } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');

const DEFAULT_SETTINGS = {
  id: 'global',
  appLogo: '/brand-icon.png',
  productPlaceholder: '/brand-icon.png',
};

const isAllowedImageUrl = (value) => (
  value === '/brand-icon.png'
  || value.startsWith('/uploads/')
  || /^https?:\/\//i.test(value)
);

const sanitize = (input = {}) => {
  const data = {};
  for (const field of ['appLogo', 'productPlaceholder']) {
    if (input[field] === undefined) continue;
    const value = String(input[field] || '').trim();
    if (!value || value.length > 2048 || !isAllowedImageUrl(value)) {
      throw new ApiError(`${field} must be an uploaded image URL`, 400);
    }
    data[field] = value;
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError('Provide an app logo or product placeholder image', 400);
  }
  return data;
};

const get = async () => cached.appSettings({}, async () => {
  const settings = await appSettingRepository.findGlobal();
  return settings || DEFAULT_SETTINGS;
});

const update = async (input) => {
  const settings = await appSettingRepository.upsertGlobal(sanitize(input));
  await invalidate(TAGS.appSettings);
  return settings;
};

module.exports = { get, update };