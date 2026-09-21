/**
 * The theme token catalogue.
 *
 * One place that knows every colour the interface can use, what each one is
 * for, and what it is by default. Stylesheets read these through var(); no
 * page or component decides a colour for itself, so changing the palette in
 * Settings changes the whole application rather than the parts someone
 * remembered to update.
 *
 * Three layers, each built from the one above:
 *
 *   seeds   eleven colours an administrator actually picks
 *   ramps   50-950 steps derived from each seed (or authored, for presets)
 *   roles   --surface-card, --text-muted, --border-default and friends,
 *           which is what the stylesheets should name
 *
 * The defaults below are the palette the application shipped with, value for
 * value, so "Restore default" is a genuine restore and not an approximation.
 */

import {
  buildRamp, buildNeutralRamp, readableOn, mix, withAlpha,
} from './color';

/* ── Ramps ───────────────────────────────────────────────────────────── */

export const RAMP_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// Surfaces need a true white and one step between 100 and 200, which is where
// most of the app's hairlines and card backs sit.
export const NEUTRAL_STOPS = [0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export const DEFAULT_RAMPS = {
  // The brand emerald. #059669 is the colour on almost every button in the app.
  primary: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#052e1f',
  },
  // The deeper forest green used for headers, the footer and dark panels.
  secondary: {
    50: '#e9f7f0',
    100: '#d7ecdf',
    200: '#aedcc0',
    300: '#7cc79b',
    400: '#48ae76',
    500: '#29a366',
    600: '#1f8a54',
    700: '#176b3a',
    800: '#006927',
    900: '#0b5c38',
    950: '#17231c',
  },
  // Pink: saved items, promotional strips, count badges. Used sparingly so
  // the interface is not solid green.
  accent: {
    50: '#fdf2f8',
    100: '#fce7f3',
    200: '#fbcfe8',
    300: '#f9a8d4',
    400: '#f472b6',
    500: '#ec4899',
    600: '#db2777',
    700: '#be185d',
    800: '#9d174d',
    900: '#831843',
    950: '#500724',
  },
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    950: '#052e16',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },
  info: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  neutral: {
    0: '#ffffff',
    50: '#f9fafb',
    100: '#f3f4f6',
    150: '#eef0f3',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
};

/**
 * Status and chart colours outside the eight ramps.
 *
 * Order statuses and donut segments need more hues than a brand palette
 * provides, and they have to stay distinguishable from one another. A preset
 * may replace them; the custom editor leaves them alone, because picking six
 * mutually distinguishable hues by hand is a job for whoever designs a preset.
 */
export const DEFAULT_EXTENDED = {
  '--t-violet-100': '#ede9fe',
  '--t-violet-500': '#8b5cf6',
  '--t-violet-600': '#7c3aed',
  '--t-violet-700': '#6d28d9',
  '--t-sky-100': '#e0f2fe',
  '--t-sky-500': '#0ea5e9',
  '--t-sky-600': '#0284c7',
  '--t-sky-700': '#0e6f95',
  '--t-orange-100': '#ffedd5',
  '--t-orange-500': '#f97316',
  '--t-orange-700': '#c2410c',
  '--t-teal-500': '#14b8a6',
  '--t-teal-600': '#0891b2',
  '--t-indigo-600': '#4338ca',
  '--t-teal-700': '#155e75',
  '--t-indigo-500': '#4f46e5',
  '--t-indigo-700': '#3730a3',
};

/* ── Seeds ────────────────────────────────────────────────────────────────
   What the custom-palette editor shows. Each one names the ramp it drives,
   so a new seed is a row here and nothing else. */

export const SEEDS = [
  {
    key: 'primary',
    ramp: 'primary',
    group: 'Brand',
    label: 'Primary',
    help: 'Buttons, links, active navigation, focus rings.',
  },
  {
    key: 'secondary',
    ramp: 'secondary',
    group: 'Brand',
    label: 'Secondary',
    help: 'Deep surfaces — the footer, headers and dark panels.',
  },
  {
    key: 'accent',
    ramp: 'accent',
    group: 'Brand',
    label: 'Accent',
    help: 'Saved items, promotions and count badges.',
  },
  {
    key: 'neutral',
    ramp: 'neutral',
    group: 'Foundation',
    label: 'Neutral',
    help: 'Greys behind every surface, border and line of text.',
    neutral: true,
  },
  {
    key: 'success',
    ramp: 'success',
    group: 'Status',
    label: 'Success',
    help: 'Completed orders, approvals, positive figures.',
  },
  {
    key: 'warning',
    ramp: 'warning',
    group: 'Status',
    label: 'Warning',
    help: 'Pending work, low stock, things needing attention.',
  },
  {
    key: 'danger',
    ramp: 'danger',
    group: 'Status',
    label: 'Danger',
    help: 'Cancellations, suspensions, destructive actions.',
  },
  {
    key: 'info',
    ramp: 'info',
    group: 'Status',
    label: 'Info',
    help: 'Notices, tips and neutral announcements.',
  },
];

/**
 * Role overrides.
 *
 * These follow the neutral ramp unless someone sets them, which covers the
 * common case — "the page is a bit too grey" — without making anyone rebuild
 * a neutral ramp to get there.
 */
export const ROLE_SEEDS = [
  {
    key: 'surfacePage',
    token: '--surface-page',
    group: 'Surfaces',
    label: 'Page background',
    from: ['neutral', 50],
  },
  {
    key: 'surfaceCard',
    token: '--surface-card',
    group: 'Surfaces',
    label: 'Card surface',
    from: ['neutral', 0],
  },
  {
    key: 'textStrong',
    token: '--text-strong',
    group: 'Text',
    label: 'Heading text',
    from: ['neutral', 900],
  },
  {
    key: 'textMuted',
    token: '--text-muted',
    group: 'Text',
    label: 'Muted text',
    from: ['neutral', 500],
  },
  {
    key: 'borderDefault',
    token: '--border-default',
    group: 'Lines',
    label: 'Borders and dividers',
    from: ['neutral', 200],
  },
];

/* ── Building the token set ──────────────────────────────────────────── */

const rampTokens = (name, ramp) => {
  const out = {};
  for (const [stop, value] of Object.entries(ramp)) out[`--t-${name}-${stop}`] = value;
  return out;
};

/**
 * Mirror a ramp for dark mode.
 *
 * Stylesheets encode a colour's job in its position: a 50 is a tint behind a
 * badge, a 700 is text on top of it. Swapping the two ends preserves those
 * jobs when the background goes dark, which is what makes one palette serve
 * both modes without every rule being rewritten by hand.
 */
const MIRROR = {
  50: 950, 100: 900, 150: 800, 200: 800, 300: 700, 400: 600,
  500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50,
};

const mirrorRamp = (ramp) => {
  const out = {};
  for (const stop of Object.keys(ramp)) {
    const source = MIRROR[stop] ?? stop;
    out[stop] = ramp[source] ?? ramp[stop];
  }
  return out;
};

/**
 * The dark neutral ramp is authored rather than mirrored.
 *
 * A mirrored light grey gives you pure black surfaces and pure white text,
 * which is the classic too-harsh dark mode. These are lifted off black and
 * carry the palette's own hue so the greys sit with the brand rather than
 * against it.
 */
const DARK_NEUTRAL_LIGHTNESS = {
  0: 0.07, 50: 0.09, 100: 0.115, 150: 0.14, 200: 0.175, 300: 0.24,
  400: 0.42, 500: 0.6, 600: 0.71, 700: 0.8, 800: 0.88, 900: 0.95, 950: 1,
};

const darkNeutralRamp = (lightRamp) => {
  const base = buildNeutralRamp(lightRamp[500] || '#6b7280') || {};
  const out = {};
  for (const stop of NEUTRAL_STOPS) {
    // Re-light the neutral at the dark target while keeping its hue cast.
    const reference = base[500] || lightRamp[500] || '#6b7280';
    const target = DARK_NEUTRAL_LIGHTNESS[stop];
    out[stop] = target >= 0.5
      ? mix(reference, '#ffffff', (target - 0.5) / 0.5)
      : mix(reference, '#05070a', (0.5 - target) / 0.5);
  }
  return out;
};

// buildNeutralRamp covers 50-950; surfaces also need 0 and 150.
const neutralRampWithStops = (seed) => {
  const ramp = buildNeutralRamp(seed);
  if (!ramp) return null;
  return {
    ...ramp,
    0: mix(ramp[50], '#ffffff', 0.85),
    150: mix(ramp[100], ramp[200], 0.5),
  };
};
const resolveRamps = (palette, mode) => {
  const ramps = {};
  for (const seed of SEEDS) {
    const authored = palette?.ramps?.[seed.ramp];
    const picked = palette?.seeds?.[seed.key];
    let ramp = authored
      || (picked && (seed.neutral ? neutralRampWithStops(picked) : buildRamp(picked)))
      || DEFAULT_RAMPS[seed.ramp];
    if (mode === 'dark') {
      ramp = seed.neutral ? darkNeutralRamp(ramp) : mirrorRamp(ramp);
    }
    ramps[seed.ramp] = ramp;
  }
  return ramps;
};


/**
 * Every CSS custom property the application reads, as a flat object.
 *
 * `mode` is 'light' or 'dark'. The result is what gets written to the root
 * element — or to a preview container, which is the same code path, so what
 * the preview shows is what applying would do.
 */
export const buildTokens = (palette = {}, mode = 'light') => {
  const ramps = resolveRamps(palette, mode);
  const dark = mode === 'dark';
  const tokens = {};

  for (const [name, ramp] of Object.entries(ramps)) Object.assign(tokens, rampTokens(name, ramp));
  Object.assign(tokens, DEFAULT_EXTENDED, palette?.extended || {});

  const n = ramps.neutral;
  const at = (key, fallback) => palette?.roles?.[key] || fallback;

  /* Surfaces ------------------------------------------------------------ */
  tokens['--surface-page'] = at('surfacePage', n[50]);
  tokens['--surface-card'] = at('surfaceCard', n[0]);
  tokens['--surface-sunken'] = n[100];
  tokens['--surface-muted'] = n[150];
  tokens['--surface-raised'] = tokens['--surface-card'];
  tokens['--surface-inverse'] = dark ? n[800] : n[900];
  tokens['--surface-overlay'] = withAlpha(dark ? '#000000' : n[900], dark ? 0.66 : 0.45);

  /* Text ---------------------------------------------------------------- */
  tokens['--text-strong'] = at('textStrong', n[900]);
  tokens['--text-body'] = n[700];
  tokens['--text-muted'] = at('textMuted', n[500]);
  tokens['--text-subtle'] = n[400];
  tokens['--text-inverse'] = n[0];
  tokens['--text-link'] = ramps.primary[600];

  /* Lines --------------------------------------------------------------- */
  tokens['--border-subtle'] = n[150];
  tokens['--border-default'] = at('borderDefault', n[200]);
  tokens['--border-strong'] = n[300];
  tokens['--border-focus'] = ramps.primary[600];

  /* Text on a filled colour ---------------------------------------------
     Measured against step 600, because that is the step a filled button
     actually uses. The ramps have already been mirrored for dark mode, so
     600 is whatever is right for the current mode and reaching for a
     different step here would undo that. */
  const onOptions = [n[0], n[900]];
  for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'info']) {
    tokens[`--t-on-${name}`] = readableOn(ramps[name][600], onOptions);
  }

  /* Illustrations -------------------------------------------------------- */
  Object.assign(tokens, artTokens(ramps, mode));

  return tokens;
};

/**
 * Colours for the empty-state drawings.
 *
 * They are their own tokens rather than reusing the interface ones because a
 * drawing needs a flatter, softer range than a control does: a button can be
 * full-strength brand, a shape filling a third of an illustration cannot.
 */
export const artTokens = (ramps, mode = 'light') => {
  const dark = mode === 'dark';
  const n = ramps.neutral;
  const p = ramps.primary;
  const w = ramps.warning;

  return {
    '--art-paper': dark ? n[100] : n[0],
    '--art-surface': dark ? n[150] : mix(n[0], n[50], 0.5),
    '--art-neutral-100': dark ? n[200] : n[100],
    '--art-neutral-200': dark ? n[300] : mix(n[100], n[200], 0.5),
    '--art-neutral-300': dark ? n[400] : n[200],
    // Straight steps: the ramp is already the right way round for the
    // mode, so the drawing keeps its own light-to-dark structure either way.
    '--art-brand-200': p[200],
    '--art-brand-300': p[300],
    '--art-brand-400': p[400],
    '--art-brand-600': p[600],
    '--art-brand-700': p[700],
    '--art-brand-900': p[900],
    '--art-accent-400': w[400],
    '--art-accent-500': w[500],
  };
};

/**
 * The pairs the contrast checker reports on.
 *
 * Deliberately short: these are the combinations that appear on essentially
 * every screen, so a palette that passes them is readable, and a list long
 * enough to always contain one failure is a list nobody reads.
 */
export const CONTRAST_CHECKS = [
  { label: 'Heading text on page', fg: '--text-strong', bg: '--surface-page' },
  { label: 'Body text on card', fg: '--text-body', bg: '--surface-card' },
  { label: 'Muted text on card', fg: '--text-muted', bg: '--surface-card' },
  { label: 'Label on primary button', fg: '--t-on-primary', bg: '--t-primary-600' },
  { label: 'Label on danger button', fg: '--t-on-danger', bg: '--t-danger-600' },
  { label: 'Link on card', fg: '--text-link', bg: '--surface-card' },
  { label: 'Success text on its tint', fg: '--t-success-700', bg: '--t-success-50' },
  { label: 'Warning text on its tint', fg: '--t-warning-800', bg: '--t-warning-50' },
  { label: 'Danger text on its tint', fg: '--t-danger-700', bg: '--t-danger-50' },
  { label: 'Focus ring on card', fg: '--border-focus', bg: '--surface-card', size: 'large' },
];
