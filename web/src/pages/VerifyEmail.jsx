import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import AppLogo from '../components/AppLogo';
import useAuthStore from '../store/authStore';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { BusyLabel } from '../components/ui/Spinner';
import './ResetPassword.css';
import './AuthSheet.css';

/**
 * /verify-email?token=… — the link in the welcome email. Opening it confirms
 * the address (no sign-in needed). A dead link offers a fresh one to a
 * signed-in account, or sign-in first.
 */
const VerifyEmail = () => {
  const isPhone = usePhoneLayout();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { user, isAuthenticated, updateUser } = useAuthStore();
  const [state, setState] = useState(token ? 'checking' : 'failed');
  const [message, setMessage] = useState(token ? '' : 'This link is missing its code. Open the link from your email again.');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  // One request per token, even when React runs the effect twice.
  const asked = useRef('');

  useEffect(() => {
    if (!token || asked.current === token) return;
    asked.current = token;
    axios.post('/auth/verify-email', { token })
      .then((res) => {
        const confirmed = res.data?.email || '';
        setEmail(confirmed);
        setState('done');
        const current = useAuthStore.getState().user;
        if (current && (!confirmed || current.email === confirmed)) updateUser({ ...current, isVerified: true });
      })
      .catch((err) => {
        setMessage(err.message || 'This confirmation link is invalid or has expired.');
        setState('failed');
      });
  }, [token, updateUser]);

  const resend = async () => {
    setSending(true);
    try {
      const res = await axios.post('/auth/resend-verification');
      toast.success(`We sent a new link to ${res.data?.email || 'your email'}.`);
    } catch (err) {
      toast.error(err.message || 'Could not send a new link. Try again in a minute.');
    } finally {
      setSending(false);
    }
  };

  const alreadyConfirmed = isAuthenticated && user?.isVerified === true;

  return (
    <div className={`rp-page${isPhone ? ' is-sheet' : ''}`}>
      <header className="rp-header">
        <div className="rp-header-container">
          <Link to="/" className="rp-logo">
            <AppLogo className="rp-logo-icon" />
            <span className="rp-logo-text">emoorm</span>
          </Link>
        </div>
      </header>

      <div className="rp-content">
        <div className="rp-card">
          {state === 'checking' && (
            <div className="rp-done">
              <h2 className="rp-title">Confirming your email…</h2>
              <p className="rp-description"><BusyLabel>One moment</BusyLabel></p>
            </div>
          )}

          {state === 'done' && (
            <div className="rp-done">
              <div className="rp-done-icon" aria-hidden="true">
                <CheckCircle size={32} weight="fill" />
              </div>
              <h2 className="rp-title">Email confirmed</h2>
              <p className="rp-description">
                {email ? `${email} is confirmed. ` : 'Your email is confirmed. '}
                Welcome to Emoorm!
              </p>
              <Link to={isAuthenticated ? '/profile' : '/login'} className="rp-submit rp-submit-link">
                {isAuthenticated ? 'Go to my profile' : 'Log in'}
              </Link>
              <div className="rp-footer-link">
                <Link to="/" className="rp-back-link">Start shopping</Link>
              </div>
            </div>
          )}

          {state === 'failed' && (
            <div className="rp-done">
              <div className="rp-done-icon rp-done-icon--warn" aria-hidden="true">
                <WarningCircle size={32} weight="fill" />
              </div>
              <h2 className="rp-title">{alreadyConfirmed ? 'Your email is already confirmed' : "We couldn't confirm your email"}</h2>
              <p className="rp-description">
                {alreadyConfirmed ? 'Nothing else to do here.' : message}
              </p>
              {alreadyConfirmed ? (
                <Link to="/profile" className="rp-submit rp-submit-link">Go to my profile</Link>
              ) : isAuthenticated ? (
                <button type="button" className="rp-submit" onClick={resend} disabled={sending}>
                  {sending ? <BusyLabel>Sending…</BusyLabel> : 'Send me a new link'}
                </button>
              ) : (
                <Link to="/login?redirect=%2Fprofile" className="rp-submit rp-submit-link">Log in to get a new link</Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
