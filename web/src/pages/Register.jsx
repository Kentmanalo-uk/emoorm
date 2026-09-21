import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeSlash as EyeOff } from '@phosphor-icons/react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import PhAddressPicker from '../components/common/PhAddressPicker';
import AppLogo from '../components/AppLogo';
import './Register.css';

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login: storeLogin } = useAuthStore();
  const requestedRedirect = searchParams.get('redirect');
  const safeRedirect = requestedRedirect?.startsWith('/') ? requestedRedirect : null;
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    contactNumber: '',
    password: '',
    confirmPassword: '',
    province: 'Oriental Mindoro',
    provinceCode: '',
    municipalityId: '',
    municipalityName: '',
    municipalityCode: '',
    barangay: '',
    barangayCode: '',
    street: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [municipalities, setMunicipalities] = useState([]);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(true);

  // Set when the user chose "Continue with Google" and Google confirmed a
  // brand-new email — the rest of this form is reused to finish creating the
  // account (instead of hitting /auth/register, we hit /auth/google/complete).
  const [googleProfile, setGoogleProfile] = useState(null); // { googleToken, email, fullName, profilePhoto }

  // Fetch municipalities on component mount
  useEffect(() => {
    const fetchMunicipalities = async () => {
      try {
        const response = await axios.get('/municipalities');
        setMunicipalities(response.data || []);
      } catch (error) {
        console.error('Failed to fetch municipalities:', error);
        setApiError('Failed to load municipalities. Please refresh the page.');
      } finally {
        setLoadingMunicipalities(false);
      }
    };

    fetchMunicipalities();
  }, []);

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

    // Full name validation
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters';
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    // Municipality validation
    if (!formData.municipalityId) {
      newErrors.municipalityId = 'Municipality is required';
    }

    // Contact number validation (optional but validate if provided)
    if (formData.contactNumber && !/^(\+63|0)?[0-9]{10}$/.test(formData.contactNumber.replace(/[-\s]/g, ''))) {
      newErrors.contactNumber = 'Contact number must be 10 digits';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, number, and special character';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      const response = googleProfile
        ? await axios.post('/auth/google/complete', {
          googleToken: googleProfile.googleToken,
          fullName: formData.fullName.trim(),
          contactNumber: formData.contactNumber.trim() || undefined,
          province: formData.province || undefined,
          municipalityId: formData.municipalityId,
          barangay: formData.barangay.trim() || undefined,
          address: formData.street.trim() || undefined,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        })
        : await axios.post('/auth/register', {
          email: formData.email.toLowerCase().trim(),
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          fullName: formData.fullName.trim(),
          contactNumber: formData.contactNumber.trim() || undefined,
          province: formData.province || undefined,
          municipalityId: formData.municipalityId,
          barangay: formData.barangay.trim() || undefined,
          address: formData.street.trim() || undefined,
        });

      // Response structure: { success, message, data: { user, accessToken, refreshToken } }
      const token = response.data.accessToken;
      const refreshToken = response.data.refreshToken;
      const userData = response.data.user;

      if (token && userData) {
        storeLogin(userData, token, refreshToken);
        navigate(userData.role === 'SELLER' ? '/seller' : safeRedirect || '/', { replace: true });
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Registration error:', error);

      // Handle different error response formats
      let errorMessage = 'Registration failed. Please try again.';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.errors) {
        // Handle validation errors
        const validationErrors = error.response.data.errors;
        if (Array.isArray(validationErrors) && validationErrors.length > 0) {
          errorMessage = validationErrors[0].message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      setApiError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);

  const startGoogleSignup = useGoogleLogin({
    flow: 'auth-code',
    onError: () => setApiError('Google sign-up failed. Please try again.'),
    onNonOAuthError: (err) => {
      if (err?.type !== 'popup_closed') setApiError('Google sign-up was interrupted.');
    },
    onSuccess: async ({ code }) => {
      if (!code) return;
      setGoogleLoading(true);
      setApiError('');
      try {
        const res = await axios.post('/auth/google', { code });
        const data = res.data;
        if (data?.requiresProfile) {
          setGoogleProfile(data);
          setFormData((prev) => ({
            ...prev,
            fullName: data.fullName || prev.fullName,
            email: data.email || prev.email,
          }));
          setErrors({});
          return;
        }
        if (data?.requiresMfa || data?.requiresMfaSetup) {
          setApiError('Admin accounts must sign in with the standard admin flow to complete MFA.');
          return;
        }
        if (!data?.user || !data?.accessToken) {
          setApiError('Unexpected response from server.');
          return;
        }
        storeLogin(data.user, data.accessToken, data.refreshToken);
        navigate(data.user.role === 'SELLER' ? '/seller' : safeRedirect || '/', { replace: true });
      } catch (err) {
        setApiError(err?.response?.data?.message || 'Google sign-up failed.');
      } finally {
        setGoogleLoading(false);
      }
    },
  });

  const handleGoogleSignup = () => {
    setApiError('');
    startGoogleSignup();
  };

  const handleCancelGoogleProfile = () => {
    setGoogleProfile(null);
    setFormData((prev) => ({ ...prev, email: '', password: '', confirmPassword: '' }));
    setErrors({});
    setApiError('');
  };

  return (
    <div className="register-page">
      {/* Header */}
      <header className="register-header">
        <div className="register-header-container">
          <Link to="/" className="register-logo">
            <AppLogo className="register-logo-icon" />
            <span className="register-logo-text">emoorm</span>
          </Link>
          <Link to="/login" className="register-header-link">Log In</Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="register-content">
        <div className="register-container">
          {/* Left Side - Hero */}
          <div className="register-hero">
            <div className="register-hero-brand">
              <AppLogo className="register-hero-icon" />
              <span className="register-hero-text">emoorm</span>
            </div>
            <h1 className="register-hero-title">
              Made in Mindoro<br />
              <span className="register-hero-title-highlight">the place of rich<br />in Agriculture Producers</span>
            </h1>

          </div>

          {/* Right Side - Form */}
          <div className="register-form-container">
            <div className="register-form-card">
              <div className="register-form-header">
                <h2 className="register-form-title">Sign Up</h2>
              </div>

              {googleProfile && (
                <div className="login-mfa-hint" style={{ marginBottom: 16 }}>
                  Continuing with Google as <strong>{googleProfile.email}</strong>.{' '}
                  <button type="button" onClick={handleCancelGoogleProfile} className="register-form-google" style={{ display: 'inline', padding: 0, border: 'none', background: 'none', color: 'var(--t-info-600, #2563eb)', textDecoration: 'underline', width: 'auto' }}>
                    Use a different account
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="register-form">
                {/* Full Name Field */}
                <div className="register-form-group">
                  <label htmlFor="fullName" className="register-form-label">
                    Full name
                  </label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    className={`register-form-input ${errors.fullName ? 'register-form-input-error' : ''}`}
                    placeholder="Juan Dela Cruz"
                    value={formData.fullName}
                    onChange={handleChange}
                  />
                  {errors.fullName && (
                    <span className="register-form-error">{errors.fullName}</span>
                  )}
                </div>

                {/* Email Field */}
                <div className="register-form-group">
                  <label htmlFor="email" className="register-form-label">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className={`register-form-input ${errors.email ? 'register-form-input-error' : ''}`}
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!!googleProfile}
                  />
                  {errors.email && (
                    <span className="register-form-error">{errors.email}</span>
                  )}
                </div>

                {/* Address Picker (Province → City/Municipality → Barangay → Street) */}
                <div className="register-form-group">
                  <label className="register-form-label">Address</label>
                  <PhAddressPicker
                    value={formData}
                    onChange={(next) => {
                      setFormData((prev) => ({ ...prev, ...next }));
                      if (errors.municipalityId && next.municipalityId) {
                        setErrors((prev) => ({ ...prev, municipalityId: '' }));
                      }
                    }}
                    dbMunicipalities={municipalities}
                    errors={errors}
                    streetLabel="Street / House No. (optional)"
                    streetPlaceholder="123 Rizal St."
                  />
                </div>

                {/* Contact Number Field */}
                <div className="register-form-group">
                  <label htmlFor="contactNumber" className="register-form-label">
                    Contact number <span className="register-form-optional">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    id="contactNumber"
                    name="contactNumber"
                    className={`register-form-input ${errors.contactNumber ? 'register-form-input-error' : ''}`}
                    placeholder="09123456789"
                    value={formData.contactNumber}
                    onChange={handleChange}
                  />
                  {errors.contactNumber && (
                    <span className="register-form-error">{errors.contactNumber}</span>
                  )}
                </div>

                {/* Password Field */}
                <div className="register-form-group">
                  <label htmlFor="password" className="register-form-label">
                    Password
                  </label>
                  <div className="register-form-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      className={`register-form-input ${errors.password ? 'register-form-input-error' : ''}`}
                      placeholder="Create a strong password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="register-form-toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="register-form-error">{errors.password}</span>
                  )}
                </div>

                {/* Confirm Password Field */}
                <div className="register-form-group">
                  <label htmlFor="confirmPassword" className="register-form-label">
                    Confirm password
                  </label>
                  <div className="register-form-input-wrapper">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      name="confirmPassword"
                      className={`register-form-input ${errors.confirmPassword ? 'register-form-input-error' : ''}`}
                      placeholder="Re-enter your password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="register-form-toggle-password"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <span className="register-form-error">{errors.confirmPassword}</span>
                  )}
                </div>

                {/* API Error Message */}
                {apiError && (
                  <div className="register-form-error-message">{apiError}</div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="register-form-submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating account...' : googleProfile ? 'Create account & continue' : 'Create account'}
                </button>

                {!googleProfile && (
                  <>
                    {/* Divider */}
                    <div className="register-form-divider">
                      <span className="register-form-divider-text">OR CONTINUE WITH</span>
                    </div>

                    {/* Google Sign Up */}
                    <button
                      type="button"
                      className="register-form-google"
                      onClick={handleGoogleSignup}
                      disabled={isLoading || googleLoading}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                        <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853" />
                        <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                        <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335" />
                      </svg>
                      {googleLoading ? 'Signing up…' : 'Sign up with Google'}
                    </button>
                  </>
                )}

                {/* Sign In Link */}
                <div className="register-form-footer">
                  <span className="register-form-footer-text">Already have an account? </span>
                  <Link to="/login" className="register-form-footer-link">
                    Log in
                  </Link>
                </div>

                {/* Terms */}
                <p className="register-form-terms">
                  By creating an account, you agree to Emoorm's{' '}
                  <Link to="/terms" className="register-form-terms-link">Terms</Link>
                  {' & '}
                  <Link to="/privacy" className="register-form-terms-link">Privacy Policy</Link>
                </p>
              </form>
            </div>

            {/* Need Help */}
            <Link to="/help" className="register-help-link">
              Need Help?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
