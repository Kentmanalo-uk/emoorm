import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: storeLogin } = useAuthStore();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
    if (apiError) {
      setApiError('');
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Call login API
      const response = await axios.post('/auth/login', {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
      });

      console.log('Login successful:', response);

      // Response structure: { success, message, data: { user, accessToken, refreshToken } }
      const token = response.data.accessToken;
      const refreshToken = response.data.refreshToken;
      const userData = response.data.user;

      if (token && userData) {
        storeLogin(userData, token, refreshToken);

        // Role-based landing: admins & sellers get their own dashboards.
        const role = userData?.role;
        let target;
        if (role === 'SUPER_ADMIN' || role === 'MUNICIPAL_ADMIN') {
          target = '/admin';
        } else if (role === 'SELLER') {
          target = '/seller';
        } else {
          target = location.state?.from?.pathname || '/';
        }
        navigate(target, { replace: true });
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Login error:', error);

      // Handle different error response formats
      let errorMessage = 'Login failed. Please try again.';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid email or password';
      }

      setApiError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // TODO: Implement Google OAuth
    console.log('Google login clicked');
  };

  return (
    <div className="login-page">
      {/* Header */}
      <header className="login-header">
        <div className="login-header-container">
          <Link to="/" className="login-logo">
            <img src="/brand-icon.png" alt="Emoorm" className="login-logo-icon" />
            <span className="login-logo-text">emoorm</span>
          </Link>
          <Link to="/register" className="login-header-link">Log In</Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="login-content">
        <div className="login-container">
          {/* Left Side - Hero */}
          <div className="login-hero">
            <div className="login-hero-brand">
              <img src="/brand-icon.png" alt="Emoorm" className="login-hero-icon" />
              <span className="login-hero-text">emoorm</span>
            </div>
            <h1 className="login-hero-title">
              Fresh from<br />
              <span className="login-hero-title-highlight">the island.</span>
            </h1>
            <div className="login-hero-stats">
              <div className="login-hero-stat">
                <div className="login-hero-stat-number">15</div>
                <div className="login-hero-stat-label">MUNICIPALITIES</div>
              </div>
              <div className="login-hero-stat">
                <div className="login-hero-stat-number">100%</div>
                <div className="login-hero-stat-label">LOCAL SELLERS</div>
              </div>
              <div className="login-hero-stat">
                <div className="login-hero-stat-number">Free</div>
                <div className="login-hero-stat-label">TO JOIN</div>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="login-form-container">
            <div className="login-form-card">
              <div className="login-form-header">
                <h2 className="login-form-title">Sign In</h2>
              </div>

              <form onSubmit={handleSubmit} className="login-form">
                {/* Email Field */}
                <div className="login-form-group">
                  <label htmlFor="email" className="login-form-label">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className={`login-form-input ${errors.email ? 'login-form-input-error' : ''}`}
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  {errors.email && (
                    <span className="login-form-error">{errors.email}</span>
                  )}
                </div>

                {/* Password Field */}
                <div className="login-form-group">
                  <div className="login-form-label-row">
                    <label htmlFor="password" className="login-form-label">
                      Password
                    </label>
                    <Link to="/forgot-password" className="login-form-forgot">
                      Forgot?
                    </Link>
                  </div>
                  <div className="login-form-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      className={`login-form-input ${errors.password ? 'login-form-input-error' : ''}`}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="login-form-toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="login-form-error">{errors.password}</span>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="login-form-submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Log in'}
                </button>

                {/* API Error Message */}
                {apiError && (
                  <div className="login-form-error-message">{apiError}</div>
                )}

                {errors.submit && (
                  <div className="login-form-error-message">{errors.submit}</div>
                )}

                {/* Divider */}
                <div className="login-form-divider">
                  <span className="login-form-divider-text">OR CONTINUE WITH</span>
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  className="login-form-google"
                  onClick={handleGoogleLogin}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853" />
                    <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
                  </svg>
                  Sign in with Google
                </button>

                {/* Sign Up Link */}
                <div className="login-form-footer">
                  <span className="login-form-footer-text">New to Emoorm? </span>
                  <Link to="/register" className="login-form-footer-link">
                    Create an account
                  </Link>
                </div>

                {/* Terms */}
                <p className="login-form-terms">
                  By logging in, you agree to Emoorm's{' '}
                  <Link to="/terms" className="login-form-terms-link">Terms</Link>
                  {' & '}
                  <Link to="/privacy" className="login-form-terms-link">Privacy Policy</Link>
                </p>
              </form>
            </div>

            {/* Need Help */}
            <Link to="/help" className="login-help-link">
              Need Help?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
