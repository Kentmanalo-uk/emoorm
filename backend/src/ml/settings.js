const { ApiError } = require('../middleware/errorHandler');
const { MODULES, isBuilt } = require('./modules');

/**
 * The super admin's ML switches, stored as one JSON column
 * (app_settings.ml_settings), read and merged like lib/referralSettings.
 *
 *   { enabled: false, modules: { recommendations: false, ... } }
 *
 * `enabled` is the whole engine; a module runs only when both it and the
 * engine are on. Null, a key left out, or anything not understood is off,
 * so a new database or a new module starts off.
 */

const KEYS = MODULES.map((m) => m.key);

const DEFAULTS = Object.freeze({
  enabled: false,
  modules: Object.freeze(Object.fromEntries(KEYS.map((k) => [k, false]))),
});

/** The settings in force: stored values that are valid, off for the rest. */
const read = (stored) => {
  const out = { enabled: false, modules: { ...DEFAULTS.modules } };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
  if (typeof stored.enabled === 'boolean') out.enabled = stored.enabled;
  const mods = stored.modules;
  if (mods && typeof mods === 'object' && !Array.isArray(mods)) {
    for (const key of KEYS) if (typeof mods[key] === 'boolean') out.modules[key] = mods[key];
  }
  return out;
};

/**
 * A change from the ML page, checked, on top of what is stored. Anything not
 * understood is refused rather than dropped, as the other settings are. A
 * module that is not built yet cannot be switched on.
 * @param {Object|null} current - the stored JSON
 * @param {Object} input - { enabled?, modules?: { key: boolean } }
 */
const merge = (current, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('mlSettings must be an object', 400);
  }
  const out = read(current);
  for (const [key, value] of Object.entries(input)) {
    if (key === 'enabled') {
      if (typeof value !== 'boolean') throw new ApiError('mlSettings.enabled must be true or false', 400);
      out.enabled = value;
    } else if (key === 'modules') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError('mlSettings.modules must be an object', 400);
      }
      for (const [mod, on] of Object.entries(value)) {
        if (!KEYS.includes(mod)) throw new ApiError(`mlSettings.modules.${mod} is not a module`, 400);
        if (typeof on !== 'boolean') throw new ApiError(`mlSettings.modules.${mod} must be true or false`, 400);
        if (on && !isBuilt(mod)) throw new ApiError(`${mod} is not available yet`, 400);
        out.modules[mod] = on;
      }
    } else {
      throw new ApiError(`mlSettings.${key} is not a setting`, 400);
    }
  }
  return out;
};

/**
 * Whether a module (or, with no key, the engine) is on right now. Reads the
 * cached settings; any failure reads as off, so the shop never waits on it.
 */
const isOn = async (key) => {
  try {
    const settings = read((await require('../services/appSetting.service').get()).mlSettings);
    if (!settings.enabled) return false;
    return key ? settings.modules[key] === true && isBuilt(key) : true;
  } catch {
    return false;
  }
};

module.exports = {
  DEFAULTS, KEYS, read, merge, isOn,
};
