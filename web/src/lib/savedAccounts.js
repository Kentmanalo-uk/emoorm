import axios from 'axios';
import { create } from 'zustand';
import { API_CONFIG } from '../config/api';

/*
 * The accounts saved in this browser, for Settings → Switch account (as
 * shopping apps do): every account that signs in here is listed; switching
 * away from one keeps it signed in (its session's tokens), so switching back
 * needs no password. Ported from the app (mobile/src/store/savedAccounts.js).
 *
 *   list    emoorm-saved-accounts  [{ id, fullName, email, profilePhoto, role, savedAt }]
 *   tokens  emoorm-acct-<id>       { accessToken, refreshToken }
 *
 * Only accounts this browser has switched away from hold tokens: refresh
 * tokens rotate, so the signed-in account's live tokens stay where the API
 * client keeps (and renews) them ('token', 'refreshToken'), and are copied
 * here only at the moment of switching away. An account that signed out, or
 * whose session ran out, stays listed without tokens: picking it opens the
 * login with its email.
 *
 * This file does not import the auth store (which imports it): the sign-in
 * and sign-out are handed in by the caller.
 */

const LIST_KEY = 'emoorm-saved-accounts';
const tokenKey = (id) => `emoorm-acct-${String(id).replace(/[^A-Za-z0-9._-]/g, '')}`;
const MAX_ACCOUNTS = 5;

const readJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked: the list just is not kept. */
  }
};

const removeKey = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Nothing to do. */
  }
};

const readList = () => {
  const list = readJson(LIST_KEY);
  return Array.isArray(list) ? list.filter((a) => a && a.id) : [];
};

const readTokens = (id) => {
  const saved = readJson(tokenKey(id));
  return saved?.refreshToken ? saved : null;
};

const readyIds = (accounts) => new Set(accounts.filter((a) => readTokens(a.id)).map((a) => a.id));

/** The list, for the sheet: { accounts, ready: Set of ids that can switch without a password }. */
export const useSavedAccounts = create(() => {
  const accounts = typeof window === 'undefined' ? [] : readList();
  return { accounts, ready: typeof window === 'undefined' ? new Set() : readyIds(accounts) };
});

const writeList = (list) => {
  writeJson(LIST_KEY, list);
  useSavedAccounts.setState({ accounts: list, ready: readyIds(list) });
};

/** Re-read the list (another tab may have changed it). */
export const loadSavedAccounts = () => {
  const accounts = readList();
  useSavedAccounts.setState({ accounts, ready: readyIds(accounts) });
  return accounts;
};

const card = (user) => ({
  id: user.id,
  fullName: user.fullName || '',
  email: user.email || '',
  profilePhoto: user.profilePhoto || null,
  role: user.role || 'BUYER',
  savedAt: Date.now(),
});

/**
 * Ends a kept session on the server (POST /auth/logout needs a live access
 * token, and the kept one may have run out: renewed first). Best effort.
 */
const endKeptSession = (saved) => {
  if (!saved?.refreshToken) return;
  const base = API_CONFIG.BASE_URL;
  axios.post(`${base}/auth/refresh-token`, { refreshToken: saved.refreshToken })
    .then((res) => {
      const fresh = res.data?.data;
      if (!fresh?.accessToken) return null;
      return axios.post(`${base}/auth/logout`, { refreshToken: fresh.refreshToken || saved.refreshToken }, {
        headers: { Authorization: `Bearer ${fresh.accessToken}` },
      });
    })
    .catch(() => {});
};

/** An account that signed in here: listed first. Its tokens are not copied here. */
export const rememberAccount = (user) => {
  if (!user?.id) return;
  const list = readList().filter((a) => a.id !== user.id);
  writeList([card(user), ...list].slice(0, MAX_ACCOUNTS));
};

/** The signed-in account's name or photo changed: its card follows (only if it is listed). */
export const refreshSavedAccount = (user) => {
  if (!user?.id) return;
  const list = readList();
  const at = list.findIndex((a) => a.id === user.id);
  if (at < 0) return;
  const next = { ...card(user), savedAt: list[at].savedAt };
  const was = list[at];
  if (was.fullName === next.fullName && was.email === next.email
    && was.profilePhoto === next.profilePhoto && was.role === next.role) return;
  list[at] = next;
  writeList(list);
};

/**
 * Signed in with a password (or Google) as an account that was set aside
 * here: the kept session is no longer needed, so it is ended.
 */
export const dropKeptSession = (id) => {
  const saved = readTokens(id);
  if (!saved) return;
  removeKey(tokenKey(id));
  endKeptSession(saved);
  loadSavedAccounts();
};

/** The signed-in account's live session, kept so this browser can come back to it. */
const keepCurrentSession = () => {
  const user = readJson('user');
  let accessToken = null;
  let refreshToken = null;
  try {
    accessToken = localStorage.getItem('token') || localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
  } catch {
    /* Storage blocked. */
  }
  if (!user?.id || !refreshToken) return null;
  writeJson(tokenKey(user.id), { accessToken, refreshToken });
  rememberAccount(user);
  return user;
};

/**
 * Set the signed-in account aside (kept signed in, saved here) and leave the
 * browser signed out, for Add another account. `signOutLocally` clears the
 * site's own sign-in without ending the session on the server.
 */
export const setCurrentAside = (signOutLocally) => {
  keepCurrentSession();
  signOutLocally();
  loadSavedAccounts();
};

/**
 * Switch to a saved account: the signed-in one is kept, the other's session
 * renewed (so a session that ended shows here, not as a sign-out later).
 * @param {String} id
 * @param {{ signIn: Function }} handlers - signIn(user, accessToken, refreshToken)
 * @returns {Promise<{ ok: true, user: Object } | { ok: false, email: String }>} not ok: log in again
 */
export const switchToAccount = async (id, { signIn }) => {
  const target = readList().find((a) => a.id === id);
  if (!target) return { ok: false, email: '' };
  const saved = readTokens(id);
  if (!saved) return { ok: false, email: target.email };
  let fresh;
  try {
    const res = await axios.post(`${API_CONFIG.BASE_URL}/auth/refresh-token`, { refreshToken: saved.refreshToken });
    fresh = res.data?.data;
    if (!fresh?.accessToken) throw new Error('No token');
  } catch {
    // The session ended (signed out elsewhere, or unused for too long).
    removeKey(tokenKey(id));
    loadSavedAccounts();
    return { ok: false, email: target.email };
  }
  keepCurrentSession();
  removeKey(tokenKey(id));
  // The account as the server has it now (name, photo, role may have changed).
  let user = { ...target };
  try {
    const me = await axios.get(`${API_CONFIG.BASE_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${fresh.accessToken}` },
    });
    const profile = me.data?.data || me.data;
    if (profile?.id) user = profile;
  } catch {
    // The saved card will do.
  }
  signIn(user, fresh.accessToken, fresh.refreshToken || saved.refreshToken);
  loadSavedAccounts();
  return { ok: true, user };
};

/** Takes an account off this browser, ending its kept session on the server. */
export const forgetAccount = (id) => {
  const saved = readTokens(id);
  removeKey(tokenKey(id));
  endKeptSession(saved);
  writeList(readList().filter((a) => a.id !== id));
};

// Another tab added, removed or switched an account: the list here follows.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LIST_KEY || e.key?.startsWith('emoorm-acct-')) loadSavedAccounts();
  });
}
