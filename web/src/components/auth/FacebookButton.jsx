/**
 * "Continue with Facebook" (lib/facebookLogin): Facebook's own "f" mark and
 * the same button look as the Google one beside it (`className`).
 */
export default function FacebookButton({ className, onClick, busy = false, label = 'Continue with Facebook' }) {
  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path d="M15.6 15.5l.5-3.4h-3.3V9.9c0-.9.5-1.8 1.9-1.8h1.5V5.2s-1.3-.2-2.6-.2c-2.7 0-4.4 1.6-4.4 4.6v2.5H6.3v3.4h2.9V24c.6.1 1.2.1 1.8.1s1.2 0 1.8-.1v-8.5z" fill="#fff" />
      </svg>
      {busy ? 'Signing in…' : label}
    </button>
  );
}
