import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../api/client';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrated: false,

  hydrate: async () => {
    const [token, userJson] = await AsyncStorage.multiGet([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.USER,
    ]).then((pairs) => pairs.map(([, value]) => value));

    set({
      user: userJson ? JSON.parse(userJson) : null,
      isAuthenticated: Boolean(token),
      isHydrated: true,
    });
  },

  // Called after a successful POST /auth/login or /auth/register response.
  login: async (user, accessToken, refreshToken) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN, accessToken],
      [STORAGE_KEYS.USER, JSON.stringify(user)],
      ...(refreshToken ? [[STORAGE_KEYS.REFRESH_TOKEN, refreshToken]] : []),
    ]);
    set({ user, isAuthenticated: true });
  },

  updateUser: async (user) => {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER,
    ]);
    set({ user: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
