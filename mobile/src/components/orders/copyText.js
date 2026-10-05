import { Platform } from 'react-native';

/**
 * Copies text where the platform lets us. The web build uses the browser's
 * clipboard; the native app has no clipboard module yet (expo-clipboard is
 * not installed), so it reports false and the caller shows the website's
 * "select the number to copy it" message (the number is selectable text).
 */
export default async function copyText(value) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(String(value));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
