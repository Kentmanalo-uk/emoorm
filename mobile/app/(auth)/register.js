import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import apiClient from '../../src/api/client';
import useAuthStore from '../../src/store/authStore';
import { fetchMunicipalities } from '../../src/lib/referenceData';
import AuthSheet, { HelpLink } from '../../src/components/auth/AuthSheet';
import {
  AuthDivider, AuthErrorBox, AuthField, AuthLabel, AuthSubmit, GoogleButton,
} from '../../src/components/auth/AuthForm';
import AuthAddressPicker from '../../src/components/auth/AuthAddressPicker';
import { AuthHint, AuthTitle, Strong } from '../../src/components/auth/AuthPanels';
import useAuthGoogle from '../../src/components/auth/useAuthGoogle';
import { font, t } from '../../src/theme';

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;

/**
 * Sign up: the website's phone sheet (web/src/pages/Register.jsx +
 * AuthSheet.css). "Sign up with Google" for a new email reuses this form to
 * finish the account (POST /auth/google/complete instead of /auth/register).
 */
export default function Register() {
  const params = useLocalSearchParams();
  const requestedRedirect = typeof params.redirect === 'string' ? params.redirect : null;
  const safeRedirect = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : null;
  // Signing up to sell: "Log in" means the Seller Login.
  const loginPath = safeRedirect?.startsWith('/seller') ? '/seller-login' : '/login';

  const storeLogin = useAuthStore((s) => s.login);
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
  // Set when Google confirmed a brand-new email: the form finishes that account.
  const [googleProfile, setGoogleProfile] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchMunicipalities()
      .then((list) => { if (alive) setMunicipalities(list || []); })
      .catch(() => { if (alive) setApiError('Failed to load municipalities. Please refresh the page.'); })
      .finally(() => { if (alive) setLoadingMunicipalities(false); });
    return () => { alive = false; };
  }, []);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) setApiError('');
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.municipalityId) {
      newErrors.municipalityId = 'Municipality is required';
    }
    if (formData.contactNumber && !/^(\+63|0)?[0-9]{10}$/.test(formData.contactNumber.replace(/[-\s]/g, ''))) {
      newErrors.contactNumber = 'Contact number must be 10 digits';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!PASSWORD_RULE.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, number, and special character';
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setApiError('');
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const response = googleProfile
        ? await apiClient.post('/auth/google/complete', {
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
        : await apiClient.post('/auth/register', {
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

      const token = response.data?.accessToken;
      const userData = response.data?.user;
      if (token && userData) {
        await storeLogin(userData, token, response.data.refreshToken);
        // A typed email gets a confirmation link in its welcome email.
        if (!googleProfile && userData.isVerified === false) {
          Toast.show({
            type: 'success',
            text1: `Welcome to Emoorm! We sent a link to ${userData.email} to confirm your email.`,
            visibilityTime: 6000,
          });
        }
        router.replace(safeRedirect || '/');
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      setApiError(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google's answer (from the phone's browser, see auth/googleSignIn).
  const applyGoogleAnswer = async (data) => {
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
    await storeLogin(data.user, data.accessToken, data.refreshToken);
    router.replace(safeRedirect || '/');
  };

  const google = useAuthGoogle(
    { from: 'register', redirect: safeRedirect },
    { onAnswer: applyGoogleAnswer, onError: setApiError },
  );

  const handleGoogleSignup = () => {
    setApiError('');
    google.start();
  };

  const handleCancelGoogleProfile = () => {
    setGoogleProfile(null);
    setFormData((prev) => ({ ...prev, email: '', password: '', confirmPassword: '' }));
    setErrors({});
    setApiError('');
  };

  return (
    <AuthSheet switchTo={loginPath} switchLabel="Log in">
      <View style={styles.card}>
        <AuthTitle style={styles.title}>Sign Up</AuthTitle>

        {googleProfile ? (
          <AuthHint style={styles.googleHint}>
            Continuing with Google as <Strong>{googleProfile.email}</Strong>.{' '}
            <Text accessibilityRole="button" onPress={handleCancelGoogleProfile} style={styles.googleCancel}>
              Use a different account
            </Text>
          </AuthHint>
        ) : null}

        <View style={styles.form}>
          <AuthField
            kind="register"
            label="Full name"
            value={formData.fullName}
            onChangeText={(v) => handleChange('fullName', v)}
            placeholder="Juan Dela Cruz"
            autoComplete="name"
            textContentType="name"
            error={errors.fullName}
          />

          <AuthField
            kind="register"
            label="Email address"
            value={formData.email}
            onChangeText={(v) => handleChange('email', v)}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!googleProfile}
            error={errors.email}
          />

          {/* Address (Province → City/Municipality → Barangay → Street) */}
          <View style={styles.group}>
            <AuthLabel kind="register">Address</AuthLabel>
            <AuthAddressPicker
              value={formData}
              onChange={(next) => {
                setFormData((prev) => ({ ...prev, ...next }));
                if (errors.municipalityId && next.municipalityId) {
                  setErrors((prev) => ({ ...prev, municipalityId: '' }));
                }
              }}
              dbMunicipalities={municipalities}
              dbLoading={loadingMunicipalities}
              errors={errors}
              streetLabel="Street / House No. (optional)"
              streetPlaceholder="123 Rizal St."
            />
          </View>

          <AuthField
            kind="register"
            label="Contact number"
            optional
            value={formData.contactNumber}
            onChangeText={(v) => handleChange('contactNumber', v)}
            placeholder="09123456789"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={errors.contactNumber}
          />

          <AuthField
            kind="register"
            label="Password"
            secure
            show={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            value={formData.password}
            onChangeText={(v) => handleChange('password', v)}
            placeholder="Create a strong password"
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.password}
          />

          <AuthField
            kind="register"
            label="Confirm password"
            secure
            show={showConfirmPassword}
            onToggleShow={() => setShowConfirmPassword((v) => !v)}
            value={formData.confirmPassword}
            onChangeText={(v) => handleChange('confirmPassword', v)}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={handleSubmit}
            error={errors.confirmPassword}
          />

          {apiError ? <AuthErrorBox>{apiError}</AuthErrorBox> : null}

          <AuthSubmit
            label={googleProfile ? 'Create account & continue' : 'Create account'}
            busyLabel="Creating account…"
            busy={isLoading}
            onPress={handleSubmit}
            style={styles.submit}
          />

          {!googleProfile ? (
            <>
              <AuthDivider style={styles.divider} />
              <GoogleButton
                label={google.loading ? 'Signing up…' : 'Sign up with Google'}
                onPress={handleGoogleSignup}
                disabled={isLoading || google.loading}
                style={styles.google}
              />
            </>
          ) : null}

          <Text style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Text
              accessibilityRole="link"
              style={styles.footerLink}
              onPress={() => router.replace(loginPath)}
            >
              Log in
            </Text>
          </Text>

          <Text style={styles.terms}>
            By creating an account, you agree to Emoorm&apos;s{' '}
            <Text accessibilityRole="link" style={styles.termsLink} onPress={() => router.push('/terms')}>Terms</Text>
            {' & '}
            <Text accessibilityRole="link" style={styles.termsLink} onPress={() => router.push('/privacy')}>Privacy Policy</Text>
          </Text>
        </View>
      </View>

      <HelpLink />
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 20 },
  title: { marginBottom: 20 },
  googleHint: { marginBottom: 16 },
  googleCancel: { color: t.info[600], textDecorationLine: 'underline' },
  form: { gap: 16 },
  group: { gap: 6 },
  submit: { marginTop: 4 },
  divider: { marginVertical: 4 },
  google: { marginTop: 0 },
  footer: { marginTop: 4, textAlign: 'center', fontSize: 14, lineHeight: 21.7, color: t.neutral[500], ...font(400) },
  footerText: { color: t.neutral[500], ...font(400) },
  footerLink: { color: t.primary[600], ...font(500) },
  terms: { marginTop: 12, marginBottom: 14, textAlign: 'center', fontSize: 12, lineHeight: 18.6, color: t.neutral[500], ...font(400) },
  termsLink: { color: t.primary[600], textDecorationLine: 'underline' },
});
