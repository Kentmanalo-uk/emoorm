import LegalDocument from '../src/components/public/LegalDocument';

// web/src/pages/CookiePolicy.jsx
const GOOGTRANS = { code: 'googtrans' };

const BLOCKS = [
  { p: 'This page explains how Emoorm uses cookies and similar browser storage. We keep this to a minimum — Emoorm does not use advertising or third-party analytics/tracking cookies.' },

  { h2: 'Sign-in and session data' },
  { p: "When you sign in, Emoorm stores your session token and basic account details in your browser's local storage (not a cookie) so you stay signed in between visits. This data stays on your device and is cleared when you sign out." },

  { h2: 'Language preference cookie' },
  { p: ['If you switch the site language using the language selector in the header, we set a cookie named ', GOOGTRANS, " so the page remembers your chosen language on your next visit. This feature is powered by Google's website translation widget, which may load additional resources from Google when a non-default language is selected."] },

  { h2: 'Sign in with Google' },
  { p: 'If you choose "Sign in with Google," Google may set its own cookies as part of that sign-in flow, governed by Google\'s privacy and cookie practices, not by Emoorm.' },

  { h2: 'Managing cookies' },
  { p: ['Most browsers let you clear or block cookies in their settings. Blocking the ', GOOGTRANS, ' cookie will simply reset the site to its default language; it will not affect your ability to sign in or use the Platform.'] },

  { h2: 'Contact us' },
  { p: ['Questions about this policy can be sent to ', { link: 'support@emoorm.shop', to: 'mailto:support@emoorm.shop' }, '. See also our ', { link: 'Privacy Policy', to: '/privacy' }, '.'] },
];

export default function CookiePolicy() {
  return <LegalDocument title="Cookie Policy" updated="Last updated: August 2026" blocks={BLOCKS} />;
}
