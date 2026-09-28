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
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
    
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

    // Read-only requests retry once after a short pause when the server is
    // rate limiting (429), busy (502/503/504, e.g. its database connections
    // all taken) or briefly unreachable (e.g. dev server restarting).
    const status = error.response?.status;
    const retryable = [429, 502, 503, 504].includes(status) || (!error.response && error.code !== 'ECONNABORTED');
    if (retryable && originalRequest && !originalRequest._retriedTransient
      && (originalRequest.method || 'get').toLowerCase() === 'get') {
      originalRequest._retriedTransient = true;
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1500;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return axiosInstance(originalRequest);
    }

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Try to refresh token
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (refreshToken) {
          const response = await axios.post(
            `${API_CONFIG.BASE_URL}/auth/refresh`,
            { refreshToken }
          );
          
          const { accessToken } = response.data.data;
          localStorage.setItem('accessToken', accessToken);
          
          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return axiosInstance(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
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
