/**
 * Turning a saved theme into colours on the screen.
 *
 * The stored theme is small — a preset id and whatever was changed on top of
 * it. Everything else is derived here and written to the root element as CSS
 * custom properties, which is the only place in the application that sets a
 * colour imperatively. Components never see any of this; they read var()
 * names from the stylesheet and get whatever is current.
 */

import { buildTokens } from './themeTokens';
import { DEFAULT_THEME, getPreset, DEFAULT_PRESET_ID } from './themePresets';
import { isColor, toHex } from './color';

export const THEME_CACHE_KEY = 'emoorm.theme.v1';
export const MODE_PREFERENCE_KEY = 'emoorm.theme.mode';

/* ── Normalising ──────────────────────────────────────────────────────────
   The theme arrives from an API response or from localStorage, so it is
   untrusted input in the ordinary sense: it may be stale, half-written by an
   older version, or simply not what we expect. Anything unrecognised is
   dropped rather than passed through to the DOM. */

const MODES = ['light', 'dark', 'system'];

const cleanColorMap = (input, allowedKeys) => {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowedKeys && !allowedKeys.includes(key)) continue;
    if (typeof value !== 'string' || !isColor(value)) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
};

const cleanRamps = (input) => {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const [name, ramp] of Object.entries(input)) {
    const cleaned = cleanColorMap(ramp);
    if (cleaned) out[name] = cleaned;
  }
  return Object.keys(out).length ? out : null;
};

export const normalizeTheme = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THEME };

  const presetId = getPreset(raw.presetId) ? raw.presetId : DEFAULT_PRESET_ID;
  return {
    presetId,
    mode: MODES.includes(raw.mode) ? raw.mode : 'light',
    allowDarkMode: raw.allowDarkMode === true,
    seeds: cleanColorMap(raw.seeds),
    roles: cleanColorMap(raw.roles),
    ramps: cleanRamps(raw.ramps),
    extended: cleanColorMap(raw.extended),
  };
};

/**
 * True when the theme is the untouched default.
 *
 * Worth knowing, because in that case nothing needs writing to the DOM at
 * all: the stylesheet already holds these values, and leaving them alone
 * means the page paints correctly before any JavaScript has run.
 */
export const isDefaultTheme = (theme) => {
  const t = normalizeTheme(theme);
  return t.presetId === DEFAULT_PRESET_ID
    && t.mode === 'light'
    && !t.seeds && !t.roles && !t.ramps && !t.extended;
};

/* ── Resolving ───────────────────────────────────────────────────────── */

/**
 * The palette a theme describes: the preset underneath, with the
 * administrator's own choices layered over it.
 */
export const resolvePalette = (theme) => {
  const t = normalizeTheme(theme);
  const preset = getPreset(t.presetId) || getPreset(DEFAULT_PRESET_ID);

  // A seed that has been changed must drop the preset's authored ramp for
  // that colour, or the authored values would win and the change would do
  // nothing. Only the ramps whose seed is untouched are kept.
  const authored = preset.ramps || {};
  const ramps = {};
  for (const [name, ramp] of Object.entries(authored)) {
    if (t.seeds && t.seeds[name]) continue;
    ramps[name] = ramp;
  }
  Object.assign(ramps, t.ramps || {});

  return {
    seeds: { ...preset.seeds, ...(t.seeds || {}) },
    ramps: Object.keys(ramps).length ? ramps : null,
    roles: t.roles || null,
    extended: { ...(preset.extended || {}), ...(t.extended || {}) },
  };
};

export const themeTokensFor = (theme, mode = 'light') => buildTokens(resolvePalette(theme), mode);

/* ── Applying ─────────────────────────────────────────────────────────── */

export const tokensToCssText = (tokens) => Object.entries(tokens)
  .map(([name, value]) => `${name}: ${value};`)
  .join('\n');

/** Write a token set onto an element's inline style. */
export const applyTokens = (tokens, element) => {
  const target = element || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return;
  for (const [name, value] of Object.entries(tokens)) {
    if (value) target.style.setProperty(name, value);
  }
};

/** Remove every token this module may have set, back to the stylesheet. */
export const clearTokens = (element) => {
  const target = element || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return;
  const { style } = target;
  for (let i = style.length - 1; i >= 0; i -= 1) {
    const name = style.item(i);
    if (name.startsWith('--t-') || name.startsWith('--surface-')
      || name.startsWith('--text-') || name.startsWith('--border-')
      || name.startsWith('--art-')) {
      style.removeProperty(name);
    }
  }
};

const prefersDark = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches
);

/** Which of light or dark a theme actually resolves to right now. */
export const effectiveMode = (theme) => {
  const t = normalizeTheme(theme);
  // Dark mode is off unless the administrator has turned it on. Until then
  // nobody can land in it by accident, whatever their browser prefers.
  if (!t.allowDarkMode) return 'light';

  // A viewer who has chosen for themselves outranks the default.
  const chosen = readModePreference() || t.mode;
  if (chosen === 'dark') return 'dark';
  if (chosen === 'system') return prefersDark() ? 'dark' : 'light';
  return 'light';
};

/**
 * Put a theme on the page.
 *
 * The default palette in light mode is a special case: the stylesheet
 * already says exactly this, so the tokens are cleared rather than rewritten.
 * That keeps the inline style attribute empty for the overwhelming majority
 * of installations, and means a bug here cannot break the default look.
 */
export const applyTheme = (theme, element) => {
  const t = normalizeTheme(theme);
  const mode = effectiveMode(t);
  const root = element || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!root) return mode;

  if (isDefaultTheme(t) && mode === 'light') {
    clearTokens(root);
  } else {
    clearTokens(root);
    applyTokens(themeTokensFor(t, mode), root);
  }

  root.setAttribute('data-theme', mode);
  root.style.setProperty('color-scheme', mode);
  return mode;
};

/* ── Persistence ──────────────────────────────────────────────────────────
   The saved theme lives on the server, so it follows an account to any
   device. A copy is kept here purely so a reload paints the right colours
   before the request that fetches it has come back — losing this cache costs
   one frame of default palette, nothing more. */

export const cacheTheme = (theme) => {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(normalizeTheme(theme)));
  } catch {
    /* Private window or blocked storage: the theme still applies this visit. */
  }
};

export const readCachedTheme = () => {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? normalizeTheme(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

/**
 * The viewer's own light/dark choice, when the theme allows one.
 *
 * Deliberately per browser rather than per account: this is a comfort
 * setting, like text size, and someone reading on a phone at night should
 * not be changing what their desktop does.
 */
export const readModePreference = () => {
  try {
    const value = localStorage.getItem(MODE_PREFERENCE_KEY);
    return MODES.includes(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeModePreference = (mode) => {
  try {
    if (MODES.includes(mode)) localStorage.setItem(MODE_PREFERENCE_KEY, mode);
    else localStorage.removeItem(MODE_PREFERENCE_KEY);
  } catch {
    /* Not worth surfacing; the choice holds for this page view. */
  }
};

/* ── Editing helpers ─────────────────────────────────────────────────── */

/** Tidy a value on its way into a stored theme: hex, lowercase, or dropped. */
export const cleanSeed = (value) => (isColor(value) ? toHex(value) : null);

/**
 * The theme a preset produces with nothing customised.
 *
 * Used by "Reset", which should return to the chosen preset rather than all
 * the way to the shipped default — those are different actions and the panel
 * offers both.
 */
export const themeFromPreset = (presetId, base = {}) => ({
  ...DEFAULT_THEME,
  mode: base.mode || 'light',
  allowDarkMode: base.allowDarkMode === true,
  presetId: getPreset(presetId) ? presetId : DEFAULT_PRESET_ID,
});
