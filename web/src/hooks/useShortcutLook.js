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
