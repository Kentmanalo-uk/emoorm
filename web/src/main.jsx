import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import './index.css';
import './styles/phone-app.css';
import './styles/motion.css';
import './styles/iconTiles.css';
import App from './App.jsx';
import { loadGoogleTranslate, getCurrentLanguage } from './lib/googleTranslate';
import { startCuratedTagalog } from './lib/tagalog';
import { keepOriginalText } from './lib/noTranslate';
import { bootTheme } from './hooks/useTheme';
import { setupPwaInstall } from './lib/pwaInstall';
import { watchProductLinks } from './lib/prefetch';
import { startFreshnessWatch } from './lib/freshness';
import { guardAgainstTranslate } from './lib/translateGuard';
import ErrorBoundary from './components/ErrorBoundary';
import { reloadForNewVersion } from './lib/reloadForUpdate';

// Translation (ours or the browser's) rewrites the page's text; React must
// not crash on the nodes it moved (lib/translateGuard).
guardAgainstTranslate();
// A page's code that a deploy replaced while this tab was open: reload once
// for the new version instead of failing (lib/reloadForUpdate).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

// Google's translator loads only for someone who chose another language
// (choosing one reloads the page); English pages skip its scripts.
const language = getCurrentLanguage();
// Prices, names and chat messages stay as written (lib/noTranslate); marked
// before the translator starts.
if (language !== 'en') {
  keepOriginalText();
  loadGoogleTranslate();
}
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
// A product's data is fetched as soon as its link is touched (lib/prefetch).
watchProductLinks();
// A page open across a deploy (the Android app in the background) picks up
// the new build when it is next looked at.
startFreshnessWatch();

// The saved palette, from this browser's copy, before React renders. The
// server's version still wins once it arrives; this only stops the first
// paint happening in the shipped green and then snapping.
bootTheme();

/**
 * Google's sign-in provider wraps only the pages that sign in with Google
 * (lib/withGoogle.jsx), so other pages never load Google's script.
 *
 * The client id is baked in at build time, so a production build made
 * without VITE_GOOGLE_CLIENT_ID has no Google sign-in at all, with nothing to
 * show for it in development where the variable is set. Hence the warning.
 */
if (!import.meta.env.VITE_GOOGLE_CLIENT_ID && import.meta.env.PROD) {
  console.warn('[auth] VITE_GOOGLE_CLIENT_ID was not set at build time — Google sign-in will not work.');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
