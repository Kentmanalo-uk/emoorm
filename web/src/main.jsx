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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
