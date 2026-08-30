import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import './Legal.css';

const CookiePolicy = () => (
  <Layout>
    <div className="legal-page">
      <h1>Cookie Policy</h1>
      <p className="legal-updated">Last updated: August 2026</p>

      <p>
        This page explains how Emoorm uses cookies and similar browser storage. We keep this to a
        minimum — Emoorm does not use advertising or third-party analytics/tracking cookies.
      </p>

      <h2>Sign-in and session data</h2>
      <p>
        When you sign in, Emoorm stores your session token and basic account details in your
        browser's local storage (not a cookie) so you stay signed in between visits. This data
        stays on your device and is cleared when you sign out.
      </p>

      <h2>Language preference cookie</h2>
      <p>
        If you switch the site language using the language selector in the header, we set a
        cookie named <code>googtrans</code> so the page remembers your chosen language on your
        next visit. This feature is powered by Google's website translation widget, which may
        load additional resources from Google when a non-default language is selected.
      </p>

      <h2>Sign in with Google</h2>
      <p>
        If you choose "Sign in with Google," Google may set its own cookies as part of that
        sign-in flow, governed by Google's privacy and cookie practices, not by Emoorm.
      </p>

      <h2>Managing cookies</h2>
      <p>
        Most browsers let you clear or block cookies in their settings. Blocking the{' '}
        <code>googtrans</code> cookie will simply reset the site to its default language; it will
        not affect your ability to sign in or use the Platform.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this policy can be sent to{' '}
        <a href="mailto:support@emoorm.com">support@emoorm.com</a>. See also our{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  </Layout>
);

export default CookiePolicy;
