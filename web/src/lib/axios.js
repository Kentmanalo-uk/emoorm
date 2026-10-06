import axios from 'axios';
import { API_CONFIG } from '../config/api';
import { beginActivity, endActivity } from './activity';

// Requests that change something (saves, sends, deletes) show the activity
// bar while they run; plain reads do not (pages show skeletons for those),
// nor background ones the person did not ask for (`{ quiet: true }`).
const counted = new WeakSet();
const isAction = (config) => !config?.quiet
  && !['get', 'head', 'options'].includes(String(config?.method || 'get').toLowerCase());
const settle = (config) => {
  if (config && counted.has(config)) {
    counted.delete(config);
    endActivity();
  }
};

/*
 * The signed-in session. The auth store registers how to save renewed tokens
 * and how to sign out (setAuthHandlers), so this file need not import it.
 */
let authHandlers = { setTokens: null, signOut: null };
export const setAuthHandlers = (handlers) => {
  authHandlers = { ...authHandlers, ...handlers };
};

const readToken = () => localStorage.getItem('token') || localStorage.getItem('accessToken');

// Sign-in steps answer 401 for a wrong password or code: a form mistake, not
// a lapsed session, so they never renew or sign out.
const SIGN_IN_STEP = /\/auth\/(login|register|google|refresh-token|forgot-password|reset-password|verify-email|resend-verification|logout|mfa|qr)(\/|$|\?)/;

// One renewal at a time: every request that fails meanwhile waits for it.
let refreshing = null;
const renewSession = () => {
  if (!refreshing) {
    const refreshToken = localStorage.getItem('refreshToken');
    refreshing = (refreshToken
      ? axios.post(`${API_CONFIG.BASE_URL}/auth/refresh-token`, { refreshToken }).then((res) => {
        const { accessToken, refreshToken: next } = res.data?.data || {};
        if (!accessToken) throw new Error('No token');
        if (authHandlers.setTokens) authHandlers.setTokens(accessToken, next || refreshToken);
        else {
          localStorage.setItem('token', accessToken);
          localStorage.setItem('accessToken', accessToken);
          if (next) localStorage.setItem('refreshToken', next);
        }
        return accessToken;
      })
      : Promise.reject(new Error('No refresh token')))
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

/** The session is over: sign out everywhere it is kept, then to Log in. */
let signingOut = false;
const endSession = () => {
  if (signingOut) return;
  signingOut = true;
  if (authHandlers.signOut) authHandlers.signOut();
  else ['token', 'accessToken', 'refreshToken', 'user'].forEach((k) => localStorage.removeItem(k));
  const here = window.location.pathname + window.location.search;
  window.location.href = here.startsWith('/login') ? '/login' : `/login?redirect=${encodeURIComponent(here)}`;
};

// Create axios instance
const axiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    // Get token from localStorage (check both keys for compatibility)
    const token = readToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (isAction(config) && !counted.has(config)) {
      counted.add(config);
      beginActivity();
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    settle(response.config);
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    // A retry below counts again from the start.
    settle(originalRequest);

    // Read-only requests retry up to twice after a short pause when the
    // server is rate limiting (429), busy (502/503/504, e.g. a rush of
    // visitors) or briefly unreachable (e.g. dev server restarting). The
    // pause grows and varies a little, so a crowd turned away together does
    // not come back together.
    const status = error.response?.status;
    const retryable = [429, 502, 503, 504].includes(status) || (!error.response && error.code !== 'ECONNABORTED');
    const tries = originalRequest?._transientTries || 0;
    if (retryable && originalRequest && tries < 2
      && (originalRequest.method || 'get').toLowerCase() === 'get') {
      originalRequest._transientTries = tries + 1;
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      const baseMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1500 * (tries + 1);
      await new Promise((resolve) => setTimeout(resolve, baseMs + Math.random() * 1000));
      return axiosInstance(originalRequest);
    }

    // 401 on a signed-in request: renew the session once and try again; if
    // it cannot be renewed, the session is over.
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry
      && readToken() && !SIGN_IN_STEP.test(originalRequest.url || '')) {
      originalRequest._retry = true;
      try {
        const accessToken = await renewSession();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axiosInstance(originalRequest);
      } catch {
        endSession();
      }
    }

    // Return formatted error
    const formattedError = {
      message: error.response?.data?.message
        || (!error.response ? 'Cannot reach the server. Check your connection and try again.' : null)
        || error.message
        || 'An error occurred',
      status: error.response?.status,
      errors: error.response?.data?.errors,
    };
    
    return Promise.reject(formattedError);
  }
);

export default axiosInstance;
