import { useEffect, useRef, useState } from 'react';
import { CheckCircle, EnvelopeSimple, X } from '../../lib/icons';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import useFocusTrap from '../../hooks/useFocusTrap';
import useAuthStore from '../../store/authStore';
import axios from '../../lib/axios';
import { PLAY_JOIN_URL, remember, remembered } from '../../lib/playEarly';

/**
 * The early version of E-MOORM on Google Play (closed testing). Google lets
 * only the accounts on our tester list install it, so this asks for the Gmail
 * someone uses on Google Play. A super admin adds it in Play Console and the
 * person gets an email with the link to join (backend playTester.service).
 *
 * On the /app page it opens by itself once (lib/playEarly shouldInvite); the
 * button on the page opens it any time.
 */

/** The Google Play triangle, drawn small for the buttons. */
export function PlayMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#00d7fe" d="M3.6 2.2 13.4 12l-9.8 9.8c-.4-.2-.6-.7-.6-1.2V3.4c0-.5.2-1 .6-1.2Z" />
      <path fill="#ffce00" d="m16.7 8.7-3.3 3.3 3.3 3.3 3.8-2.2c1-.6 1-1.6 0-2.2l-3.8-2.2Z" />
      <path fill="#ff3a44" d="M16.7 15.3 13.4 12l-9.8 9.8c.4.2.9.2 1.4-.1l11.7-6.4Z" />
      <path fill="#00f076" d="M16.7 8.7 5 2.3c-.5-.3-1-.3-1.4-.1l9.8 9.8 3.3-3.3Z" />
    </svg>
  );
}

const ICON = '/icon-192x192.png';

export default function PlayEarlyAccess({ open, onClose }) {
  const user = useAuthStore((s) => s.user);
  const { mounted, closing } = useSheetPresence(open);
  const panel = useFocusTrap(open, { onClose });
  const input = useRef(null);
  // A Gmail given before, or the signed-in account's, fills itself in.
  const [email, setEmail] = useState(() => remembered()?.email
    || (/@gmail\.com$/i.test(user?.email || '') ? user.email : ''));
  const [state, setState] = useState(() => {
    const saved = remembered();
    return saved?.joined ? { done: true, added: Boolean(saved.added), email: saved.email } : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open, panel]);

  if (!mounted) return null;

  const later = () => {
    if (!state?.done) remember({ ...remembered(), later: Date.now() });
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) {
      setError('Enter the Gmail address you use on Google Play.');
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await axios.post('/app/testers', { email: value }, { quiet: true });
      const data = res.data || {};
      remember({ joined: true, added: Boolean(data.added), email: data.email || value });
      setState({ done: true, added: Boolean(data.added), email: data.email || value });
    } catch (err) {
      setError(err.message || 'Could not send that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const notGmail = email.includes('@') && !/@gmail\.com\s*$/i.test(email);

  return (
    <div
      className={`appdl-sheet-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={later}
      role="presentation"
    >
      <div
        ref={panel}
        className="appdl-sheet appdl-early ui-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appdl-early-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="appdl-sheet-close appdl-early-close" onClick={later} aria-label="Close">
          <X size={15} weight="bold" />
        </button>

        <div className="appdl-early-art" aria-hidden="true">
          <img src={ICON} alt="" />
          <span className="appdl-early-play"><PlayMark size={26} /></span>
        </div>

        {state?.done ? (
          <>
            <h2 id="appdl-early-title" className="appdl-early-title">
              {state.added ? "You're already a tester" : "You're on the list!"}
            </h2>
            {state.added ? (
              <p className="appdl-early-text">
                Open the link on your Android phone, tap <strong>Become a tester</strong>, then install Emoorm from
                Google Play. Use the Google account <strong>{state.email}</strong>.
              </p>
            ) : (
              <p className="appdl-early-text">
                We&apos;ll add <strong>{state.email}</strong> to the testers and email you the link to join. Then
                install Emoorm from Google Play on that account.
              </p>
            )}
            <div className="appdl-early-actions">
              {state.added && (
                <a className="appdl-get appdl-early-yes" href={PLAY_JOIN_URL} target="_blank" rel="noopener noreferrer">
                  <PlayMark size={18} /> Join on Google Play
                </a>
              )}
              <button
                type="button"
                className={state.added ? 'appdl-early-later' : 'appdl-get appdl-early-yes'}
                onClick={onClose}
              >
                {state.added ? 'Close' : (<><CheckCircle size={18} weight="fill" aria-hidden="true" /> Done</>)}
              </button>
            </div>
            {!state.added && (
              <button
                type="button"
                className="appdl-early-change"
                onClick={() => { setState(null); setTimeout(() => input.current?.focus(), 0); }}
              >
                Use a different Gmail
              </button>
            )}
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <span className="appdl-early-kicker">Early version</span>
            <h2 id="appdl-early-title" className="appdl-early-title">Be one of the first on Google Play</h2>
            <p className="appdl-early-text">
              Emoorm is coming to the Play Store. Join the early version: install it from Google Play, get updates by
              themselves, and help us make it better before everyone else.
            </p>
            <label className="appdl-early-label" htmlFor="appdl-early-email">Your Gmail on Google Play</label>
            <div className={`appdl-early-field${error ? ' has-error' : ''}`}>
              <EnvelopeSimple size={19} aria-hidden="true" />
              <input
                ref={input}
                id="appdl-early-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="yourname@gmail.com"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(''); }}
                aria-invalid={Boolean(error)}
                aria-describedby="appdl-early-hint"
                maxLength={191}
              />
            </div>
            <p id="appdl-early-hint" className={`appdl-early-hint${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
              {error || (notGmail
                ? 'Use the Google account signed in on your phone\'s Play Store.'
                : 'Only used to add you to the testers. Android phones only.')}
            </p>
            <div className="appdl-early-actions">
              <button type="submit" className="appdl-get appdl-early-yes" disabled={busy}>
                <PlayMark size={18} /> {busy ? 'Joining…' : 'Yes, count me in'}
              </button>
              <button type="button" className="appdl-early-later" onClick={later}>Not now</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
