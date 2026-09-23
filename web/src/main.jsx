import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.jsx';
import { loadGoogleTranslate } from './lib/googleTranslate';
import { bootTheme } from './hooks/useTheme';

loadGoogleTranslate();

// The saved palette, from this browser's copy, before React renders. The
// server's version still wins once it arrives; this only stops the first
// paint happening in the shipped green and then snapping.
bootTheme();

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * The provider is mounted unconditionally on purpose.
 *
 * Login and Register call useGoogleLogin(), which throws "Google OAuth
 * components must be used within GoogleOAuthProvider" the moment the context
 * is missing — that takes down the whole sign-in page, not just the Google
 * button. Mounting it without a client id is the lesser problem: Google logs
 * a recoverable "Missing required parameter client_id" and the email and
 * password form still works.
 *
 * The id is baked in at build time, so a production build made without
 * VITE_GOOGLE_CLIENT_ID has no Google sign-in at all, with nothing to show
 * for it in development where the variable is set. Hence the warning.
 */
if (!GOOGLE_CLIENT_ID && import.meta.env.PROD) {
  console.warn('[auth] VITE_GOOGLE_CLIENT_ID was not set at build time — Google sign-in will not work.');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
