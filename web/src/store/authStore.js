import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useCartStore from './cartStore';
import useWishlistStore from './wishlistStore';
import axiosInstance, { setAuthHandlers } from '../lib/axios';
import { dropKeptSession, refreshSavedAccount, rememberAccount } from '../lib/savedAccounts';

// Admins stay in /admin, where no cart or saved list is ever shown, so theirs
// are not read from the account on every visit. Buyers' and sellers' are.
const ADMIN_ROLES = ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'];
const isAdminAccount = (user) => ADMIN_ROLES.includes(user?.role);

/** Points the cart and the saved list at this account (null: the guest's). */
const pointListsAt = (user) => {
  const sync = !isAdminAccount(user);
  useCartStore.getState().setOwner(user?.id || null, { sync });
  useWishlistStore.getState().setOwner(user?.id || null, { sync });
};

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

// The admin session put aside while their seller stands in front of it.
const ADMIN_ASIDE = 'emoorm-admin-aside';

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
        pointListsAt(userData);

        // Listed under Settings → Switch account (lib/savedAccounts). A
        // session this browser had kept for the account is not needed now.
        rememberAccount(userData);
        dropKeptSession(userData?.id);
      },

      // `to`: where the page that signed out is sending the visitor, so route
      // guards that notice the signed-out state first send them there too.
      // Not saved: only this visit needs it.
      // `forget`: false signs out here only and leaves the session alive on
      // the server (Switch account → Add another account keeps it).
      logout: (to = null, { forget = true } = {}) => {
        // The server forgets this device's session (its refresh token stops
        // renewing). Best effort: the sign-out here does not wait for it.
        // The session is the httpOnly cookie (or, signed in before that, a
        // token still in storage); the server ends it and clears the cookie.
        const refreshToken = localStorage.getItem('refreshToken');
        if (forget && localStorage.getItem('token')) {
          axiosInstance.post('/auth/logout', refreshToken ? { refreshToken } : {}, { quiet: true }).catch(() => {});
        }
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

      // ── A superadmin standing in for a shop ──────────────────────────
      // The admin's own session is put aside in sessionStorage -- this tab,
      // this visit -- and the seller's short-lived one takes its place. It
      // carries no refresh token, so it cannot be renewed: when it runs out
      // (or the admin says so) the session set aside comes back.
      actingAs: null,

      startActAs: (accessToken, sellerUser, until) => {
        const keep = {
          user: get().user,
          accessToken: get().accessToken,
          refreshToken: get().refreshToken || localStorage.getItem('refreshToken') || null,
        };
        try { sessionStorage.setItem(ADMIN_ASIDE, JSON.stringify(keep)); } catch { /* private window */ }

        set({
          user: sellerUser,
          accessToken,
          refreshToken: null,
          isAuthenticated: true,
          actingAs: {
            adminName: keep.user?.fullName || keep.user?.email || 'admin',
            sellerId: sellerUser?.id,
            sellerName: sellerUser?.fullName || sellerUser?.email || 'this seller',
            until: until || null,
          },
        });
        localStorage.setItem('token', accessToken);
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(sellerUser));
        // Not the admin's to renew from in here.
        localStorage.removeItem('refreshToken');
        pointListsAt(sellerUser);
      },

      stopActAs: () => {
        let kept = null;
        try { kept = JSON.parse(sessionStorage.getItem(ADMIN_ASIDE) || 'null'); } catch { /* unreadable */ }
        try { sessionStorage.removeItem(ADMIN_ASIDE); } catch { /* private window */ }

        // Nothing to come back to (another tab, cleared storage): the safe
        // end is to be nobody rather than to stay as the seller.
        if (!kept?.accessToken) {
          get().logout('/login');
          return false;
        }

        set({
          user: kept.user,
          accessToken: kept.accessToken,
          refreshToken: kept.refreshToken || null,
          isAuthenticated: true,
          actingAs: null,
        });
        localStorage.setItem('token', kept.accessToken);
        localStorage.setItem('accessToken', kept.accessToken);
        localStorage.setItem('user', JSON.stringify(kept.user));
        if (kept.refreshToken) localStorage.setItem('refreshToken', kept.refreshToken);
        pointListsAt(kept.user);
        return true;
      },

      updateUser: (userData) => {
        set({ user: userData });
        localStorage.setItem('user', JSON.stringify(userData));
        // The saved card under Switch account shows the new name or photo.
        refreshSavedAccount(userData);
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
        actingAs: state.actingAs,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Point the cart and saved list at whoever is already signed in on this device.
pointListsAt(useAuthStore.getState().user);

// An admin taken off a team goes back to an ordinary account while signed in
// (the admin shell's profile read says so): the saved cart and list left
// unread while they were an admin come in now, before any change here is
// saved over them.
useAuthStore.subscribe((state, previous) => {
  const { user } = state;
  if (user?.id && user.id === previous.user?.id && isAdminAccount(previous.user) && !isAdminAccount(user)) {
    pointListsAt(user);
  }
});

// The API client saves renewed tokens here, and signs out through here when
// the session cannot be renewed.
setAuthHandlers({
  setTokens: (accessToken, refreshToken) => useAuthStore.getState().setTokens(accessToken, refreshToken),
  signOut: () => useAuthStore.getState().logout(),
  actingAs: () => Boolean(useAuthStore.getState().actingAs),
  endActingAs: () => useAuthStore.getState().stopActAs(),
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
      pointListsAt(stored);
    }
  });
}

export default useAuthStore;
