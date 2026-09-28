import { useEffect, useRef } from 'react';
import axios from './axios';

/**
 * "Continue with Google" inside the E-MOORM Android app (apk/). Google blocks
 * its sign-in pop-up inside an app's web view, so the app does it:
 *  - app 1.2+: Android's own Google account sheet, inside the app; Google
 *    vouches for the account with an ID token, signed in with here through
 *    POST /auth/google, as the pop-up's answer is;
 *  - app 1.1 (and phones without Google Play services): the phone's browser,
 *    which comes back with a one-time pass, swapped here for the same answer.
 *
 * Only when the app offers it: in a browser `available` is false and the page
 * keeps its usual Google pop-up.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const appBridge = () => (typeof window === 'undefined' ? null : window.EmoormAndroid);
const hasNativeGoogle = () => typeof appBridge()?.signInWithGoogle === 'function' && Boolean(GOOGLE_CLIENT_ID);
const hasBrowserGoogle = () => typeof appBridge()?.startGoogleSignIn === 'function';

export const hasAppGoogle = () => hasNativeGoogle() || hasBrowserGoogle();

// What the app reports back besides an answer: the person closed Google or
// cancelled there, or the sign-in could not finish.
const CANCELLED = ['cancelled', 'access_denied'];
const MESSAGES = {
  expired: 'That Google sign-in took too long. Please try again.',
  unavailable: 'Google sign-in is not available right now. Please sign in with your email.',
};

/**
 * @param {Object} handlers
 * @param {Function} handlers.onAnswer - (data) => void, data as from POST /auth/google
 * @param {Function} handlers.onError - (message) => void
 * @param {Function} handlers.onCancel - () => void
 * @returns {{ available: Boolean, start: Function }} start asks the app to sign in with Google
 */
export function useAppGoogleSignIn(handlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!hasAppGoogle()) return undefined;
    // The app calls this with Google's answer (or when it was closed).
    window.__emoormGoogleResult = async (result = {}) => {
      const { onAnswer, onError, onCancel } = latest.current;
      if (result.cancelled || CANCELLED.includes(result.error)) {
        onCancel();
        return;
      }
      let request;
      if (result.idToken) {
        request = axios.post('/auth/google', { idToken: result.idToken });
      } else if (result.ticket && result.verifier) {
        request = axios.post('/auth/google/app/exchange', { ticket: result.ticket, verifier: result.verifier });
      } else {
        onError(MESSAGES[result.error] || 'Google sign-in did not finish. Please try again.');
        return;
      }
      try {
        const res = await request;
        onAnswer(res.data);
      } catch (err) {
        onError(err?.response?.data?.message || err?.message || 'Google sign-in failed.');
      }
    };
    return () => {
      delete window.__emoormGoogleResult;
    };
  }, []);

  return {
    available: hasAppGoogle(),
    start: () => {
      if (hasNativeGoogle()) {
        appBridge().signInWithGoogle(GOOGLE_CLIENT_ID);
      } else {
        appBridge().startGoogleSignIn();
      }
    },
  };
}
