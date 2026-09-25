import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeSlash as EyeOff, Check, CheckCircle } from '@phosphor-icons/react';
import axios from '../lib/axios';
import AppLogo from '../components/AppLogo';
import AuthSheetBar from '../components/AuthSheetBar';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './ResetPassword.css';
import './AuthSheet.css';

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isPhone = usePhoneLayout();
  const sheetSwitched = Boolean(location.state?.fromSheet);
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
  const loginState = isPhone ? { ...location.state, fromSheet: true } : undefined;

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
          replace: isPhone,
          state: { ...loginState, message: 'Password reset successful. Please sign in.' },
        });
      }, 2000);
    } catch (err) {
      setApiError(err.message || 'Reset failed. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmMatches = formData.confirmPassword && formData.confirmPassword === formData.password;

  return (
    <div className={`rp-page${isPhone ? ' is-sheet' : ''}${sheetSwitched ? ' is-switched' : ''}`}>
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
          {isPhone && <AuthSheetBar switchTo="/login" switchLabel="Log in" />}
          {done ? (
            <div className="rp-done">
              <div className="rp-done-icon" aria-hidden="true">
                <CheckCircle size={32} weight="fill" />
              </div>
              <h2 className="rp-title">Password updated</h2>
              <p className="rp-description">
                You can now log in with your new password. Taking you to log in…
              </p>
              <Link to="/login" replace={isPhone} state={loginState} className="rp-submit rp-submit-link">
                Log in now
              </Link>
            </div>
          ) : (
            <>
              <h2 className="rp-title">Reset your password</h2>
              <p className="rp-description">
                {hasTokenFromUrl
                  ? 'Choose a new password for your account. This link expires in 1 hour.'
                  : 'Paste the reset token from your email and choose a new password.'}
              </p>

              <form onSubmit={handleSubmit} className="rp-form" noValidate>
                {!hasTokenFromUrl && (
                  <div className="rp-form-group">
                    <label htmlFor="token" className="rp-label">Reset token</label>
                    <input
                      type="text"
                      id="token"
                      name="token"
                      className={`rp-input ${errors.token ? 'rp-input-error' : ''}`}
                      placeholder="Paste your reset token"
                      value={formData.token}
                      onChange={handleChange}
                      autoComplete="off"
                    />
                    {errors.token && <span className="rp-error">{errors.token}</span>}
                  </div>
                )}

                <div className="rp-form-group">
                  <label htmlFor="password" className="rp-label">New password</label>
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
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {errors.password && <span className="rp-error">{errors.password}</span>}
                  {formData.password && (
                    <ul className="rp-rules" aria-label="Password requirements">
                      {rules.map((r) => (
                        <li key={r.label} className={r.ok ? 'is-ok' : ''}>
                          <span className="rp-rule-dot" aria-hidden="true">
                            {r.ok && <Check size={10} weight="bold" />}
                          </span>
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rp-form-group">
                  <label htmlFor="confirmPassword" className="rp-label">Confirm new password</label>
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
                  {errors.confirmPassword ? (
                    <span className="rp-error">{errors.confirmPassword}</span>
                  ) : confirmMatches && (
                    <span className="rp-match"><Check size={12} weight="bold" /> Passwords match</span>
                  )}
                </div>

                {apiError && (
                  <div className="rp-api-error" role="alert">
                    {apiError}
                    <div className="rp-api-error-more">
                      Need a new link? <Link to="/forgot-password" replace={isPhone} state={loginState}>Request another one</Link>.
                    </div>
                  </div>
                )}

                <button type="submit" className="rp-submit" disabled={isLoading}>
                  {isLoading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>

              <div className="rp-footer-link">
                Remembered it?{' '}
                <Link to="/login" replace={isPhone} state={loginState} className="rp-back-link">Log in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
