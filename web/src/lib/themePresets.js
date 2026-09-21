/**
 * Ready-made palettes.
 *
 * A preset is data: an id, a name, and the handful of colours the ramps are
 * built from. Adding one is appending an object to this list — nothing else
 * in the application needs to know it exists.
 *
 * The default carries authored ramps rather than derived ones, because it has
 * to reproduce the palette the application shipped with exactly. The rest give
 * seeds and let lib/color derive the steps, which is also what a custom
 * palette does, so every preset here is something an administrator could have
 * built in the editor.
 */

import { DEFAULT_RAMPS } from './themeTokens';

export const DEFAULT_PRESET_ID = 'emoorm-green';

export const PRESETS = [
  {
    id: DEFAULT_PRESET_ID,
    name: 'Emoorm Green',
    description: 'The original palette. Emerald brand, forest depths, a pink accent.',
    seeds: {
      primary: '#059669',
      secondary: '#176b3a',
      accent: '#ec4899',
      neutral: '#6b7280',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6',
    },
    // Authored, so selecting this is a true restore rather than a re-derivation.
    ramps: DEFAULT_RAMPS,
  },
  {
    id: 'island-teal',
    name: 'Island Teal',
    description: 'Cooler and coastal. Teal brand with a coral accent for warmth.',
    seeds: {
      primary: '#0f9d8f',
      secondary: '#0b6b6b',
      accent: '#f97362',
      neutral: '#6b7785',
      success: '#16a34a',
      warning: '#f59e0b',
      danger: '#e11d48',
      info: '#0284c7',
    },
  },
  {
    id: 'harvest-amber',
    name: 'Harvest Amber',
    description: 'Warm and agricultural. Amber brand balanced by a deep teal accent.',
    seeds: {
      primary: '#c2710c',
      secondary: '#7c4a12',
      accent: '#0f766e',
      neutral: '#78716c',
      success: '#16a34a',
      warning: '#eab308',
      danger: '#dc2626',
      info: '#0369a1',
    },
  },
  {
    id: 'coastal-indigo',
    name: 'Coastal Indigo',
    description: 'Calm and institutional. Indigo brand, pink accent, cool greys.',
    seeds: {
      primary: '#4f46e5',
      secondary: '#312e81',
      accent: '#ec4899',
      neutral: '#64748b',
      success: '#059669',
      warning: '#f59e0b',
      danger: '#e11d48',
      info: '#0284c7',
    },
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    description: 'Earthy clay and olive. Reads as craft and produce rather than software.',
    seeds: {
      primary: '#b4482e',
      secondary: '#7c2d12',
      accent: '#0d9488',
      neutral: '#78716c',
      success: '#4d7c0f',
      warning: '#d97706',
      danger: '#be123c',
      info: '#0e7490',
    },
  },
  {
    id: 'midnight-plum',
    name: 'Midnight Plum',
    description: 'Higher contrast. Purple brand with a magenta accent, on neutral grey.',
    seeds: {
      primary: '#7e22ce',
      secondary: '#4c1d95',
      accent: '#db2777',
      neutral: '#6b7280',
      success: '#059669',
      warning: '#f59e0b',
      danger: '#dc2626',
      info: '#2563eb',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Almost monochrome. Colour is reserved for status, so data leads.',
    seeds: {
      primary: '#334155',
      secondary: '#0f172a',
      accent: '#0d9488',
      neutral: '#64748b',
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
      info: '#1d4ed8',
    },
  },
];

export const getPreset = (id) => PRESETS.find((preset) => preset.id === id) || null;

export const DEFAULT_PRESET = getPreset(DEFAULT_PRESET_ID);

/** The colours shown on a preset card, in the order they read best. */
export const presetSwatch = (preset) => [
  preset.seeds.primary,
  preset.seeds.secondary,
  preset.seeds.accent,
  preset.seeds.warning,
  preset.seeds.neutral,
];

/**
 * The stored shape of a theme.
 *
 * `presetId` is kept even for a customised palette, so the panel can say what
 * it was started from and "Reset" has somewhere to go back to.
 */
export const DEFAULT_THEME = {
  presetId: DEFAULT_PRESET_ID,
  mode: 'light',
  allowDarkMode: false,
  seeds: null,
  roles: null,
  tokens: null,
};
