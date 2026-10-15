import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../api/client';
import { clearCachedData } from '../lib/dataCache';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrated: false,

  // Reads the saved sign-in. Always ends hydrated: a damaged saved user (or
  // storage that fails) opens the app signed out instead of holding it on the splash.
  hydrate: async () => {
    let user = null;
    let token = null;
    try {
      const [savedToken, userJson] = await AsyncStorage.multiGet([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.USER,
      ]).then((pairs) => pairs.map(([, value]) => value));
      token = savedToken;
      user = userJson ? JSON.parse(userJson) : null;
    } catch {
      user = null;
      token = null;
    }
    set({
      user,
      isAuthenticated: Boolean(token),
      isHydrated: true,
    });
  },

  // Called after a successful POST /auth/login or /auth/register response.
  login: async (user, accessToken, refreshToken) => {
    clearCachedData();
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN, accessToken],
      [STORAGE_KEYS.USER, JSON.stringify(user)],
      ...(refreshToken ? [[STORAGE_KEYS.REFRESH_TOKEN, refreshToken]] : []),
    ]);
    set({ user, isAuthenticated: true });
    // Listed under Settings → Switch account (store/savedAccounts).
    require('./savedAccounts').rememberAccount(user).catch(() => {});
  },

  updateUser: async (user) => {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ user });
  },

  // `forget`: also ask the server to end this device's session (its refresh
  // token stops renewing), as the website does. Best effort: signing out here
  // does not wait for it. The API client passes false when the session has
  // already ended on the server.
  logout: async ({ forget = true } = {}) => {
    if (forget) {
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        require('../api/client').default.post('/auth/logout', { refreshToken }).catch(() => {});
      }
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER,
    ]);
    clearCachedData();
    set({ user: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
