import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeSlash as EyeOff, Check } from '@phosphor-icons/react';
import axios from '../lib/axios';
import './ResetPassword.css';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [formData, setFormData] = useState({
    token: tokenFromUrl,
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const hasTokenFromUrl = Boolean(tokenFromUrl);

  const rules = [
    { label: 'At least 8 characters', ok: formData.password.length >= 8 },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(formData.password) },
    { label: 'One lowercase letter', ok: /[a-z]/.test(formData.password) },
    { label: 'One number', ok: /\d/.test(formData.password) },
    { label: 'One special character', ok: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) setApiError('');
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.token.trim()) newErrors.token = 'Reset token is required.';
    if (!formData.password) {
      newErrors.password = 'Password is required.';
    } else if (!rules.every((r) => r.ok)) {
      newErrors.password = 'Password does not meet the requirements below.';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      await axios.post('/auth/reset-password', {
        token: formData.token.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });
      setDone(true);
      setTimeout(() => {
        navigate('/login', {
          state: { message: 'Password reset successful. Please sign in.' },
        });
      }, 2000);
    } catch (err) {
      setApiError(err.message || 'Reset failed. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rp-page">
      <header className="rp-header">
        <div className="rp-header-container">
          <Link to="/" className="rp-logo">
            <img src="/brand-icon.png" alt="Emoorm" className="rp-logo-icon" />
            <span className="rp-logo-text">emoorm</span>
          </Link>
        </div>
      </header>

      <div className="rp-content">
        <div className="rp-card">
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 56, height: 56, margin: '0 auto 16px',
                  borderRadius: '50%', background: '#dcfce7', color: '#166534',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Check size={28} />
              </div>
              <h2 className="rp-title">Password updated</h2>
              <p className="rp-description">
                You can now sign in with your new password. Redirecting to sign in…
              </p>
              <Link to="/login" className="rp-back-link">Go to Sign In now</Link>
            </div>
          ) : (
            <>
              <h2 className="rp-title">Reset your password</h2>
              <p className="rp-description">
                {hasTokenFromUrl
                  ? 'Choose a new password for your account. This link expires in 1 hour.'
                  : 'Paste the reset token from your email and choose a new password.'}
              </p>

              <form onSubmit={handleSubmit} className="rp-form">
                {!hasTokenFromUrl && (
                  <div className="rp-form-group">
                    <label htmlFor="token" className="rp-label">Reset Token</label>
                    <input
                      type="text"
                      id="token"
                      name="token"
                      className={`rp-input ${errors.token ? 'rp-input-error' : ''}`}
                      placeholder="Paste your reset token"
                      value={formData.token}
                      onChange={handleChange}
                    />
                    {errors.token && <span className="rp-error">{errors.token}</span>}
                  </div>
                )}

                <div className="rp-form-group">
                  <label htmlFor="password" className="rp-label">New Password</label>
                  <div className="rp-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      className={`rp-input ${errors.password ? 'rp-input-error' : ''}`}
                      placeholder="New password"
                      value={formData.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="rp-toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && <span className="rp-error">{errors.password}</span>}
                  {formData.password && (
                    <ul
                      style={{
                        listStyle: 'none', padding: 0, margin: '8px 0 0',
                        fontSize: 12, display: 'grid', gap: 4,
                      }}
                    >
                      {rules.map((r) => (
                        <li
                          key={r.label}
                          style={{
                            color: r.ok ? '#059669' : '#9ca3af',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 14, height: 14, borderRadius: '50%',
                              background: r.ok ? '#059669' : '#e5e7eb',
                              color: '#fff', display: 'inline-flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: 10,
                            }}
                          >
                            {r.ok ? '✓' : ''}
                          </span>
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rp-form-group">
                  <label htmlFor="confirmPassword" className="rp-label">Confirm New Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    name="confirmPassword"
                    className={`rp-input ${errors.confirmPassword ? 'rp-input-error' : ''}`}
                    placeholder="Confirm new password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                  />
                  {errors.confirmPassword && (
                    <span className="rp-error">{errors.confirmPassword}</span>
                  )}
                </div>

                <button type="submit" className="rp-submit" disabled={isLoading}>
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>

                {apiError && (
                  <div className="rp-api-error">
                    {apiError}
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      Need a new link? <Link to="/forgot-password">Request another one</Link>.
                    </div>
                  </div>
                )}
              </form>

              <div className="rp-footer-link">
                <Link to="/login" className="rp-back-link">← Back to Sign In</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
