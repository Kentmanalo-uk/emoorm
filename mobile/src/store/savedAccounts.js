import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { API_BASE_URL } from '../lib/config';

/*
 * The accounts saved on this phone, for Settings → Switch account (as
 * shopping apps do): every account that signs in here is listed; switching
 * away from one keeps it signed in (its session's tokens, in the phone's
 * secure storage: Keychain / Keystore), so switching back needs no password.
 *
 *   list (AsyncStorage)   [{ id, fullName, email, profilePhoto, role, savedAt }]
 *   tokens (SecureStore)  emoorm-acct-<id> → { accessToken, refreshToken }
 *
 * Only accounts the phone has switched away from hold tokens: the signed-in
 * account's live tokens stay where the API client keeps (and renews) them,
 * and are copied here at the moment of switching. An account that signed out,
 * or whose session ran out, stays listed without tokens: picking it opens the
 * login with its email.
 */

// The phone's secure storage; the web build (screen tests only) has none, so there it is AsyncStorage.
const SecureStore = Platform.OS === 'web'
  ? {
    getItemAsync: (k) => AsyncStorage.getItem(k),
    setItemAsync: (k, v) => AsyncStorage.setItem(k, v),
    deleteItemAsync: (k) => AsyncStorage.removeItem(k),
  }
  : ExpoSecureStore;

const LIST_KEY = 'emoorm-saved-accounts';
const tokenKey = (id) => `emoorm-acct-${String(id).replace(/[^A-Za-z0-9._-]/g, '')}`;
const MAX_ACCOUNTS = 5;

const readList = async () => {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const writeList = async (list) => {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list)).catch(() => {});
  useSavedAccounts.setState({ accounts: list });
};

const readTokens = async (id) => {
  try {
    const raw = await SecureStore.getItemAsync(tokenKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const card = (user) => ({
  id: user.id,
  fullName: user.fullName || '',
  email: user.email || '',
  profilePhoto: user.profilePhoto || null,
  role: user.role || 'BUYER',
  savedAt: Date.now(),
});

/** The list, for the sheet: { accounts, signedIn: Set of ids that can switch without a password }. */
export const useSavedAccounts = create(() => ({ accounts: [], ready: new Set() }));

export async function loadSavedAccounts() {
  const accounts = await readList();
  const ready = new Set();
  await Promise.all(accounts.map(async (a) => { if (await readTokens(a.id)) ready.add(a.id); }));
  useSavedAccounts.setState({ accounts, ready });
  return accounts;
}

/** An account that signed in here: listed (newest first). Its tokens are not copied here. */
export async function rememberAccount(user) {
  if (!user?.id) return;
  const list = (await readList()).filter((a) => a.id !== user.id);
  await writeList([card(user), ...list].slice(0, MAX_ACCOUNTS));
}

/** The signed-in account's live session, kept so the phone can come back to it. */
async function keepCurrentSession() {
  const [[, accessToken], [, refreshToken], [, userJson]] = await AsyncStorage.multiGet([
    STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.REFRESH_TOKEN, STORAGE_KEYS.USER,
  ]);
  const user = userJson ? JSON.parse(userJson) : null;
  if (!user?.id || !refreshToken) return null;
  await SecureStore.setItemAsync(tokenKey(user.id), JSON.stringify({ accessToken, refreshToken }));
  await rememberAccount(user);
  return user;
}

/**
 * Set the signed-in account aside (kept signed in, saved here) and leave the
 * phone signed out, for Add account. `signOutLocally` clears the app's own
 * sign-in without ending the session on the server.
 */
export async function setCurrentAside(signOutLocally) {
  await keepCurrentSession();
  await signOutLocally();
  await loadSavedAccounts();
}

/**
 * Switch to a saved account: the signed-in one is kept, the other's session
 * renewed (so a session that ended shows here, not as a sign-out later).
 * @returns {Promise<{ ok: true, user } | { ok: false, email }>} not ok: log in again
 */
export async function switchToAccount(id, { signIn }) {
  const target = (await readList()).find((a) => a.id === id);
  if (!target) return { ok: false, email: '' };
  const saved = await readTokens(id);
  if (!saved?.refreshToken) return { ok: false, email: target.email };
  let fresh;
  try {
    const res = await axios.post(`${API_BASE_URL}${ENDPOINTS.AUTH.REFRESH_TOKEN}`, { refreshToken: saved.refreshToken });
    fresh = res.data?.data;
    if (!fresh?.accessToken) throw new Error('no token');
  } catch {
    // The session ended (signed out elsewhere, or unused for too long).
    await SecureStore.deleteItemAsync(tokenKey(id)).catch(() => {});
    await loadSavedAccounts();
    return { ok: false, email: target.email };
  }
  await keepCurrentSession().catch(() => null);
  await SecureStore.deleteItemAsync(tokenKey(id)).catch(() => {});
  // The account as the server has it now (name, photo, role may have changed).
  let user = { ...target };
  try {
    const me = await axios.get(`${API_BASE_URL}${ENDPOINTS.AUTH.PROFILE}`, { headers: { Authorization: `Bearer ${fresh.accessToken}` } });
    if (me.data?.data?.id) user = me.data.data;
  } catch {
    // The saved card will do.
  }
  await signIn(user, fresh.accessToken, fresh.refreshToken || saved.refreshToken);
  await loadSavedAccounts();
  return { ok: true, user };
}

/** Takes an account off this phone, ending its kept session on the server. */
export async function forgetAccount(id) {
  const saved = await readTokens(id);
  if (saved?.refreshToken) {
    axios.post(`${API_BASE_URL}/auth/logout`, { refreshToken: saved.refreshToken }).catch(() => {});
  }
  await SecureStore.deleteItemAsync(tokenKey(id)).catch(() => {});
  await writeList((await readList()).filter((a) => a.id !== id));
  await loadSavedAccounts();
}
