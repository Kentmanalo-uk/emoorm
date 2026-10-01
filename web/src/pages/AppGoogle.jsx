import { useMemo, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from '../lib/axios';
import AppLogo from '../components/AppLogo';
import './AppGoogle.css';

/*
 * /app-google?challenge=…: "Continue with Google" for the E-MOORM Android
 * app. The app opens this page in the phone's browser (Google's sign-in
 * works there, not inside the app). The person signs in with the website's
 * usual Google pop-up; the server turns Google's answer and the app's
 * challenge into a one-time pass, and the browser goes back to the app with
 * it (shop.emoorm.app:/google-signin?ticket=…). Only the app holds the secret
 * that makes the pass usable.
 */

const GOOGLE_ICON = (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export default function AppGoogle() {
  const challenge = useMemo(() => new URLSearchParams(window.location.search).get('challenge') || '', []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [returnUrl, setReturnUrl] = useState('');

  const back = (params) => {
    const url = `shop.emoorm.app:/google-signin?${new URLSearchParams(params)}`;
    window.location.href = url;
  };

  const signIn = useGoogleLogin({
    flow: 'auth-code',
    onError: () => setError('Google sign-in failed. Please try again.'),
    onNonOAuthError: (err) => {
      if (err?.type !== 'popup_closed') setError('Google sign-in was interrupted. Please try again.');
    },
    onSuccess: async ({ code }) => {
      if (!code) return;
      setBusy(true);
      setError('');
      try {
        const res = await axios.post('/auth/google/app/ticket', { code, challenge });
        setReturnUrl(res.data.returnUrl);
        // Straight back to the app; the button below if the browser asks first.
        window.location.href = res.data.returnUrl;
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Google sign-in failed. Please try again.');
      } finally {
        setBusy(false);
      }
    },
  });

  if (!challenge) {
    return (
      <main className="ag-page">
        <AppLogo className="ag-logo" />
        <h1>Open this from the app</h1>
        <p>This page signs you in to the E-MOORM Android app. Tap &ldquo;Sign in with Google&rdquo; in the app to use it.</p>
      </main>
    );
  }

  return (
    <main className="ag-page">
      <AppLogo className="ag-logo" />
      {returnUrl ? (
        <>
          <h1>You&apos;re signed in</h1>
          <p>Going back to the E-MOORM app…</p>
          <a className="ag-back" href={returnUrl}>Back to the app</a>
        </>
      ) : (
        <>
          <h1>Sign in to E-MOORM</h1>
          <p>Continue with your Google account. You&apos;ll go back to the app after.</p>
          <button type="button" className="ag-google" onClick={() => signIn()} disabled={busy}>
            {GOOGLE_ICON} {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
          {error && <p className="ag-error" role="alert">{error}</p>}
          <button type="button" className="ag-google" onClick={() => back({ error: 'cancelled' })}>
            Cancel
          </button>
        </>
      )}
    </main>
  );
}
