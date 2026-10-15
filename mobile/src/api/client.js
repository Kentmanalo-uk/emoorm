import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/config';
import { ENDPOINTS } from './endpoints';

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT from AsyncStorage to every request
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Sign-in steps answer 401 for a wrong password or code: never refresh on those.
const SIGN_IN_STEP = /\/auth\/(login|register|google|refresh-token|forgot-password|reset-password|verify-email|resend-verification|logout|mfa|qr)(\/|$|\?)/;

// One refresh at a time. The server rotates the refresh token on every
// refresh and treats a second use of an old one as theft (it signs that
// session out), so requests that fail together share the one refresh, and
// the new refresh token it returns is kept for next time. Uploads (lib/upload),
// which go out through fetch, renew through it too.
let refreshing = null;
export const refreshTokens = () => {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) throw new Error('No refresh token');
      const res = await axios.post(`${API_BASE_URL}${ENDPOINTS.AUTH.REFRESH_TOKEN}`, { refreshToken });
      const { accessToken, refreshToken: next } = res.data?.data || {};
      if (!accessToken) throw new Error('No access token');
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.ACCESS_TOKEN, accessToken],
        ...(next ? [[STORAGE_KEYS.REFRESH_TOKEN, next]] : []),
      ]);
      return accessToken;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
};

// Unwrap { success, data, message } and normalize errors, same contract as web/src/lib/axios.js
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !SIGN_IN_STEP.test(originalRequest.url || '')) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshTokens();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Lazy require avoids a circular import with authStore.js (which imports STORAGE_KEYS from this module).
        await require('../store/authStore').default.getState().logout({ forget: false });
        return Promise.reject({ message: 'Your session has ended. Please sign in again.', status: 401 });
      }
    }

    return Promise.reject({
      message: error.response?.data?.message || error.message || 'An error occurred',
      status: error.response?.status,
      errors: error.response?.data?.errors,
    });
  }
);

export default apiClient;
