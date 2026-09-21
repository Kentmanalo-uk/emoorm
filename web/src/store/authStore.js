import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useCartStore from './cartStore';

// Initialize auth state from localStorage
const initializeAuth = () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      return {
        user,
        accessToken: token,
        isAuthenticated: true,
      };
    } catch (error) {
      console.error('Failed to parse user data:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }

  return {
    user: null,
    accessToken: null,
    isAuthenticated: false,
  };
};

localStorage.removeItem('emoorm-cached-accounts');

const useAuthStore = create(
  persist(
    (set, get) => ({
      // Initialize state from localStorage
      ...initializeAuth(),
      refreshToken: null,

      // Actions
      login: (userData, token, refreshToken) => {
        set({
          user: userData,
          accessToken: token,
          refreshToken: refreshToken || null,
          isAuthenticated: true,
        });

        // Store in localStorage
        localStorage.setItem('token', token);
        localStorage.setItem('accessToken', token);
        localStorage.setItem('user', JSON.stringify(userData));
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }

        // Switch to this user's cart (merging anything added as a guest).
        useCartStore.getState().setOwner(userData?.id || null);
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });

        // Clear localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');

        // Leave the user's cart behind; the visible cart becomes the guest one.
        useCartStore.getState().setOwner(null);
      },

      updateUser: (userData) => {
        set({ user: userData });
        localStorage.setItem('user', JSON.stringify(userData));
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
        localStorage.setItem('token', accessToken);
        localStorage.setItem('accessToken', accessToken);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
      },

      // Reinitialize from localStorage (useful after page reload)
      rehydrate: () => {
        const authState = initializeAuth();
        set(authState);
      },

      // Getters
      isRole: (role) => {
        const state = get();
        return state.user?.role?.toUpperCase() === role?.toUpperCase();
      },

      isBuyer: () => {
        const state = get();
        return state.user?.role?.toUpperCase() === 'BUYER';
      },

      isSeller: () => {
        const state = get();
        return state.user?.role?.toUpperCase() === 'SELLER';
      },

      isAdmin: () => {
        const state = get();
        return state.user?.role?.toUpperCase() === 'SUPER_ADMIN' || state.user?.role?.toUpperCase() === 'ADMIN';
      },
    }),
    {
      name: 'emoorm-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Point the cart at whoever is already signed in on this device.
useCartStore.getState().setOwner(useAuthStore.getState().user?.id || null);

export default useAuthStore;
