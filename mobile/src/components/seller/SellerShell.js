import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import apiClient from '../../api/client';
import useAuthStore from '../../store/authStore';
import { getCacheEntry, setCachedData } from '../../lib/dataCache';
import { startAccountSwitch, useAccountSwitchStore } from '../RoleSwitchOverlay';
import { fetchSellerSetup } from './sellerSetup';

/*
 * What every Seller Center page shares (the website's SellerLayout outlet
 * context): the shop, its setup checklist, the unread notification count and
 * the attention counts (new orders, returns, unread chats, low stock), and
 * the account actions. Provided by app/seller/_layout.js.
 *
 *   const { store, setStore, setup, refreshSetup, unreadCount, waiting,
 *           refreshCounts, switchToPersonal, requestLogout } = useSellerShell();
 *
 * waiting['/seller/orders'] → { count, severity, label } (useAttention.js).
 */
const SellerShellContext = createContext(null);

const STORE_KEY = 'seller:store';
const SETUP_KEY = 'seller:setup';
const UNREAD_KEY = 'seller:unread';
const WAITING_KEY = 'seller:waiting';
const ATTENTION_MS = 60000;
const UNREAD_MS = 30000;

export function useSellerShell() {
  return useContext(SellerShellContext) || {
    store: null, setStore: () => {}, setup: null, refreshSetup: async () => null, unreadCount: 0, waiting: {},
    refreshCounts: () => {}, switchToPersonal: () => {}, requestLogout: () => {},
  };
}

/** The attention counts, keyed by the route they belong to (web/src/hooks/useAttention.js). */
function useAttention(enabled) {
  const [byLink, setByLink] = useState(() => getCacheEntry(WAITING_KEY)?.data || {});
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await apiClient.get('/stores/my/attention');
      const next = {};
      for (const item of Array.isArray(res.data) ? res.data : []) {
        if (!item?.link) continue;
        next[item.link] = { count: item.count || 0, severity: item.severity || 'low', label: item.label || '' };
      }
      setByLink(next);
      setCachedData(WAITING_KEY, next);
    } catch {
      /* leave the last good counts in place */
    }
  }, [enabled]);
  return [byLink, load];
}

export function SellerShellProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isSeller = user?.role === 'SELLER';
  const rememberShop = useAccountSwitchStore((s) => s.setShop);

  // The shop as it was last time: every page shows at once while it is asked for again.
  const [store, setStoreState] = useState(() => getCacheEntry(STORE_KEY)?.data || null);
  const setStore = useCallback((next) => {
    setStoreState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      setCachedData(STORE_KEY, value);
      return value;
    });
  }, []);
  const [unreadCount, setUnreadCount] = useState(() => getCacheEntry(UNREAD_KEY)?.data ?? 0);
  const [waiting, loadAttention] = useAttention(isSeller);

  useEffect(() => {
    if (!isSeller) return undefined;
    let cancelled = false;
    apiClient.get('/stores/my/store')
      .then((res) => { if (!cancelled) setStore(res.data); })
      .catch((err) => {
        // No shop (any more): forget the saved one. Offline and the like keep it on screen.
        if (!cancelled && err?.status === 404) setStore(null);
      });
    return () => { cancelled = true; };
  }, [isSeller, setStore]);

  // Keep the switch animation's shop logo in sync (also after profile edits).
  useEffect(() => { if (store) rememberShop(store); }, [store, rememberShop]);

  const loadUnread = useCallback(async () => {
    if (!isSeller) return;
    try {
      const n = await apiClient.get('/notifications/unread/count', { params: { audience: 'SELLER' } });
      const count = Number(n.data?.count ?? 0);
      setUnreadCount(count);
      setCachedData(UNREAD_KEY, count);
    } catch { /* the next page counts again */ }
  }, [isSeller]);

  const refreshCounts = useCallback(() => { loadUnread(); loadAttention(); }, [loadUnread, loadAttention]);

  // Counted on every page change (reading a chat there, say), every so often
  // while the app is open, and when it comes back to the front.
  useEffect(() => { refreshCounts(); }, [pathname, refreshCounts]);
  useEffect(() => {
    if (!isSeller) return undefined;
    const attention = setInterval(loadAttention, ATTENTION_MS);
    const unread = setInterval(loadUnread, UNREAD_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refreshCounts(); });
    return () => { clearInterval(attention); clearInterval(unread); sub.remove(); };
  }, [isSeller, loadAttention, loadUnread, refreshCounts]);

  // The new-shop checklist: re-read on every page change until it is
  // complete, and once per visit even when the saved copy says complete.
  const [setup, setSetup] = useState(() => getCacheEntry(SETUP_KEY)?.data || null);
  const setupChecked = useRef(false);
  const refreshSetup = useCallback(async () => {
    try {
      const next = await fetchSellerSetup();
      setSetup(next);
      setupChecked.current = true;
      setCachedData(SETUP_KEY, next);
      return next;
    } catch {
      return null;
    }
  }, []);
  const setupComplete = setup?.complete === true;
  useEffect(() => {
    if (!store?.id || !isSeller || (setupComplete && setupChecked.current)) return;
    refreshSetup();
  }, [store?.id, isSeller, pathname, setupComplete, refreshSetup]);

  const switchToPersonal = useCallback(() => startAccountSwitch('personal', '/profile'), []);

  // "Sign out?" then home (the website's ConfirmDialog).
  const requestLogout = useCallback(() => {
    const signOut = async () => {
      await logout();
      router.replace('/');
    };
    const title = 'Sign out?';
    const message = 'You will need to sign in again to manage your shop.';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (globalThis.confirm?.(`${title}\n\n${message}`)) signOut();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }, [logout, router]);

  const value = useMemo(() => ({
    store, setStore, setup, refreshSetup, unreadCount, waiting, refreshCounts, switchToPersonal, requestLogout,
  }), [store, setStore, setup, refreshSetup, unreadCount, waiting, refreshCounts, switchToPersonal, requestLogout]);

  return <SellerShellContext.Provider value={value}>{children}</SellerShellContext.Provider>;
}
