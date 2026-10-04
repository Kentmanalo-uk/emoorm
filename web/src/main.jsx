import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import './styles/phone-app.css';
import './styles/motion.css';
import App from './App.jsx';
import { loadGoogleTranslate, getCurrentLanguage } from './lib/googleTranslate';
import { startCuratedTagalog } from './lib/tagalog';
import { bootTheme } from './hooks/useTheme';
import { setupPwaInstall } from './lib/pwaInstall';

// Google's translator loads only for someone who chose another language
// (choosing one reloads the page); English pages skip its scripts.
const language = getCurrentLanguage();
if (language !== 'en') loadGoogleTranslate();
// Tagalog: our own wording for the app's buttons and labels, ahead of Google's.
if (language === 'tl') startCuratedTagalog();

// React Router calls the page a fresh load opens "default", on every fresh
// load. Each load gets a name of its own instead, so what a page remembers
// of one visit (where it was scrolled, the tab picked) stays with that
// visit; a reload keeps the name, and so finds the page as it was.
if (!window.history.state?.key) {
  window.history.replaceState({
    usr: null, idx: 0, ...window.history.state, key: Math.random().toString(36).slice(2, 10),
  }, '');
}

// Listen for the browser's offer to install the app (it can come early) and
// register the service worker that makes the site installable.
setupPwaInstall();

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
