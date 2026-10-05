/*
 * The website's design tokens (web/src/styles/tokens.css, typography.css),
 * so the app paints exactly like the website's phone view.
 *
 *   t.primary[600]   the ramps, as --t-<ramp>-<stop> on the website
 *   surface / text / border   what a colour is for (--surface-*, --text-*, --border-*)
 *   colors           the names older screens use, now pointing at the tokens
 *
 * When porting a screen, read the website's CSS and use the token it names:
 * `var(--t-primary-600, …)` → t.primary[600]; `var(--t-neutral-150)` → t.neutral[150].
 */

export const t = {
  primary: {
    50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
    600: '#047857', 700: '#03684c', 800: '#065f46', 900: '#064e3b', 950: '#052e1f',
  },
  secondary: {
    50: '#e9f7f0', 100: '#d7ecdf', 200: '#aedcc0', 300: '#7cc79b', 400: '#48ae76', 500: '#29a366',
    600: '#178048', 700: '#176b3a', 800: '#006927', 900: '#0b5c38', 950: '#17231c',
  },
  accent: {
    50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899',
    600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724',
  },
  success: {
    50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e',
    600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16',
  },
  warning: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b',
    600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03',
  },
  danger: {
    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
    600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
  },
  info: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6',
    600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
  },
  neutral: {
    0: '#ffffff', 50: '#f9fafb', 100: '#f3f4f6', 150: '#eef0f3', 200: '#e5e7eb', 300: '#d1d5db',
    400: '#9ca3af', 500: '#636b78', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712',
  },
  violet: { 100: '#ede9fe', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  sky: { 100: '#e0f2fe', 500: '#0ea5e9', 600: '#0284c7', 700: '#0e6f95' },
  orange: { 100: '#ffedd5', 500: '#f97316', 700: '#c2410c' },
  teal: { 500: '#14b8a6', 600: '#0891b2', 700: '#155e75' },
  indigo: { 500: '#4f46e5', 600: '#4338ca', 700: '#3730a3' },
};

export const surface = {
  page: '#f9fafb',
  card: '#ffffff',
  sunken: '#f3f4f6',
  muted: '#eef0f3',
  raised: '#ffffff',
  inverse: '#111827',
  overlay: 'rgba(17, 24, 39, 0.45)',
};

export const text = {
  strong: '#111827',
  body: '#374151',
  muted: '#636b78',
  subtle: '#636b78',
  inverse: '#ffffff',
  link: '#047857',
};

export const border = {
  subtle: '#eef0f3',
  default: '#e5e7eb',
  strong: '#d1d5db',
  focus: '#047857',
};

// The names older screens use, now on the website's palette.
export const colors = {
  primary: t.primary[600],
  primaryDark: t.primary[700],
  primaryLight: t.primary[500],
  primaryLighter: t.primary[100],

  secondary: t.primary[600],
  secondaryDark: t.primary[700],

  accent: t.accent[600],
  accentOrange: t.orange[500],
  accentRed: t.danger[500],
  accentYellow: t.warning[400],

  white: '#ffffff',
  black: '#000000',
  gray50: t.neutral[50],
  gray100: t.neutral[100],
  gray200: t.neutral[200],
  gray300: t.neutral[300],
  gray400: t.neutral[400],
  gray500: t.neutral[500],
  gray600: t.neutral[600],
  gray700: t.neutral[700],
  gray800: t.neutral[800],
  gray900: t.neutral[900],

  success: t.success[500],
  warning: t.warning[500],
  error: t.danger[500],
  info: t.info[500],

  bgPrimary: t.neutral[0],
  bgSecondary: t.neutral[100],
  bgGreenLight: t.primary[50],

  textPrimary: text.strong,
  textSecondary: t.neutral[600],
  textMuted: text.muted,
  textWhite: '#ffffff',

  borderLight: border.default,
  borderMedium: border.strong,
  borderDark: t.neutral[400],

  star: t.warning[500],
};

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

export const shadow = {
  subtle: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
};
