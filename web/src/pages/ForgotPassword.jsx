import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../lib/axios';
import AppLogo from '../components/AppLogo';
import './ForgotPassword.css';

const ForgotPassword = () => {
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

  return (
    <div className="fp-page">
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
          {submitted ? (
            <div className="fp-success">
              <div className="fp-success-icon">✓</div>
              <h2 className="fp-title">Check your email</h2>
              <p className="fp-description">
                If <strong>{email}</strong> is registered, we've sent a password reset link.
                The link expires in <strong>1 hour</strong>.
              </p>
              <p className="fp-description" style={{ fontSize: 13, color: 'var(--t-neutral-500, #6b7280)' }}>
                Didn't get an email? Check your spam folder, or resend below.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="fp-submit"
                  style={{ maxWidth: 200 }}
                  onClick={handleResend}
                  disabled={isLoading}
                >
                  {isLoading ? 'Resending…' : 'Resend link'}
                </button>
                <Link to="/login" className="fp-back-link" style={{ alignSelf: 'center' }}>
                  Back to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="fp-title">Forgot your password?</h2>
              <p className="fp-description">
                Enter your registered email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="fp-form">
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
                    autoFocus
                  />
                  {error && <span className="fp-error">{error}</span>}
                </div>

                <button type="submit" className="fp-submit" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="fp-footer-link">
                <Link to="/login" className="fp-back-link">← Back to Sign In</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
