import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../lib/axios';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post('/auth/forgot-password', { email: email.toLowerCase().trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fp-page">
      <header className="fp-header">
        <div className="fp-header-container">
          <Link to="/" className="fp-logo">
            <img src="/brand-icon.png" alt="Emoorm" className="fp-logo-icon" />
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
              </p>
              <Link to="/login" className="fp-back-link">Back to Sign In</Link>
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
