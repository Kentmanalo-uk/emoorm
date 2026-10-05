import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../api/client';
import { API_BASE_URL } from '../../lib/config';

/*
 * "Continue with Google" in the app, the way the website's Android app does
 * it (web/src/lib/appGoogle.js, the browser route): Google will not sign in
 * inside an app, so the phone's browser opens
 *   GET /auth/google/app/start?challenge=<SHA-256 of a secret kept here>
 * and, once Google has answered, comes back to the app at
 *   shop.emoorm.app:/google-signin?ticket=…   (or ?error=…)
 * which opens app/(auth)/google-signin.js; that screen swaps the pass and
 * the secret at POST /auth/google/app/exchange for the same answer as the
 * website's POST /auth/google.
 *
 * The app must answer the shop.emoorm.app scheme (app.json "scheme").
 */

const PENDING_KEY = 'emoorm_google_signin';
const PENDING_TTL_MS = 15 * 60 * 1000;

export const GOOGLE_CANCELLED = ['cancelled', 'access_denied'];
export const GOOGLE_MESSAGES = {
  expired: 'That Google sign-in took too long. Please try again.',
  unavailable: 'Google sign-in is not available right now. Please sign in with your email.',
};

// ── SHA-256 (no crypto module in the app) ──
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 of an ASCII string, as bytes. */
export const sha256 = (ascii) => {
  const bytes = Array.from(ascii, (c) => c.charCodeAt(0) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i -= 1) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = [];
  for (const x of h) out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
  return out;
};

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Bytes as unpadded base64url. */
export const base64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64URL[(n >>> 18) & 63] + B64URL[(n >>> 12) & 63];
    if (i + 1 < bytes.length) s += B64URL[(n >>> 6) & 63];
    if (i + 2 < bytes.length) s += B64URL[n & 63];
  }
  return s;
};

// The secret: 64 characters the server accepts ([A-Za-z0-9_-]).
const makeVerifier = () => {
  const n = 64;
  let bytes;
  try {
    bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    bytes = Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  }
  return Array.from(bytes, (b) => B64URL[b & 63]).join('');
};

/**
 * Opens Google in the phone's browser. `after` is kept for the return:
 * { redirect, seller, from: 'login' | 'register' }.
 * @returns {Promise<String|null>} an error message when it could not start
 */
export async function startGoogleSignIn(after = {}) {
  if (Platform.OS === 'web') return GOOGLE_MESSAGES.unavailable;
  const verifier = makeVerifier();
  const challenge = base64url(sha256(verifier));
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, after, at: Date.now() }));
    await Linking.openURL(`${API_BASE_URL}/auth/google/app/start?${new URLSearchParams({ challenge })}`);
    return null;
  } catch {
    return GOOGLE_MESSAGES.unavailable;
  }
}

/** What startGoogleSignIn kept (the secret and where to go after), once. */
export async function takePendingGoogle() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    await AsyncStorage.removeItem(PENDING_KEY);
    const pending = raw ? JSON.parse(raw) : null;
    if (!pending || Date.now() - pending.at > PENDING_TTL_MS) return null;
    return pending;
  } catch {
    return null;
  }
}

/** The pass from the browser, swapped for the answer of POST /auth/google. */
export async function exchangeGoogleTicket(ticket, verifier) {
  const res = await apiClient.post('/auth/google/app/exchange', { ticket, verifier });
  return res.data;
}

// ── Handing Google's answer to the Log in / Sign up screen ──
// The return screen (google-signin) gives the answer to the form that
// started the sign-in: { data } (as from POST /auth/google), { error } or
// { cancelled }. A form that is not open yet takes it when it opens.
let pendingAnswer = null;
const listeners = new Set();

/** True when a Log in / Sign up form is open to take the answer. */
export const hasGoogleListener = () => listeners.size > 0;

export function deliverGoogleAnswer(answer) {
  pendingAnswer = answer;
  for (const fn of listeners) {
    if (!pendingAnswer) break;
    fn(pendingAnswer);
  }
}

/**
 * A form's side: `handler(answer)` is called with Google's answer (also one
 * that came before the form opened). Returns the unsubscribe function.
 */
export function onGoogleAnswer(handler) {
  const fn = (answer) => {
    pendingAnswer = null;
    handler(answer);
  };
  listeners.add(fn);
  if (pendingAnswer) fn(pendingAnswer);
  return () => listeners.delete(fn);
}
