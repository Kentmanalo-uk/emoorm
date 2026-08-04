import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import axios from '../lib/axios';
import './ResetPassword.css';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [formData, setFormData] = useState({ token: tokenFromUrl, password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters.';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/.test(formData.password)) {
      newErrors.password = 'Must contain uppercase, lowercase, number, and special character.';
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
      navigate('/login', { state: { message: 'Password reset successful. Please sign in.' } });
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
          <h2 className="rp-title">Reset your password</h2>
          <p className="rp-description">Enter the reset token from your email and choose a new password.</p>

          <form onSubmit={handleSubmit} className="rp-form">
            {/* Token field — pre-filled from URL, editable as fallback */}
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
                />
                <button type="button" className="rp-toggle-password" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <span className="rp-error">{errors.password}</span>}
            </div>

            <div className="rp-form-group">
              <label htmlFor="confirmPassword" className="rp-label">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className={`rp-input ${errors.confirmPassword ? 'rp-input-error' : ''}`}
                placeholder="Confirm new password"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
              {errors.confirmPassword && <span className="rp-error">{errors.confirmPassword}</span>}
            </div>

            <button type="submit" className="rp-submit" disabled={isLoading}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>

            {apiError && <div className="rp-api-error">{apiError}</div>}
          </form>

          <div className="rp-footer-link">
            <Link to="/login" className="rp-back-link">← Back to Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
