import Constants from 'expo-constants';

/**
 * API base URL resolution.
 *
 * - Android emulator: 10.0.2.2 maps to the host machine's localhost.
 * - iOS simulator: localhost works directly.
 * - Physical device: must use your machine's LAN IP (e.g. http://192.168.1.20:3000/api).
 *
 * Override at runtime without a rebuild via EXPO_PUBLIC_API_BASE_URL.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  'http://10.0.2.2:3000/api';
