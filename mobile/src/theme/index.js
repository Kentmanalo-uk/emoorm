// Ported from web/src/styles/colors.css + spacing.css so mobile visually matches web.
export const colors = {
  primary: '#22c55e',
  primaryDark: '#16a34a',
  primaryLight: '#4ade80',
  primaryLighter: '#bbf7d0',

  secondary: '#059669',
  secondaryDark: '#047857',

  accentOrange: '#fb923c',
  accentRed: '#ef4444',
  accentYellow: '#fbbf24',

  white: '#ffffff',
  black: '#000000',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  bgPrimary: '#ffffff',
  bgSecondary: '#f9fafb',
  bgGreenLight: '#f0fdf4',

  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textWhite: '#ffffff',

  borderLight: '#e5e7eb',
  borderMedium: '#d1d5db',
  borderDark: '#9ca3af',

  star: '#fbbf24',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  base: 4,
  lg: 8,
  full: 999,
};

// Maps CSS-style numeric weights to the specific Inter static font files loaded in app/_layout.js.
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
};

export const typography = {
  h1: { fontSize: 24, fontWeight: '700', fontFamily: fontFamily.bold },
  h2: { fontSize: 20, fontWeight: '700', fontFamily: fontFamily.bold },
  h3: { fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
  body: { fontSize: 14, fontWeight: '400', fontFamily: fontFamily.regular },
  caption: { fontSize: 12, fontWeight: '400', fontFamily: fontFamily.regular },
};
