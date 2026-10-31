/*
 * The two palettes, generated from the website's own token builder
 * (web/src/lib/themeTokens.js, buildTokens(palette, mode)), so the app paints
 * exactly like emoorm.shop in both modes.
 *
 * Dark is not an inversion. The coloured ramps are mirrored — a 50 is a tint
 * behind a badge and a 700 is the text on top of it, so swapping the ends
 * keeps each stop's job when the background goes dark. The neutral ramp is
 * authored instead: it is lifted off black and carries the brand's hue, so
 * the greys sit with the green rather than against it.
 *
 * Regenerate with the website's buildTokens if the brand palette ever changes.
 */

export const LIGHT = {
  primary: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#047857', 700: '#03684c', 800: '#065f46', 900: '#064e3b', 950: '#052e1f' },
  secondary: { 50: '#e9f7f0', 100: '#d7ecdf', 200: '#aedcc0', 300: '#7cc79b', 400: '#48ae76', 500: '#29a366', 600: '#178048', 700: '#176b3a', 800: '#006927', 900: '#0b5c38', 950: '#17231c' },
  accent: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724' },
  success: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16' },
  warning: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  danger: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a' },
  info: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
  neutral: { 0: '#ffffff', 50: '#f9fafb', 100: '#f3f4f6', 150: '#eef0f3', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#636b78', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712' },
  violet: { 100: '#ede9fe', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  sky: { 100: '#e0f2fe', 500: '#0ea5e9', 600: '#0284c7', 700: '#0e6f95' },
  orange: { 100: '#ffedd5', 500: '#f97316', 700: '#c2410c' },
  teal: { 500: '#14b8a6', 600: '#0891b2', 700: '#155e75' },
  indigo: { 500: '#4f46e5', 600: '#4338ca', 700: '#3730a3' },
  surface: { page: '#f9fafb', card: '#ffffff', sunken: '#f3f4f6', muted: '#eef0f3', raised: '#ffffff', inverse: '#111827', overlay: 'rgba(17, 24, 39, 0.45)' },
  text: { strong: '#111827', body: '#374151', muted: '#636b78', subtle: '#636b78', inverse: '#ffffff', link: '#047857' },
  border: { subtle: '#eef0f3', default: '#e5e7eb', strong: '#d1d5db', focus: '#047857' },
  // The label on a filled brand button or badge (the website's
  // --t-on-primary). Light mode fills are deep, so the label is white.
  onBrand: '#ffffff',
  shadowColor: '#0f172a',
  shadowOpacity: { subtle: 0.06, card: 0.1 },
  // The card and ink colours as plain channels, for the bars and sheets that
  // lie over a page at part opacity (theme/index.js: veil, ink).
  cardRgb: '255, 255, 255',
  inkRgb: '15, 23, 42',
};

export const DARK = {
  primary: { 50: '#052e1f', 100: '#064e3b', 200: '#065f46', 300: '#03684c', 400: '#047857', 500: '#10b981', 600: '#34d399', 700: '#6ee7b7', 800: '#a7f3d0', 900: '#d1fae5', 950: '#ecfdf5' },
  secondary: { 50: '#17231c', 100: '#0b5c38', 200: '#006927', 300: '#176b3a', 400: '#178048', 500: '#29a366', 600: '#48ae76', 700: '#7cc79b', 800: '#aedcc0', 900: '#d7ecdf', 950: '#e9f7f0' },
  accent: { 50: '#500724', 100: '#831843', 200: '#9d174d', 300: '#be185d', 400: '#db2777', 500: '#ec4899', 600: '#f472b6', 700: '#f9a8d4', 800: '#fbcfe8', 900: '#fce7f3', 950: '#fdf2f8' },
  success: { 50: '#052e16', 100: '#14532d', 200: '#166534', 300: '#15803d', 400: '#16a34a', 500: '#22c55e', 600: '#4ade80', 700: '#86efac', 800: '#bbf7d0', 900: '#dcfce7', 950: '#f0fdf4' },
  warning: { 50: '#451a03', 100: '#78350f', 200: '#92400e', 300: '#b45309', 400: '#d97706', 500: '#f59e0b', 600: '#fbbf24', 700: '#fcd34d', 800: '#fde68a', 900: '#fef3c7', 950: '#fffbeb' },
  danger: { 50: '#450a0a', 100: '#7f1d1d', 200: '#991b1b', 300: '#b91c1c', 400: '#dc2626', 500: '#ef4444', 600: '#f87171', 700: '#fca5a5', 800: '#fecaca', 900: '#fee2e2', 950: '#fef2f2' },
  info: { 50: '#172554', 100: '#1e3a8a', 200: '#1e40af', 300: '#1d4ed8', 400: '#2563eb', 500: '#3b82f6', 600: '#60a5fa', 700: '#93c5fd', 800: '#bfdbfe', 900: '#dbeafe', 950: '#eff6ff' },
  neutral: { 0: '#15181d', 50: '#1a1d22', 100: '#202329', 150: '#252930', 200: '#2e3239', 300: '#3d424a', 400: '#666e7b', 500: '#949ba6', 600: '#b1b7bf', 700: '#c9cdd3', 800: '#dfe1e4', 900: '#f2f2f4', 950: '#ffffff' },
  // The bright accents keep their light values: on a dark ground they are
  // already legible, and they are used as marks rather than as surfaces.
  violet: { 100: '#2a2140', 500: '#a78bfa', 600: '#8b5cf6', 700: '#c4b5fd' },
  sky: { 100: '#0b2b3a', 500: '#38bdf8', 600: '#0ea5e9', 700: '#7dd3fc' },
  orange: { 100: '#3a2412', 500: '#fb923c', 700: '#fdba74' },
  teal: { 500: '#2dd4bf', 600: '#14b8a6', 700: '#5eead4' },
  indigo: { 500: '#818cf8', 600: '#6366f1', 700: '#a5b4fc' },
  surface: { page: '#1a1d22', card: '#15181d', sunken: '#202329', muted: '#252930', raised: '#15181d', inverse: '#dfe1e4', overlay: 'rgba(0, 0, 0, 0.66)' },
  text: { strong: '#f2f2f4', body: '#c9cdd3', muted: '#949ba6', subtle: '#949ba6', inverse: '#15181d', link: '#34d399' },
  border: { subtle: '#252930', default: '#2e3239', strong: '#3d424a', focus: '#34d399' },
  // Dark mode mirrors the ramps, so a filled button is a bright mint rather
  // than a deep green. White on it would be unreadable; the label goes dark
  // instead, which is what the website does (--t-on-primary).
  onBrand: '#15181d',
  // Shadows read as depth on paper, not on a dark ground: a deeper, softer
  // one keeps cards separated without the grey halo a light shadow leaves.
  shadowColor: '#000000',
  shadowOpacity: { subtle: 0.3, card: 0.45 },
  // A bar over a dark page is the dark card colour, not white.
  cardRgb: '21, 24, 29',
  inkRgb: '0, 0, 0',
};

export const PALETTES = { light: LIGHT, dark: DARK };
