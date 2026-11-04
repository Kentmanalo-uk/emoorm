import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * Wraps a page that signs in with Google (Login, Register, AppGoogle) in
 * Google's provider, which loads Google's sign-in script (about 100 kB).
 * It used to wrap the whole app, so every visitor downloaded that script on
 * every page; now only these pages do.
 *
 * The page's useGoogleLogin() throws "Google OAuth components must be used
 * within GoogleOAuthProvider" when the context is missing, which takes down
 * the whole sign-in page, so the provider is always there for them, even
 * without a client id: Google then logs a recoverable "Missing required
 * parameter client_id" and the email and password form still works.
 *
 * The id is baked in at build time, so a production build made without
 * VITE_GOOGLE_CLIENT_ID has no Google sign-in at all (main.jsx warns).
 *
 *   export default withGoogle(Login);
 */
export default function withGoogle(Page) {
  function WithGoogle(props) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <Page {...props} />
      </GoogleOAuthProvider>
    );
  }
  WithGoogle.displayName = `WithGoogle(${Page.displayName || Page.name || 'Page'})`;
  return WithGoogle;
}
