import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useCartStore from './cartStore';
import useWishlistStore from './wishlistStore';
import { setAuthHandlers } from '../lib/axios';

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

        // Switch to this user's cart (merging anything added as a guest) and
        // saved list.
        useCartStore.getState().setOwner(userData?.id || null);
        useWishlistStore.getState().setOwner(userData?.id || null);
      },

      // `to`: where the page that signed out is sending the visitor, so route
      // guards that notice the signed-out state first send them there too.
      // Not saved: only this visit needs it.
      logout: (to = null) => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          signOutTo: to,
        });

        // Clear localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');

        // Leave the user's cart and saved list behind; the visible ones
        // become the guest's.
        useCartStore.getState().setOwner(null);
        useWishlistStore.getState().setOwner(null);
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

// Point the cart and saved list at whoever is already signed in on this device.
useCartStore.getState().setOwner(useAuthStore.getState().user?.id || null);
useWishlistStore.getState().setOwner(useAuthStore.getState().user?.id || null);

// The API client saves renewed tokens here, and signs out through here when
// the session cannot be renewed.
setAuthHandlers({
  setTokens: (accessToken, refreshToken) => useAuthStore.getState().setTokens(accessToken, refreshToken),
  signOut: () => useAuthStore.getState().logout(),
});

// Other tabs: signing in, out or as someone else there shows here too
// (requests already read the token from storage, so the screen must follow).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'token' && e.key !== 'user') return;
    const { user } = useAuthStore.getState();
    const token = localStorage.getItem('token');
    let stored;
    try { stored = JSON.parse(localStorage.getItem('user') || 'null'); } catch { stored = null; }
    if (!token || !stored) {
      if (user) {
        useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        useCartStore.getState().setOwner(null);
        useWishlistStore.getState().setOwner(null);
      }
      return;
    }
    if (stored.id !== user?.id || token !== useAuthStore.getState().accessToken) {
      useAuthStore.setState({ user: stored, accessToken: token, isAuthenticated: true });
      useCartStore.getState().setOwner(stored.id);
      useWishlistStore.getState().setOwner(stored.id);
    }
  });
}

export default useAuthStore;
