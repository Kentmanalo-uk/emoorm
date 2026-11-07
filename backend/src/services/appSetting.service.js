const appSettingRepository = require('../repositories/appSetting.repository');
const config = require('../config/env');
const { cached, invalidate, TAGS } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');
const referralSettings = require('../lib/referralSettings');

const DEFAULT_SETTINGS = {
  id: 'global',
  appLogo: '/brand-icon.png',
  productPlaceholder: '/brand-icon.png',
  theme: null,
  deliveryFee: 50,
  // Delivery by distance: deliveryFee is the starting fee, covering the
  // first deliveryIncludedKm km by road; each km after costs deliveryPerKm.
  deliveryPerKm: 10,
  deliveryIncludedKm: 3,
  freeDeliveryThreshold: 500,
  requireBuyerVerification: true,
  categoryStyle: 'IMAGE',
  shortcutArtStyle: 'GLASS',
  shortcutIconScale: 100,
  mobileHeaderStyle: 'GLOW',
  mobileGlass: 'ALL',
  // Sign-in methods (email always on): Continue with mobile number starts off.
  loginGoogle: true,
  loginFacebook: true,
  loginPhone: false,
  availableTodayEnabled: true,
  adminTeamMax: 5,
  orderConfirmHours: 48,
  moormoveEnabled: false,
  product3dEnabled: true,
  // Invites: null is lib/referralSettings' defaults (all off).
  referralSettings: null,
};

// How the homepage shows its categories.
const CATEGORY_STYLES = ['IMAGE', 'ICON'];

// How the shortcut marks are drawn: coloured glass, or chunky glossy 3D.
const SHORTCUT_ART_STYLES = ['GLASS', 'POP'];

// Their size, as a percent of the standard one: a few steps, nothing between.
const SHORTCUT_ICON_SCALES = [85, 100, 115, 130];

// The header bars on phones: the pink-to-green wash, plain white, or green.
const MOBILE_HEADER_STYLES = ['GLOW', 'WHITE', 'GREEN'];
const MOBILE_GLASS = ['ALL', 'MENUS', 'OFF'];

// A switch is a boolean. "yes", 1 and "" are rejected rather than guessed
// at, because a mis-set checkout gate is not something to be lenient about.
const booleanField = (value, field) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ApiError(`${field} must be true or false`, 400);
};

// The window a new order waits for its shop, in hours (one hour to two weeks).
const MIN_CONFIRM_HOURS = 1;
const MAX_CONFIRM_HOURS = 24 * 14;

// Money fields are bounded so a typo cannot quote a six-figure delivery fee.
const MAX_MONEY = 99999;
// Delivery by distance: a fee per extra km, and the km a starting fee covers.
const MAX_PER_KM = 1000;
const MAX_KM = 100;
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

// `current`: the stored settings, for the settings kept as one JSON object
// (a change to one invite limit keeps the others).
const sanitize = (input = {}, current = null) => {
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

  // Delivery by distance, the defaults for every shop that leaves its own blank.
  if (input.deliveryPerKm !== undefined) {
    const n = Number(input.deliveryPerKm);
    if (input.deliveryPerKm === null || input.deliveryPerKm === '' || !Number.isFinite(n) || n < 0 || n > MAX_PER_KM) {
      throw new ApiError(`Each extra km must cost ₱0 to ₱${MAX_PER_KM}`, 400);
    }
    data.deliveryPerKm = Math.round(n * 100) / 100;
  }
  if (input.deliveryIncludedKm !== undefined) {
    const n = Number(input.deliveryIncludedKm);
    if (input.deliveryIncludedKm === null || input.deliveryIncludedKm === '' || !Number.isFinite(n) || n < 0 || n > MAX_KM) {
      throw new ApiError(`The km included must be 0 to ${MAX_KM}`, 400);
    }
    data.deliveryIncludedKm = Math.round(n * 10) / 10;
  }

  if (input.requireBuyerVerification !== undefined) {
    data.requireBuyerVerification = booleanField(input.requireBuyerVerification, 'requireBuyerVerification');
  }

  if (input.categoryStyle !== undefined) {
    const style = String(input.categoryStyle || '').toUpperCase();
    if (!CATEGORY_STYLES.includes(style)) {
      throw new ApiError('categoryStyle must be IMAGE or ICON', 400);
    }
    data.categoryStyle = style;
  }

  if (input.shortcutArtStyle !== undefined) {
    const look = String(input.shortcutArtStyle || '').toUpperCase();
    if (!SHORTCUT_ART_STYLES.includes(look)) {
      throw new ApiError('shortcutArtStyle must be GLASS or POP', 400);
    }
    data.shortcutArtStyle = look;
  }

  if (input.shortcutIconScale !== undefined) {
    const scale = Number(input.shortcutIconScale);
    if (input.shortcutIconScale === null || input.shortcutIconScale === '' || !SHORTCUT_ICON_SCALES.includes(scale)) {
      throw new ApiError(`shortcutIconScale must be one of ${SHORTCUT_ICON_SCALES.join(', ')}`, 400);
    }
    data.shortcutIconScale = scale;
  }

  if (input.mobileHeaderStyle !== undefined) {
    const style = String(input.mobileHeaderStyle || '').toUpperCase();
    if (!MOBILE_HEADER_STYLES.includes(style)) {
      throw new ApiError(`mobileHeaderStyle must be one of ${MOBILE_HEADER_STYLES.join(', ')}`, 400);
    }
    data.mobileHeaderStyle = style;
  }

  if (input.mobileGlass !== undefined) {
    const glass = String(input.mobileGlass || '').toUpperCase();
    if (!MOBILE_GLASS.includes(glass)) {
      throw new ApiError(`mobileGlass must be one of ${MOBILE_GLASS.join(', ')}`, 400);
    }
    data.mobileGlass = glass;
  }

  for (const field of ['loginGoogle', 'loginFacebook', 'loginPhone']) {
    if (input[field] !== undefined) data[field] = booleanField(input[field], field);
  }

  if (input.availableTodayEnabled !== undefined) {
    data.availableTodayEnabled = booleanField(input.availableTodayEnabled, 'availableTodayEnabled');
  }

  if (input.adminTeamMax !== undefined) {
    const max = Number(input.adminTeamMax);
    if (!Number.isInteger(max) || max < 1 || max > 20) {
      throw new ApiError('adminTeamMax must be a whole number from 1 to 20', 400);
    }
    data.adminTeamMax = max;
  }

  // How long a new order waits for its shop. Bounded at both ends: under an
  // hour and a shop asleep loses every order it was sent; over two weeks and
  // the buyer's money and the shop's stock sit held with nobody deciding.
  if (input.orderConfirmHours !== undefined) {
    const hours = Number(input.orderConfirmHours);
    if (!Number.isInteger(hours) || hours < MIN_CONFIRM_HOURS || hours > MAX_CONFIRM_HOURS) {
      throw new ApiError(`orderConfirmHours must be a whole number of hours from ${MIN_CONFIRM_HOURS} to ${MAX_CONFIRM_HOURS}`, 400);
    }
    data.orderConfirmHours = hours;
  }

  // MoorMove rider delivery for the whole marketplace (it also needs
  // MOORMOVE_API_URL and MOORMOVE_SECRET on the server).
  if (input.moormoveEnabled !== undefined) {
    data.moormoveEnabled = booleanField(input.moormoveEnabled, 'moormoveEnabled');
  }

  // 3D / AR product views (shape templates made in the seller's browser).
  if (input.product3dEnabled !== undefined) {
    data.product3dEnabled = booleanField(input.product3dEnabled, 'product3dEnabled');
  }

  // Invites: switches and limits, merged onto what is stored.
  if (input.referralSettings !== undefined) {
    data.referralSettings = referralSettings.merge(current?.referralSettings, input.referralSettings);
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError('Provide an app logo, product placeholder image, theme, checkout pricing, delivery by distance, verification, category style, Available Today, admin team, order confirm window, MoorMove, 3D views or invites setting', 400);
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
    // Delivery by distance (see deliveryQuote.service).
    deliveryPerKm: Number(settings.deliveryPerKm ?? DEFAULT_SETTINGS.deliveryPerKm),
    deliveryIncludedKm: Number(settings.deliveryIncludedKm ?? DEFAULT_SETTINGS.deliveryIncludedKm),
  };
};

/**
 * How many hours a new order waits for its shop before it cancels itself.
 *
 * The order service asks this rather than holding a constant, so changing it
 * in Settings takes effect on the next sweep without a deploy. A database
 * that has not had the column yet reads as the old default, which is the
 * same number, so nothing changes until a super admin says so.
 */
const getOrderConfirmHours = async () => {
  const settings = await get();
  const hours = Number(settings.orderConfirmHours);
  return Number.isInteger(hours) && hours >= MIN_CONFIRM_HOURS && hours <= MAX_CONFIRM_HOURS
    ? hours
    : DEFAULT_SETTINGS.orderConfirmHours;
};

// referralSettings comes out whole (every key, defaults filled in), so the
// apps and the server read the same values.
const get = async () => {
  const settings = await cached.appSettings({}, async () => {
    const row = await appSettingRepository.findGlobal();
    return row || DEFAULT_SETTINGS;
  });
  return { ...settings, referralSettings: referralSettings.read(settings.referralSettings) };
};

const update = async (input) => {
  // The stored row, not get(): the JSON is merged onto what is really stored.
  const current = input?.referralSettings !== undefined ? await appSettingRepository.findGlobal() : null;
  const settings = await appSettingRepository.upsertGlobal(sanitize(input, current));
  await invalidate(TAGS.appSettings);
  // MoorMove switched on or off: its status and the shops it makes ready to
  // sell are asked afresh.
  if (input && input.moormoveEnabled !== undefined) {
    require('./moormove.client').clearStatusCache();
    require('./shopReadiness.service').forget();
  }
  return { ...settings, referralSettings: referralSettings.read(settings.referralSettings) };
};

/**
 * Whether a sign-in method is switched on: 'google', 'facebook' or 'phone'.
 * (Email sign-in has no switch: it always works.)
 */
const isLoginMethodOn = async (method) => {
  const field = { google: 'loginGoogle', facebook: 'loginFacebook', phone: 'loginPhone' }[method];
  if (!field) return false;
  const value = (await get())[field];
  return typeof value === 'boolean' ? value : Boolean(DEFAULT_SETTINGS[field]);
};

module.exports = {
  get, update, getCheckoutPricing, isBuyerVerificationRequired, getOrderConfirmHours, isLoginMethodOn,
};
