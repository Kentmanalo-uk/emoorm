import { useEffect, useState } from 'react';
import axios from './axios';
import { inAndroidApp } from './inApp';

/**
 * Continue with Facebook, the browser side.
 *
 * The button sends the person to Facebook's login dialog; Facebook sends them
 * back to /facebook-return (pages/FacebookReturn.jsx) with a code, which the
 * Log in page posts to the server (POST /auth/facebook). A random `state`,
 * kept in this tab, proves the code belongs to the sign-in started here.
 *
 * Not in the Android app: Facebook does not allow its login inside an app's
 * web view.
 */
const KEY = 'emoorm.facebookLogin';
const MAX_AGE = 15 * 60 * 1000;
const DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth';

export const facebookReturnUri = () => `${window.location.origin}/facebook-return`;

let configPromise = null;
const loadConfig = () => {
  if (!configPromise) {
    configPromise = axios.get('/auth/facebook/config')
      .then((res) => res.data || { enabled: false })
      .catch(() => {
        configPromise = null;
        return { enabled: false };
      });
  }
  return configPromise;
};

/** { enabled, appId } once the server answers; off in the Android app. */
export function useFacebookLogin() {
  const [config, setConfig] = useState({ enabled: false });
  useEffect(() => {
    if (inAndroidApp()) return undefined;
    let live = true;
    loadConfig().then((c) => { if (live) setConfig(c); });
    return () => { live = false; };
  }, []);
  return config;
}

/**
 * Off to Facebook. `seller`: come back to the Seller Login; `from`: where to
 * go once signed in (the page that asked for it).
 */
export function startFacebookLogin(appId, { seller = false, from = null } = {}) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ state, seller, from, at: Date.now() }));
  } catch { /* storage blocked: the return will say the sign-in expired */ }
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: facebookReturnUri(),
    state,
    response_type: 'code',
    scope: 'public_profile,email',
  });
  window.location.assign(`${DIALOG}?${params}`);
}

/**
 * Facebook's answer on /facebook-return, checked against the sign-in this tab
 * started (used once). { code, seller, from } or { error, seller, from }.
 */
export function takeFacebookReturn(search) {
  const q = new URLSearchParams(search);
  let started = null;
  try {
    started = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
  } catch { /* nothing kept */ }
  const seller = Boolean(started?.seller);
  const from = typeof started?.from === 'string' && started.from.startsWith('/') && !started.from.startsWith('//')
    ? started.from : null;
  if (q.get('error')) {
    // Cancelled on Facebook's page: not an error worth a red message.
    return { cancelled: q.get('error') === 'access_denied', error: 'Facebook sign-in was cancelled.', seller, from };
  }
  const code = q.get('code');
  if (!code || !started || started.state !== q.get('state') || Date.now() - started.at > MAX_AGE) {
    return { error: 'That Facebook sign-in expired. Please try again.', seller, from };
  }
  return { code, seller, from };
}
