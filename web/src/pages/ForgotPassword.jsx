import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { EnvelopeSimple } from '@phosphor-icons/react';
import axios from '../lib/axios';
import AppLogo from '../components/AppLogo';
import AuthSheetBar from '../components/AuthSheetBar';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './ForgotPassword.css';
import './AuthSheet.css';

const ForgotPassword = () => {
  const location = useLocation();
  const isPhone = usePhoneLayout();
  // Opened from the Log in sheet: swap in place instead of sliding up again.
  const sheetSwitched = Boolean(location.state?.fromSheet);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (nextEmail) => {
    setError('');
    if (!nextEmail.trim() || !/\S+@\S+\.\S+/.test(nextEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post('/auth/forgot-password', {
        email: nextEmail.toLowerCase().trim(),
      });
      // The response carries no token by design — the reset link exists only
      // in the email. Locally, the server prints it to the backend console.
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit(email);
  };

  const handleResend = () => submit(email);

  // On phones the sheet swaps back to Log in in place.
  const loginLinkProps = isPhone
    ? { replace: true, state: { ...location.state, fromSheet: true } }
    : {};

  return (
    <div className={`fp-page${isPhone ? ' is-sheet' : ''}${sheetSwitched ? ' is-switched' : ''}`}>
      <header className="fp-header">
        <div className="fp-header-container">
          <Link to="/" className="fp-logo">
            <AppLogo className="fp-logo-icon" />
            <span className="fp-logo-text">emoorm</span>
          </Link>
        </div>
      </header>

      <div className="fp-content">
        <div className="fp-card">
          {isPhone && <AuthSheetBar switchTo="/login" switchLabel="Log in" />}
          {submitted ? (
            <div className="fp-success">
              <div className="fp-success-icon" aria-hidden="true">
                <EnvelopeSimple size={30} weight="fill" />
              </div>
              <h2 className="fp-title">Check your email</h2>
              <p className="fp-description">
                If <strong>{email}</strong> is registered, we've sent a password reset link.
                The link expires in <strong>1 hour</strong>.
              </p>
              <p className="fp-hint">
                Didn't get an email? Check your spam folder, or send it again.
              </p>
              <div className="fp-success-actions">
                <button
                  type="button"
                  className="fp-submit"
                  onClick={handleResend}
                  disabled={isLoading}
                >
                  {isLoading ? 'Resending…' : 'Resend link'}
                </button>
                <Link to="/login" className="fp-secondary" {...loginLinkProps}>
                  Back to log in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="fp-title">Forgot your password?</h2>
              <p className="fp-description">
                Enter your registered email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="fp-form" noValidate>
                <div className="fp-form-group">
                  <label htmlFor="email" className="fp-label">Email address</label>
                  <input
                    type="email"
                    id="email"
                    className={`fp-input ${error ? 'fp-input-error' : ''}`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    autoComplete="email"
                    inputMode="email"
                    autoFocus={!isPhone}
                  />
                  {error && <span className="fp-error">{error}</span>}
                </div>

                <button type="submit" className="fp-submit" disabled={isLoading}>
                  {isLoading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <div className="fp-footer-link">
                Remembered it?{' '}
                <Link to="/login" className="fp-back-link" {...loginLinkProps}>Log in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
