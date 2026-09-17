import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * API base URL resolution, in order:
 *
 * 1. EXPO_PUBLIC_API_BASE_URL (mobile/.env): explicit override, e.g. a deployed backend.
 * 2. Development: the same computer that runs the Expo dev server (Metro), on port 3000.
 *    Expo reports that computer's LAN address, so this keeps working when the PC's
 *    Wi-Fi IP changes and on physical phones on the same network.
 * 3. app.json `extra.apiBaseUrl`.
 * 4. Android emulator default: 10.0.2.2 maps to the host machine's localhost.
 */
const API_PORT = 3000;

const isIpAddress = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

const devServerApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = hostUri.split(':')[0];
  if (!host) return null;
  if (host === 'localhost' || host === '127.0.0.1') {
    // An emulator reaches the PC through 10.0.2.2; an iOS simulator shares localhost.
    return Platform.OS === 'android'
      ? `http://10.0.2.2:${API_PORT}/api`
      : `http://localhost:${API_PORT}/api`;
  }
  // Tunnel hosts (e.g. *.exp.direct) do not expose the backend port.
  if (!isIpAddress(host)) return null;
  return `http://${host}:${API_PORT}/api`;
};

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? devServerApiUrl() : null) ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  'http://10.0.2.2:3000/api';

if (__DEV__) {
  console.log(`[config] API_BASE_URL = ${API_BASE_URL}`);
}
