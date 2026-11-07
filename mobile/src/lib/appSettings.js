import { useEffect, useState } from 'react';
import apiClient from '../api/client';

/**
 * The super admin's app settings (GET /app-settings), as the website's
 * hooks/useAppSettings.js has them: one request per app run, shared by every
 * screen, and the defaults below until it answers (or when it fails, so a
 * screen never waits on it).
 */
export const DEFAULT_APP_SETTINGS = {
  appLogo: null,
  categoryStyle: 'IMAGE',
  // Home's shortcuts and the seller's tools: 'GLASS' or 'POP' (glossy 3D).
  shortcutArtStyle: 'GLASS',
  // Their size, as a percent of the standard one: 85, 100, 115 or 130.
  shortcutIconScale: 100,
  // The header bars: 'GLOW' (pink to green), 'WHITE' or 'GREEN'.
  mobileHeaderStyle: 'GLOW',
  // Sign-in methods the super admin switches (email is always on).
  loginGoogle: true,
  loginFacebook: true,
  loginPhone: false,
};

let current = null; // the answer, once it came
let request = null;
const listeners = new Set();

/** The settings, asked once; a failure is asked again next time. */
export const loadAppSettings = () => {
  request = request || apiClient.get('/app-settings')
    .then((res) => {
      current = { ...DEFAULT_APP_SETTINGS, ...(res?.data || {}) };
      listeners.forEach((fn) => fn(current));
      return current;
    })
    .catch(() => { request = null; return current || DEFAULT_APP_SETTINGS; });
  return request;
};

/** What is known now, without waiting. */
export const appSettingsNow = () => current || DEFAULT_APP_SETTINGS;

/** The settings in a component: the defaults first, the answer when it comes. */
export default function useAppSettings() {
  const [settings, setSettings] = useState(appSettingsNow);
  useEffect(() => {
    listeners.add(setSettings);
    if (current) setSettings(current);
    else loadAppSettings();
    return () => { listeners.delete(setSettings); };
  }, []);
  return settings;
}

/** How shortcut marks are drawn: 'pop' (glossy 3D) or 'glass'. */
export const shortcutLook = (settings) => (settings?.shortcutArtStyle === 'POP' ? 'pop' : 'glass');

/** Their size as a factor of the standard one (0.7 to 1.5). */
export const shortcutScale = (settings) => {
  const percent = Number(settings?.shortcutIconScale) || 100;
  return Math.min(1.5, Math.max(0.7, percent / 100));
};
