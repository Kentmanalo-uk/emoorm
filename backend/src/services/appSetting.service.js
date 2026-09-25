const appSettingRepository = require('../repositories/appSetting.repository');
const config = require('../config/env');
const { cached, invalidate, TAGS } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');

const DEFAULT_SETTINGS = {
  id: 'global',
  appLogo: '/brand-icon.png',
  productPlaceholder: '/brand-icon.png',
  theme: null,
  deliveryFee: 50,
  freeDeliveryThreshold: 500,
  requireBuyerVerification: true,
};

// A switch is a boolean. "yes", 1 and "" are rejected rather than guessed
// at, because a mis-set checkout gate is not something to be lenient about.
const booleanField = (value, field) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ApiError(`${field} must be true or false`, 400);
};

// Money fields are bounded so a typo cannot quote a six-figure delivery fee.
const MAX_MONEY = 99999;
const moneyField = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) {
    throw new ApiError(`${field} must be a number between 0 and ${MAX_MONEY}`, 400);
  }
  return Math.round(n * 100) / 100;
};

const isAllowedImageUrl = (value) => (
  value === '/brand-icon.png'
  || value.startsWith('/uploads/')
  || /^https?:\/\//i.test(value)
);

/* ── Theme validation ─────────────────────────────────────────────────────
   Whatever is stored here is served to every visitor and ends up as a CSS
   custom property on their page, so it is validated as untrusted input even
   though only a super admin can write it. A colour is a colour: no var(), no
   url(), no semicolons, nothing that could close a declaration and open
   another one. Anything that does not match is rejected rather than
   stripped, so a typo is reported instead of silently ignored. */

const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]{1,64}\)|hsla?\([\d\s.,%/]{1,64}\))$/;
const KEY = /^[a-zA-Z][a-zA-Z0-9-]{0,47}$/;
const PRESET_ID = /^[a-z][a-z0-9-]{0,63}$/;
const MODES = ['light', 'dark', 'system'];

// A palette is small. A megabyte of "theme" is somebody probing, not styling.
const MAX_THEME_BYTES = 24 * 1024;
const MAX_ENTRIES = 200;

const colorMap = (input, field) => {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(`${field} must be an object of colours`, 400);
  }

  const entries = Object.entries(input);
  if (entries.length > MAX_ENTRIES) {
    throw new ApiError(`${field} has too many entries`, 400);
  }

  const out = {};
  for (const [key, value] of entries) {
    if (!KEY.test(key)) throw new ApiError(`${field}.${key} is not a valid name`, 400);
    if (typeof value !== 'string' || !COLOR.test(value.trim())) {
      throw new ApiError(`${field}.${key} must be a hex, rgb() or hsl() colour`, 400);
    }
    out[key] = value.trim();
  }
  return Object.keys(out).length ? out : null;
};

const rampMap = (input) => {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('theme.ramps must be an object', 400);
  }

  const out = {};
  for (const [name, ramp] of Object.entries(input)) {
    if (!KEY.test(name)) throw new ApiError(`theme.ramps.${name} is not a valid name`, 400);
    // Ramp stops are numbers used as keys, so they need their own check.
    if (typeof ramp !== 'object' || Array.isArray(ramp) || ramp === null) {
      throw new ApiError(`theme.ramps.${name} must be an object of steps`, 400);
    }
    const steps = {};
    for (const [stop, value] of Object.entries(ramp)) {
      if (!/^\d{1,3}$/.test(stop)) throw new ApiError(`theme.ramps.${name}.${stop} is not a step`, 400);
      if (typeof value !== 'string' || !COLOR.test(value.trim())) {
        throw new ApiError(`theme.ramps.${name}.${stop} must be a colour`, 400);
      }
      steps[stop] = value.trim();
    }
    if (Object.keys(steps).length) out[name] = steps;
  }
  return Object.keys(out).length ? out : null;
};

/**
 * Validate a theme on its way in.
 *
 * `null` is meaningful: it is "use what the application ships with", which is
 * what Restore default sends. It is stored rather than treated as "no change",
 * so the column says what is active rather than what was last customised.
 */
const sanitizeTheme = (input) => {
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('theme must be an object or null', 400);
  }

  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_THEME_BYTES) {
    throw new ApiError('theme is too large', 400);
  }

  if (input.presetId !== undefined && input.presetId !== null
    && (typeof input.presetId !== 'string' || !PRESET_ID.test(input.presetId))) {
    throw new ApiError('theme.presetId is not a valid preset', 400);
  }
  if (input.mode !== undefined && !MODES.includes(input.mode)) {
    throw new ApiError(`theme.mode must be one of ${MODES.join(', ')}`, 400);
  }
  if (input.allowDarkMode !== undefined && typeof input.allowDarkMode !== 'boolean') {
    throw new ApiError('theme.allowDarkMode must be true or false', 400);
  }

  const theme = {
    presetId: input.presetId || null,
    mode: input.mode || 'light',
    allowDarkMode: input.allowDarkMode === true,
    seeds: colorMap(input.seeds, 'theme.seeds'),
    roles: colorMap(input.roles, 'theme.roles'),
    extended: colorMap(input.extended, 'theme.extended'),
    ramps: rampMap(input.ramps),
  };

  // Nothing chosen and nothing overridden is the default, stored as such.
  const customised = theme.seeds || theme.roles || theme.extended || theme.ramps;
  if (!theme.presetId && !customised && theme.mode === 'light' && !theme.allowDarkMode) return null;

  return theme;
};

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

  if (input.theme !== undefined) data.theme = sanitizeTheme(input.theme);

  for (const field of ['deliveryFee', 'freeDeliveryThreshold']) {
    if (input[field] === undefined) continue;
    data[field] = moneyField(input[field], field);
  }

  if (input.requireBuyerVerification !== undefined) {
    data.requireBuyerVerification = booleanField(input.requireBuyerVerification, 'requireBuyerVerification');
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError('Provide an app logo, product placeholder image, theme, checkout pricing or verification setting', 400);
  }
  return data;
};

/**
 * Whether checkout is gated on buyer ID verification right now.
 *
 * IDENTITY_VERIFICATION_REQUIRED=false in the environment still forces the
 * gate off (local development), otherwise the super admin's setting decides.
 */
const isBuyerVerificationRequired = async () => {
  if (!config.identity.requiredForCheckout) return false;
  const settings = await get();
  return settings.requireBuyerVerification !== false;
};

/**
 * The checkout pricing rule, as numbers. Used by the order service so the
 * fee an order is charged is the one the settings say, never a literal.
 */
const getCheckoutPricing = async () => {
  const settings = await get();
  return {
    deliveryFee: Number(settings.deliveryFee ?? DEFAULT_SETTINGS.deliveryFee),
  };
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

module.exports = { get, update, getCheckoutPricing, isBuyerVerificationRequired };
