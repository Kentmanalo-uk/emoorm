// Ported from web/src/styles/colors.css + spacing.css so mobile visually matches web.
export const colors = {
  primary: '#16a34a',
  primaryDark: '#15803d',
  primaryLight: '#22c55e',
  primaryLighter: '#dcfce7',

  secondary: '#059669',
  secondaryDark: '#047857',

  accentOrange: '#fb923c',
  accentRed: '#ef4444',
  accentYellow: '#fbbf24',

  white: '#ffffff',
  black: '#000000',
  gray50: '#fafafa',
  gray100: '#f2f2f7',
  gray200: '#e5e5ea',
  gray300: '#d1d1d6',
  gray400: '#aeaeb2',
  gray500: '#8e8e93',
  gray600: '#636366',
  gray700: '#48484a',
  gray800: '#2c2c2e',
  gray900: '#1c1c1e',

  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  bgPrimary: '#ffffff',
  bgSecondary: '#f2f2f7',
  bgGreenLight: '#f0f9f3',

  textPrimary: '#1c1c1e',
  textSecondary: '#636366',
  textMuted: '#8e8e93',
  textWhite: '#ffffff',

  borderLight: '#e5e5ea',
  borderMedium: '#d1d1d6',
  borderDark: '#aeaeb2',

  star: '#fbbf24',
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
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700', fontFamily: fontFamily.bold },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontFamily: fontFamily.bold },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: '600', fontFamily: fontFamily.semiBold },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400', fontFamily: fontFamily.regular },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '400', fontFamily: fontFamily.regular },
};

export const control = {
  height: 48,
  compactHeight: 44,
  iconSize: 44,
};

export const shadow = {
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
};
