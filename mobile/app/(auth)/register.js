import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import { DeviceMobileIcon, EnvelopeSimpleIcon } from '../../src/lib/icons';
import apiClient from '../../src/api/client';
import useAuthStore from '../../src/store/authStore';
import { fetchMunicipalities } from '../../src/lib/referenceData';
import AuthSheet, { HelpLink } from '../../src/components/auth/AuthSheet';
import {
  AuthDivider, AuthErrorBox, AuthField, AuthLabel, AuthSubmit, AuthWayButton, GoogleButton,
} from '../../src/components/auth/AuthForm';
import AuthChoose, { AuthChooseLink } from '../../src/components/auth/AuthChoose';
import usePhoneLogin from '../../src/components/auth/phoneLogin';
import AuthAddressPicker from '../../src/components/auth/AuthAddressPicker';
import { AuthHint, AuthTitle, Strong } from '../../src/components/auth/AuthPanels';
import useAuthGoogle from '../../src/components/auth/useAuthGoogle';
import InviteCodeField from '../../src/components/auth/InviteCodeField';
import { useSignupInvite } from '../../src/lib/invite';
import useAppSettings from '../../src/lib/appSettings';
import { font, t, themed } from '../../src/theme';

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;

/**
 * Sign up: the website's phone sheet (web/src/pages/Register.jsx +
 * AuthSheet.css). "Sign up with Google" for a new email reuses this form to
 * finish the account (POST /auth/google/complete instead of /auth/register).
 *
 * The sheet opens on the same choice as Log in (auth/AuthChoose): Google, a
 * mobile number (done on the Log in sheet, opened at that step), or email,
 * which opens the form. No "Continue with Facebook" in the app (see
 * app/(auth)/login.js).
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
  // The first step is the choice; the form is one tap away.
  const [emailOpen, setEmailOpen] = useState(false);
  // Continue with mobile number: done on the Log in sheet, opened at it.
  const phoneEnabled = usePhoneLogin();
  // Continue with Google, unless the super admin switched it off.
  const appSettings = useAppSettings();
  const googleOn = appSettings.loginGoogle !== false;
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [municipalities, setMunicipalities] = useState([]);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(true);
  // Set when Google confirmed a brand-new email: the form finishes that account.
  const [googleProfile, setGoogleProfile] = useState(null);
  // The invite code, filled in from an invite link opened on this phone.
  const invite = useSignupInvite();

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
          ...invite.fields(),
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
          ...invite.fields(),
        });

      const token = response.data?.accessToken;
      const userData = response.data?.user;
      if (token && userData) {
        await storeLogin(userData, token, response.data.refreshToken);
        await invite.done();
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

  // Signing up to sell (on to the seller application): the megaphone.
  const forSelling = Boolean(safeRedirect?.startsWith('/seller'));
  // The first step, the choice. Google sending a new email back opens the
  // form to finish the account.
  const choosing = !emailOpen && !googleProfile;

  const googleButton = (edge) => (googleOn ? (
    <GoogleButton
      edge={edge}
      label={google.loading ? 'Signing up…' : 'Sign up with Google'}
      onPress={handleGoogleSignup}
      disabled={isLoading || google.loading}
    />
  ) : null);

  const phoneButton = (edge) => (phoneEnabled ? (
    <AuthWayButton
      edge={edge}
      icon={<DeviceMobileIcon size={21} color={t.neutral[900]} />}
      label="Continue with mobile number"
      onPress={() => router.replace({ pathname: loginPath, params: { openPhone: '1' } })}
    />
  ) : null);

  if (choosing) {
    return (
      <AuthSheet band switchTo={loginPath} switchLabel="Log in">
        <View style={styles.cardChoose}>
          <AuthChoose
            title={forSelling ? 'Start selling on E-MOORM' : 'Join E-MOORM'}
            sub={forSelling ? 'Make an account, then open your shop' : 'Fresh finds from Mindoro, delivered or picked up'}
            scene={forSelling ? 'sell' : 'signUp'}
            error={apiError}
            more={(
              <>
                Already have an account?{' '}
                <AuthChooseLink onPress={() => router.replace(loginPath)}>Log in</AuthChooseLink>
              </>
            )}
            onHelp={() => router.push('/help-center')}
            onTerms={() => router.push('/terms')}
            onPrivacy={() => router.push('/privacy')}
          >
            {googleButton(true)}
            {phoneButton(true)}
            <AuthWayButton
              edge
              icon={<EnvelopeSimpleIcon size={21} color={t.neutral[900]} />}
              label="Continue with Email"
              onPress={() => setEmailOpen(true)}
            />
          </AuthChoose>
        </View>
      </AuthSheet>
    );
  }

  return (
    <AuthSheet>
      <View style={styles.card}>
        {/* The title row, as Log in's: the title, and Log in at the other end. */}
        <View style={styles.headerRow}>
          <AuthTitle>Sign Up</AuthTitle>
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.replace(loginPath)}>
            <Text style={styles.switchLinkText}>Log in</Text>
          </Pressable>
        </View>

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

          <InviteCodeField invite={invite} />

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
              {/* The "or" only when another way in follows. */}
              {googleOn || phoneEnabled ? <AuthDivider style={styles.divider} /> : null}
              {googleButton(false)}
              {phoneButton(false)}
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

const styles = themed(() => StyleSheet.create({
  card: { paddingTop: 20 },
  // The first step runs to the foot of the screen.
  cardChoose: { flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  // .auth-switch-link in the sheet.
  switchLinkText: { fontSize: 15, lineHeight: 24, color: t.primary[700], ...font(500) },
  googleHint: { marginBottom: 16 },
  googleCancel: { color: t.info[600], textDecorationLine: 'underline' },
  form: { gap: 16 },
  group: { gap: 6 },
  submit: { marginTop: 4 },
  divider: { marginVertical: 4 },
  footer: { marginTop: 4, textAlign: 'center', fontSize: 14, lineHeight: 21.7, color: t.neutral[500], ...font(400) },
  footerText: { color: t.neutral[500], ...font(400) },
  footerLink: { color: t.primary[600], ...font(500) },
  terms: { marginTop: 12, marginBottom: 14, textAlign: 'center', fontSize: 12, lineHeight: 18.6, color: t.neutral[500], ...font(400) },
  termsLink: { color: t.primary[600], textDecorationLine: 'underline' },
}));
