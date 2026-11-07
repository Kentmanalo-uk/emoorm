import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from '../lib/axios';
import useAppSettings, { APP_SETTINGS_QUERY_KEY } from './useAppSettings';
import {
  applyTheme, cacheTheme, normalizeTheme, readCachedTheme, effectiveMode,
  readModePreference, writeModePreference,
} from '../lib/theme';
import { DEFAULT_THEME } from '../lib/themePresets';

const HEADER_STYLE_KEY = 'emoorm.headerStyle';
const GLASS_KEY = 'emoorm.glass';

/** The phone header's colour on <html>: data-header-style white or green;
    none for the wash, the default. */
const applyHeaderStyle = (style) => {
  const value = String(style || '').toLowerCase();
  const root = document.documentElement;
  if (value === 'white' || value === 'green') root.dataset.headerStyle = value;
  else delete root.dataset.headerStyle;
};

/** Liquid glass on phones, on <html>: data-glass all, menus or off
 *  (styles/glass.css). Anything else counts as all, the default. */
const applyGlass = (value) => {
  const v = String(value || 'ALL').toLowerCase();
  document.documentElement.dataset.glass = v === 'menus' || v === 'off' ? v : 'all';
};

/**
 * The palette that is currently live, and the ability to change it.
 *
 * The theme comes back with the rest of the app settings, so this adds no
 * request of its own — a visitor who is already loading the logo is loading
 * the palette in the same response.
 */
export default function useTheme() {
  const { settings, isLoading } = useAppSettings();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Until the settings arrive there is no answer, so this browser's last
  // known palette stands in. Once they have, the server is authoritative —
  // including when it says null, which means "the shipped palette" and must
  // not be overridden by a stale local copy.
  const theme = normalizeTheme(isLoading
    ? (readCachedTheme() ?? DEFAULT_THEME)
    : (settings?.theme ?? DEFAULT_THEME));

  const save = useCallback(async (next) => {
    setSaving(true);
    try {
      // null clears the column and restores the shipped palette.
      const payload = next === null ? null : normalizeTheme(next);
      const response = await axios.put('/app-settings', { theme: payload });
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, response.data);
      cacheTheme(response.data?.theme ?? DEFAULT_THEME);
      return response.data;
    } finally {
      setSaving(false);
    }
  }, [queryClient]);

  return { theme, mode: effectiveMode(theme), isLoading, saving, save };
}

/**
 * Applies the saved theme, and keeps applying it when it changes.
 *
 * Mounted once, high in the tree, and renders nothing. Everything below it
 * gets its colours from the stylesheet as usual — no component subscribes to
 * the theme, which is the point of doing this with custom properties.
 */
export function ThemeRuntime() {
  const { settings, isLoading } = useAppSettings();
  const theme = settings?.theme ?? null;
  const headerStyle = settings?.mobileHeaderStyle;
  const glass = settings?.mobileGlass;

  // The header's colour on phones (styles/phone-app.css), kept for the next
  // load like the palette.
  useEffect(() => {
    if (isLoading) return;
    applyHeaderStyle(headerStyle);
    try {
      localStorage.setItem(HEADER_STYLE_KEY, headerStyle || 'GLOW');
    } catch { /* private window: the next load starts from the wash */ }
  }, [headerStyle, isLoading]);

  // Liquid glass on phones, kept for the next load the same way.
  useEffect(() => {
    if (isLoading) return;
    applyGlass(glass);
    try {
      localStorage.setItem(GLASS_KEY, glass || 'ALL');
    } catch { /* private window */ }
  }, [glass, isLoading]);

  useEffect(() => {
    // Nothing to apply yet: bootTheme already put this browser's last
    // known palette up, and repainting the default over it here would be
    // the flash that cache exists to prevent.
    if (isLoading) return;
    const resolved = normalizeTheme(theme ?? DEFAULT_THEME);
    applyTheme(resolved);
    // Cached so the next load paints in the right colours before this
    // response has come back.
    cacheTheme(resolved);
  }, [theme, isLoading]);

  // Following the operating system means reacting when it changes, which
  // happens on its own schedule — most people have it set to flip at dusk.
  useEffect(() => {
    if (isLoading) return undefined;
    const resolved = normalizeTheme(theme ?? DEFAULT_THEME);
    const follows = resolved.allowDarkMode
      && (readModePreference() || resolved.mode) === 'system';
    if (!follows || typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(resolved);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme, isLoading]);

  return null;
}

/**
 * Boot-time application of the cached palette.
 *
 * Called before React renders. Without it the first paint uses the shipped
 * green and then snaps to the real palette a moment later, which is the
 * flash every theming system has to deal with. Losing the cache costs one
 * frame, not correctness — the server's copy still wins once it arrives.
 */
export const bootTheme = () => {
  const cached = readCachedTheme();
  if (cached) applyTheme(cached);
  try {
    applyHeaderStyle(localStorage.getItem(HEADER_STYLE_KEY));
    applyGlass(localStorage.getItem(GLASS_KEY));
  } catch { /* storage blocked: the wash until the settings arrive */ }
};

export { writeModePreference };
