import useAppSettings from './useAppSettings';

/**
 * How the shortcut marks are drawn, as FlatArt's `look`: 'pop' (glossy 3D)
 * when the super admin chose it (App settings, shortcutArtStyle), otherwise
 * glass. Home's shortcuts and the seller's tools pass it to every mark.
 */
export default function useShortcutLook() {
  const { settings } = useAppSettings();
  return settings?.shortcutArtStyle === 'POP' ? 'pop' : 'glass';
}

/**
 * How large the shortcut marks are drawn, as a factor of their standard
 * size (App settings, shortcutIconScale: 85, 100, 115 or 130 percent).
 * Set on the grid as --sc-scale; the stylesheets multiply each size by it.
 */
export function useShortcutScale() {
  const { settings } = useAppSettings();
  const percent = Number(settings?.shortcutIconScale) || 100;
  return Math.min(1.5, Math.max(0.7, percent / 100));
}
