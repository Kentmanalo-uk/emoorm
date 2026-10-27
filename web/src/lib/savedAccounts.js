import axios from 'axios';
import { create } from 'zustand';
import { API_CONFIG } from '../config/api';

/*
 * The accounts saved in this browser, for Settings → Switch account (as
 * shopping apps do): every account that signs in here is listed; switching
 * away from one keeps it signed in, so switching back needs no password.
 * Ported from the app (mobile/src/store/savedAccounts.js).
 *
 *   list   emoorm-saved-accounts  [{ id, fullName, email, profilePhoto, role, savedAt }]
 *
 * The sessions themselves are never in the page: the signed-in one is the
 * httpOnly cookie the server sets (lib/axios sends X-Session: cookie), and
 * an account set aside keeps its session in its own httpOnly cookie
 * (POST /auth/sessions/keep, /switch, /forget). Which accounts can switch
 * without a password comes from GET /auth/sessions/kept. Sessions this
 * browser kept in its storage before (emoorm-acct-<id>) are handed to the
 * server once (/auth/sessions/adopt) and removed.
 *
 * An account that signed out, or whose session ran out, stays listed:
 * picking it opens the login with its email.
 *
 * This file does not import the auth store (which imports it): the sign-in
 * and sign-out are handed in by the caller.
 */

const LIST_KEY = 'emoorm-saved-accounts';
const LEGACY_TOKENS = /^emoorm-acct-/;
const MAX_ACCOUNTS = 5;

// The session endpoints, with the cookies (and without the API client's
// interceptors, which would renew or sign out on a 401 here).
const sessions = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'X-Session': 'cookie' },
});

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

/** The list, for the sheet: { accounts, ready: Set of ids that can switch without a password }. */
export const useSavedAccounts = create(() => ({
  accounts: typeof window === 'undefined' ? [] : readList(),
  ready: new Set(),
}));

const writeList = (list) => {
  writeJson(LIST_KEY, list);
  useSavedAccounts.setState({ accounts: list });
};

/** Which saved accounts still have a session set aside here (from their cookies). */
const loadReady = async () => {
  try {
    const res = await sessions.get('/auth/sessions/kept');
    const ids = res.data?.data?.userIds || [];
    useSavedAccounts.setState({ ready: new Set(ids) });
  } catch {
    /* Keep what was known. */
  }
};

/** Re-read the list (another tab may have changed it) and which can switch. */
export const loadSavedAccounts = () => {
  const accounts = readList();
  useSavedAccounts.setState({ accounts });
  loadReady();
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

/** Ends a session set aside here (the server revokes it and clears its cookie). Best effort. */
const endKeptSession = (id) => sessions.post('/auth/sessions/forget', { userId: id }).catch(() => {});

/** An account that signed in here: listed first. */
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
  if (!id) return;
  endKeptSession(id).finally(loadReady);
};

/**
 * Set the signed-in account aside (kept signed in, its session moved to its
 * own cookie) and leave the browser signed out, for Add another account.
 * `signOutLocally` clears the site's own sign-in without ending the session
 * on the server.
 */
export const setCurrentAside = async (signOutLocally) => {
  const user = readJson('user');
  try {
    await sessions.post('/auth/sessions/keep');
  } catch {
    /* Signed out here anyway; picking it later asks for the password. */
  }
  if (user?.id) rememberAccount(user);
  signOutLocally();
  loadSavedAccounts();
};

/**
 * Switch to a saved account: the signed-in one is set aside, the other's
 * session renewed (so a session that ended shows here, not as a sign-out later).
 * @param {String} id
 * @param {{ signIn: Function }} handlers - signIn(user, accessToken)
 * @returns {Promise<{ ok: true, user: Object } | { ok: false, email: String }>} not ok: log in again
 */
export const switchToAccount = async (id, { signIn }) => {
  const target = readList().find((a) => a.id === id);
  if (!target) return { ok: false, email: '' };
  const current = readJson('user');
  let accessToken;
  try {
    const res = await sessions.post('/auth/sessions/switch', { userId: id });
    accessToken = res.data?.data?.accessToken;
    if (!accessToken) throw new Error('No token');
  } catch {
    // The session ended (signed out elsewhere, or unused for too long).
    loadSavedAccounts();
    return { ok: false, email: target.email };
  }
  if (current?.id) rememberAccount(current);
  // The account as the server has it now (name, photo, role may have changed).
  let user = { ...target };
  try {
    const me = await sessions.get('/auth/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
    const profile = me.data?.data || me.data;
    if (profile?.id) user = profile;
  } catch {
    // The saved card will do.
  }
  signIn(user, accessToken);
  loadSavedAccounts();
  return { ok: true, user };
};

/** Takes an account off this browser, ending its kept session on the server. */
export const forgetAccount = (id) => {
  endKeptSession(id).finally(loadReady);
  writeList(readList().filter((a) => a.id !== id));
};

/**
 * Sessions an earlier version kept in this page's storage go to the server
 * (each into its own cookie) and leave the storage.
 */
const adoptStoredSessions = async () => {
  let keys;
  try {
    keys = Object.keys(localStorage).filter((k) => LEGACY_TOKENS.test(k));
  } catch {
    return;
  }
  for (const key of keys) {
    const saved = readJson(key);
    removeKey(key);
    if (!saved?.refreshToken) continue;
    await sessions.post('/auth/sessions/adopt', { refreshToken: saved.refreshToken }).catch(() => {});
  }
  if (keys.length) loadReady();
};

if (typeof window !== 'undefined') {
  adoptStoredSessions();
  // Another tab added, removed or switched an account: the list here follows.
  window.addEventListener('storage', (e) => {
    if (e.key === LIST_KEY) loadSavedAccounts();
  });
}
