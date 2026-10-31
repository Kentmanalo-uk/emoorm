/*
 * The website's design tokens (web/src/styles/tokens.css, typography.css),
 * so the app paints exactly like the website's phone view — in light mode
 * and in dark mode.
 *
 *   t.primary[600]   the ramps, as --t-<ramp>-<stop> on the website
 *   surface / text / border   what a colour is for (--surface-*, --text-*, --border-*)
 *   colors           the names older screens use, now pointing at the tokens
 *
 * When porting a screen, read the website's CSS and use the token it names:
 * `var(--t-primary-600, …)` → t.primary[600]; `var(--t-neutral-150)` → t.neutral[150].
 *
 * ── Dark mode ───────────────────────────────────────────────────────────
 * Every colour here is read from the palette that is active *now*, not
 * copied when the module loads, so the same token gives the right colour in
 * either mode. Two rules make that work:
 *
 *   1. In JSX, use the tokens directly: `color={t.neutral[700]}`. They are
 *      read on each render, so they follow the mode on their own.
 *   2. For a StyleSheet, wrap it in `themed()`:
 *
 *        const styles = themed(() => StyleSheet.create({ … }));
 *
 *      StyleSheet.create runs once and freezes the colours it was given, so
 *      a plain stylesheet would keep the mode the app started in. themed()
 *      builds one sheet per mode and hands out the one in use, so
 *      `styles.card` is always the right sheet.
 *
 * ThemeGate (src/theme/ThemeGate.js) re-renders the app when the mode
 * changes, and src/store/themeStore.js remembers the choice.
 */
import { useSyncExternalStore } from 'react';
import { PALETTES } from './palettes';

/* ── Which palette is live ─────────────────────────────────────────────── */

let active = 'light';
const listeners = new Set();

/** 'light' or 'dark' — the palette being painted right now. */
export const activeScheme = () => active;

/**
 * Swap the palette. Called by ThemeGate; screens never call this.
 *
 * The swap itself takes effect at once, so a stylesheet built later in the
 * same render already reads the new palette. Subscribers are told afterwards
 * rather than during, because this is called while ThemeGate renders and
 * React will not have a component update another mid-render.
 */
export const setActiveScheme = (scheme) => {
  const next = scheme === 'dark' ? 'dark' : 'light';
  if (next === active) return;
  active = next;
  const tell = () => listeners.forEach((fn) => fn());
  if (typeof queueMicrotask === 'function') queueMicrotask(tell); else setTimeout(tell, 0);
};

export const subscribeScheme = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Re-renders the caller when the palette changes. */
export const useScheme = () => useSyncExternalStore(subscribeScheme, activeScheme, activeScheme);

const palette = () => PALETTES[active];

/* ── The tokens ────────────────────────────────────────────────────────── */

/* Each token object is read through on access, so a colour is never captured
   at import time. Spreading one (`{ ...t.primary }`) still works and gives
   the values of the palette in use at that moment. */
const liveGroup = (name) => new Proxy({}, {
  get: (_, key) => palette()[name][key],
  has: (_, key) => key in palette()[name],
  ownKeys: () => Reflect.ownKeys(palette()[name]),
  getOwnPropertyDescriptor: (_, key) => ({
    value: palette()[name][key], enumerable: true, configurable: true,
  }),
});

const RAMPS = ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'info', 'neutral', 'violet', 'sky', 'orange', 'teal', 'indigo'];
const ramps = Object.fromEntries(RAMPS.map((name) => [name, liveGroup(name)]));

/*
 * `t.onBrand` is the label on a filled brand button or badge — white on the
 * deep greens of light mode, near-black on the bright mint of dark mode.
 * Use it wherever text sits on primary/accent/danger/success fill; plain
 * white there is unreadable once the fill brightens.
 */
export const t = new Proxy(ramps, {
  get: (target, key) => (key === 'onBrand' ? palette().onBrand : target[key]),
  has: (target, key) => key === 'onBrand' || key in target,
});
export const surface = liveGroup('surface');
export const text = liveGroup('text');
export const border = liveGroup('border');

// The names older screens use, now on the website's palette.
const COLOR_MAP = {
  primary: ['primary', 600], primaryDark: ['primary', 700], primaryLight: ['primary', 500], primaryLighter: ['primary', 100],
  secondary: ['primary', 600], secondaryDark: ['primary', 700],
  accent: ['accent', 600], accentOrange: ['orange', 500], accentRed: ['danger', 500], accentYellow: ['warning', 400],
  gray50: ['neutral', 50], gray100: ['neutral', 100], gray200: ['neutral', 200], gray300: ['neutral', 300],
  gray400: ['neutral', 400], gray500: ['neutral', 500], gray600: ['neutral', 600], gray700: ['neutral', 700],
  gray800: ['neutral', 800], gray900: ['neutral', 900],
  success: ['success', 500], warning: ['warning', 500], error: ['danger', 500], info: ['info', 500],
  bgPrimary: ['neutral', 0], bgSecondary: ['neutral', 100], bgGreenLight: ['primary', 50],
  textSecondary: ['neutral', 600], borderDark: ['neutral', 400], star: ['warning', 500],
};
const COLOR_ROLES = {
  textPrimary: ['text', 'strong'], textMuted: ['text', 'muted'],
  borderLight: ['border', 'default'], borderMedium: ['border', 'strong'],
};
// white/black stay literal: they are used where a colour must not flip
// (text on a brand-green button, a photo's backing).
const COLOR_FIXED = { white: '#ffffff', black: '#000000', textWhite: '#ffffff' };

export const colors = new Proxy({}, {
  get: (_, key) => {
    if (key in COLOR_FIXED) return COLOR_FIXED[key];
    if (key in COLOR_MAP) { const [ramp, stop] = COLOR_MAP[key]; return palette()[ramp][stop]; }
    if (key in COLOR_ROLES) { const [group, role] = COLOR_ROLES[key]; return palette()[group][role]; }
    return undefined;
  },
  has: (_, key) => key in COLOR_FIXED || key in COLOR_MAP || key in COLOR_ROLES,
  ownKeys: () => [...Object.keys(COLOR_FIXED), ...Object.keys(COLOR_MAP), ...Object.keys(COLOR_ROLES)],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/**
 * The card colour at part opacity, for a bar, sheet or pill that lies over
 * the page and lets it show through: `veil(0.98)` is near-white on a light
 * page and the dark card colour on a dark one. A plain
 * `rgba(255, 255, 255, …)` would stay white in dark mode.
 */
export const veil = (alpha) => `rgba(${palette().cardRgb}, ${alpha})`;

/**
 * The ink colour at part opacity, for a hairline, a soft shadow or a faint
 * wash that has to read against the page it sits on.
 *
 * This is NOT for the dim behind a sheet or over a photo: that is meant to
 * be dark in either mode, so it stays a plain rgba (or surface.overlay).
 */
export const ink = (alpha) => `rgba(${palette().inkRgb}, ${alpha})`;

/* ── Stylesheets that follow the mode ──────────────────────────────────── */

/**
 * One copy per palette, built the first time that palette is painted.
 *
 *   const styles = themed(() => StyleSheet.create({ … }));
 *   const TONES = themed(() => ({ good: { bg: t.primary[50] } }));
 *
 * `styles.card` and `TONES.good` read the copy for the palette in use, so
 * the same name gives light or dark colours without the screen doing
 * anything. Copies are kept, so switching back and forth costs nothing after
 * the first time.
 *
 * ── Read it key by key; never hand the whole thing over ──────────────────
 * `styles.card` is a plain object, and a different one in each palette, so
 * React Native may freeze it (it deep-freezes every style it is given in
 * development) without that costing anything: the other palette has an
 * object of its own.
 *
 * `styles` itself is a stand-in that answers property reads. Passing it
 * somewhere as a value — `style={styles}`, `fallbackStyle={LOOK}` — hands
 * that one object to React Native, which freezes it and replaces its
 * answers with the colours of the moment. For a single style that a
 * component needs whole, write a function that returns a fresh object
 * instead, and call it where it is used.
 */
export const themed = (build) => {
  const copies = {};
  const copy = () => (copies[active] || (copies[active] = build()));
  return new Proxy({}, {
    get: (_, key) => copy()[key],
    has: (_, key) => key in copy(),
    ownKeys: () => Reflect.ownKeys(copy()),
    getOwnPropertyDescriptor: (_, key) => ({ value: copy()[key], enumerable: true, configurable: true }),
  });
};

/* ── Everything below carries no colour, so it never changes ───────────── */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
};

export const radius = {
  base: 4,
  lg: 8,
  md: 12,
  xl: 16,
  full: 999,
};

// DM Sans, the website's font: one family per weight (loaded in app/_layout.js).
export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  extraBold: 'DMSans_800ExtraBold',
};

/** A text style at a CSS weight: font(500) → DM Sans Medium. */
export const font = (weight = 400) => {
  const w = Number(weight);
  const family = w >= 800 ? fontFamily.extraBold
    : w >= 700 ? fontFamily.bold
      : w >= 600 ? fontFamily.semiBold
        : w >= 500 ? fontFamily.medium
          : fontFamily.regular;
  // React Native on Android picks the face by family alone; fontWeight stays
  // for iOS and the web build.
  return { fontFamily: family, fontWeight: String(w >= 800 ? 800 : w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400) };
};

export const typography = {
  h1: { fontSize: 28, lineHeight: 34, ...font(500) },
  h2: { fontSize: 22, lineHeight: 28, ...font(500) },
  h3: { fontSize: 17, lineHeight: 22, ...font(500) },
  body: { fontSize: 15, lineHeight: 21, ...font(400) },
  caption: { fontSize: 13, lineHeight: 17, ...font(400) },
};

export const control = {
  height: 48,
  compactHeight: 44,
  iconSize: 44,
};

/* The shadow carries a colour, so it is read through like the tokens. */
const shadowFor = (kind, offset, radiusPx, elevation) => ({
  get shadowColor() { return palette().shadowColor; },
  shadowOffset: { width: 0, height: offset },
  get shadowOpacity() { return palette().shadowOpacity[kind]; },
  shadowRadius: radiusPx,
  elevation,
});

export const shadow = {
  subtle: shadowFor('subtle', 1, 4, 1),
  card: shadowFor('card', 2, 10, 3),
};
