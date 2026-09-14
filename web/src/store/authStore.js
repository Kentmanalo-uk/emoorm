import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

const CACHED_ACCOUNTS_KEY = 'emoorm-cached-accounts';

const readCachedAccounts = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHED_ACCOUNTS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const cacheAccount = (userData, token, refreshToken) => {
  if (!userData?.email || !token) return;
  const accounts = readCachedAccounts().filter((account) => account.email !== userData.email);
  accounts.unshift({
    email: userData.email,
    fullName: userData.fullName,
    role: userData.role,
    profilePhoto: userData.profilePhoto || null,
    accessToken: token,
    refreshToken: refreshToken || null,
    cachedAt: Date.now(),
  });
  localStorage.setItem(CACHED_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
};

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
        cacheAccount(userData, token, refreshToken);
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
      },

      getCachedAccounts: () => readCachedAccounts(),

      switchCachedAccount: (account) => {
        if (!account?.accessToken || !account?.email) return false;
        set({
          user: {
            email: account.email,
            fullName: account.fullName,
            role: account.role,
            profilePhoto: account.profilePhoto,
          },
          accessToken: account.accessToken,
          refreshToken: account.refreshToken || null,
          isAuthenticated: true,
        });
        localStorage.setItem('token', account.accessToken);
        localStorage.setItem('accessToken', account.accessToken);
        localStorage.setItem('user', JSON.stringify({
          email: account.email,
          fullName: account.fullName,
          role: account.role,
          profilePhoto: account.profilePhoto,
        }));
        if (account.refreshToken) localStorage.setItem('refreshToken', account.refreshToken);
        return true;
      },

      removeCachedAccount: (email) => {
        localStorage.setItem(
          CACHED_ACCOUNTS_KEY,
          JSON.stringify(readCachedAccounts().filter((account) => account.email !== email))
        );
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

export default useAuthStore;
