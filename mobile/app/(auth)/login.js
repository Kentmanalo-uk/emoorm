import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DeviceMobileIcon, EnvelopeSimpleIcon } from '../../src/lib/icons';
import apiClient from '../../src/api/client';
import useAuthStore from '../../src/store/authStore';
import { fetchMunicipalities } from '../../src/lib/referenceData';
import AuthSheet, { HelpLink } from '../../src/components/auth/AuthSheet';
import {
  AuthDivider, AuthErrorBox, AuthField, AuthSubmit, AuthWayButton, GoogleButton,
} from '../../src/components/auth/AuthForm';
import { AuthTitle, GoogleCompleteProfile, MfaSetup, MfaVerify } from '../../src/components/auth/AuthPanels';
import AuthChoose, { AuthChooseLink } from '../../src/components/auth/AuthChoose';
import PhoneSignIn from '../../src/components/auth/PhoneSignIn';
import usePhoneLogin from '../../src/components/auth/phoneLogin';
import useAuthGoogle from '../../src/components/auth/useAuthGoogle';
import useAppSettings from '../../src/lib/appSettings';
import { useSignupInvite } from '../../src/lib/invite';
import RoleSwitchOverlay from '../../src/components/RoleSwitchOverlay';
import useSideStore from '../../src/store/sideStore';
import { font, t, themed } from '../../src/theme';

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;

const emptyGoogleForm = {
  // email: only asked when signing up with a mobile number (no email from Google).
  fullName: '', email: '', contactNumber: '', password: '', confirmPassword: '',
  province: 'Oriental Mindoro', provinceCode: '', municipalityId: '',
  municipalityName: '', municipalityCode: '', barangay: '', barangayCode: '', street: '',
};

/**
 * Log in, and (with `seller`, at /seller-login) the Seller Login: the
 * website's phone sheet (web/src/pages/Login.jsx + AuthSheet.css). Log in
 * opens the buyer side, a seller's account too; Seller Login opens the
 * Seller Center, and an account without a shop goes on to apply for one.
 *
 * The sheet opens on a choice (auth/AuthChoose): Google, a mobile number,
 * or email, which opens the form. A link that gives the email (?email=)
 * opens the form at once; Sign up's mobile-number button opens that step
 * (?openPhone=1).
 *
 * No "Continue with Facebook" here, though the website has one: the app
 * claims every emoorm.shop link as an Android App Link, so Facebook's
 * return to emoorm.shop/facebook-return would open the app instead of the
 * browser tab that started it, and the Meta app is not published yet.
 */
export default function Login({ seller = false }) {
  const params = useLocalSearchParams();
  const requestedRedirect = typeof params.redirect === 'string' ? params.redirect : null;
  const safeRedirect = requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : null;
  // The Seller Center page asked for, or its home.
  const sellerTarget = safeRedirect?.startsWith('/seller/') && !/^\/seller\/(login|apply)\b/.test(safeRedirect)
    ? safeRedirect
    : '/seller';
  const signUpPath = seller ? { pathname: '/register', params: { redirect: '/seller-apply' } } : '/register';

  const storeLogin = useAuthStore((s) => s.login);
  // The switch to the Seller Center (the website's startAccountSwitch).
  const [switching, setSwitching] = useState(false);
  // Switch account sends an account whose session ended here with its email.
  const [formData, setFormData] = useState({ email: typeof params.email === 'string' ? params.email : '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  // The first step is the choice; the email form is one tap away.
  const [emailOpen, setEmailOpen] = useState(() => typeof params.email === 'string' && Boolean(params.email));
  // Continue with mobile number: on while the server can send texts and the
  // super admin has it on. Sign up sends people here with it open.
  const phoneEnabled = usePhoneLogin();
  const [phoneOpen, setPhoneOpen] = useState(() => params.openPhone === '1');
  // Continue with Google, unless the super admin switched it off.
  const appSettings = useAppSettings();
  const googleOn = appSettings.loginGoogle !== false;
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // 'credentials' | 'verify' | 'setup' | 'google-profile'
  const [mfaStage, setMfaStage] = useState('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEmail, setMfaEmail] = useState('');
  const [setupData, setSetupData] = useState(null);
  const [backupCodes, setBackupCodes] = useState(null);

  const [googleProfile, setGoogleProfile] = useState(null);
  const [municipalities, setMunicipalities] = useState([]);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(false);
  const [googleForm, setGoogleForm] = useState(emptyGoogleForm);
  const [googleFormErrors, setGoogleFormErrors] = useState({});
  const [showGooglePassword, setShowGooglePassword] = useState(false);
  const [completingGoogle, setCompletingGoogle] = useState(false);
  // A new account made through Google can come with an invite code.
  const invite = useSignupInvite();

  // Only needed once the Google profile step is reached.
  useEffect(() => {
    if (mfaStage !== 'google-profile' || municipalities.length) return;
    setMunicipalitiesLoading(true);
    fetchMunicipalities()
      .then((list) => setMunicipalities(list || []))
      .catch(() => {})
      .finally(() => setMunicipalitiesLoading(false));
  }, [mfaStage, municipalities.length]);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) setApiError('');
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

  // Where a signed-in account goes next.
  const goOn = (role) => {
    if (role === 'SUPER_ADMIN' || role === 'MUNICIPAL_ADMIN') {
      // The website opens its admin panel; the app has none.
      router.replace('/');
    } else if (seller && role === 'SELLER') {
      router.replace(sellerTarget);
    } else if (seller) {
      // No shop yet: the Seller Login leads on to opening one.
      router.replace('/seller-apply');
    } else {
      router.replace(safeRedirect || '/');
    }
  };

  const finishLogin = async (userData, token, refreshToken) => {
    // The login chosen says the side: Seller Login the shop, Log in the buyer
    // side, a seller's account too.
    useSideStore.getState().setSide(userData?.id, seller && userData?.role === 'SELLER' ? 'shop' : 'personal');
    if (seller && userData?.role === 'SELLER') {
      // The white 'Switching to Seller Account' screen first (the website's
      // startAccountSwitch). Signing in comes after it: app/_layout.js closes
      // the sign-in screens the moment an account is signed in, so the move
      // to the Seller Center has to follow at once.
      setSwitching(true);
      await new Promise((resolve) => { setTimeout(resolve, 750); });
    }
    await storeLogin(userData, token, refreshToken);
    goOn(userData?.role);
  };

  const handleSubmit = async () => {
    setApiError('');
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/login', {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
      });
      const data = response.data;

      if (data.requiresMfa) {
        setMfaToken(data.mfaToken);
        setMfaEmail(data.email);
        setMfaStage('verify');
        setIsLoading(false);
        return;
      }
      if (data.requiresMfaSetup) {
        setMfaToken(data.mfaToken);
        setMfaEmail(data.email);
        try {
          const setupRes = await apiClient.post('/auth/mfa/setup/begin-login', { mfaToken: data.mfaToken });
          setSetupData(setupRes.data);
          setMfaStage('setup');
        } catch (err) {
          setApiError(err.message || 'Failed to start MFA setup');
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (data.accessToken && data.user) {
        await finishLogin(data.user, data.accessToken, data.refreshToken);
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      let errorMessage = 'Login failed. Please try again.';
      if (error.message) errorMessage = error.message;
      else if (error.status === 401) errorMessage = 'Invalid email or password';
      setApiError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    setApiError('');
    if (!mfaCode.trim()) {
      setApiError('Enter your 6-digit code or a backup code');
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/mfa/verify-login', { mfaToken, code: mfaCode.trim() });
      const { user, accessToken, refreshToken } = res.data;
      await finishLogin(user, accessToken, refreshToken);
    } catch (error) {
      setApiError(error.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteSetup = async () => {
    setApiError('');
    if (!/^\d{6}$/.test(mfaCode.trim())) {
      setApiError('Enter the 6-digit code from your authenticator');
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/mfa/setup/complete-login', { mfaToken, code: mfaCode.trim() });
      const { user, accessToken, refreshToken, backupCodes: codes } = res.data;
      setBackupCodes(codes);
      // Kept until the codes are saved.
      setSetupData((prev) => ({ ...prev, user, accessToken, refreshToken }));
    } catch (error) {
      setApiError(error.message || 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueAfterSetup = () => {
    if (setupData?.user && setupData?.accessToken) {
      finishLogin(setupData.user, setupData.accessToken, setupData.refreshToken);
    }
  };

  const handleCancelMfa = () => {
    setMfaStage('credentials');
    setMfaCode('');
    setMfaToken('');
    setSetupData(null);
    setBackupCodes(null);
    setApiError('');
  };

  // Google's answer (from the phone's browser, see auth/googleSignIn).
  const applyGoogleAnswer = (data) => {
    if (data?.requiresProfile) {
      setGoogleProfile(data);
      setGoogleForm((prev) => ({ ...prev, fullName: data.fullName || '' }));
      setGoogleFormErrors({});
      setMfaStage('google-profile');
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
    finishLogin(data.user, data.accessToken, data.refreshToken);
  };

  const google = useAuthGoogle(
    { from: 'login', seller, redirect: safeRedirect },
    { onAnswer: applyGoogleAnswer, onError: setApiError },
  );

  const handleGoogleLogin = () => {
    setApiError('');
    google.start();
  };

  const handleGoogleFormChange = (name, value) => {
    setGoogleForm((prev) => ({ ...prev, [name]: value }));
    if (googleFormErrors[name]) setGoogleFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateGoogleForm = () => {
    const errs = {};
    if (!googleForm.fullName.trim()) errs.fullName = 'Full name is required';
    if (!googleProfile?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(googleForm.email.trim())) {
      errs.email = 'Enter your email address';
    }
    if (googleForm.contactNumber && !/^(\+63|0)?[0-9]{10}$/.test(googleForm.contactNumber.replace(/[-\s]/g, ''))) {
      errs.contactNumber = 'Contact number must be 10 digits';
    }
    if (!googleForm.municipalityId) errs.municipalityId = 'Municipality is required';
    if (!googleForm.password) {
      errs.password = 'Password is required';
    } else if (googleForm.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    } else if (!PASSWORD_RULE.test(googleForm.password)) {
      errs.password = 'Password must contain uppercase, lowercase, number, and special character';
    }
    if (googleForm.password !== googleForm.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setGoogleFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCompleteGoogleProfile = async () => {
    setApiError('');
    if (!validateGoogleForm()) return;
    setCompletingGoogle(true);
    try {
      const res = await apiClient.post('/auth/google/complete', {
        googleToken: googleProfile.googleToken,
        fullName: googleForm.fullName.trim(),
        email: googleProfile?.email ? undefined : googleForm.email.trim(),
        contactNumber: googleForm.contactNumber.trim() || undefined,
        province: googleForm.province || undefined,
        municipalityId: googleForm.municipalityId,
        barangay: googleForm.barangay.trim() || undefined,
        address: googleForm.street.trim() || undefined,
        password: googleForm.password,
        confirmPassword: googleForm.confirmPassword,
        ...invite.fields(),
      });
      const data = res.data;
      if (!data?.user || !data?.accessToken) {
        setApiError('Unexpected response from server.');
        return;
      }
      await invite.done();
      await finishLogin(data.user, data.accessToken, data.refreshToken);
    } catch (err) {
      setApiError(err?.message || 'Failed to complete sign-up.');
    } finally {
      setCompletingGoogle(false);
    }
  };

  const handleCancelGoogleProfile = () => {
    setMfaStage('credentials');
    setGoogleProfile(null);
    setGoogleForm(emptyGoogleForm);
    setGoogleFormErrors({});
    setApiError('');
  };

  // The first step, the choice (the website's `choosing` on phones).
  const choosing = !emailOpen && !phoneOpen;
  const otherDoor = seller ? '/login' : '/seller-login';
  const otherDoorLabel = seller ? 'Buyer Login' : 'Seller Login';

  const googleButton = (edge) => (googleOn ? (
    <GoogleButton
      edge={edge}
      label={google.loading ? 'Signing in…' : 'Sign in with Google'}
      onPress={handleGoogleLogin}
      disabled={google.loading}
    />
  ) : null);

  const phoneButton = (edge) => (phoneEnabled ? (
    <AuthWayButton
      edge={edge}
      icon={<DeviceMobileIcon size={21} color={t.neutral[900]} />}
      label="Continue with mobile number"
      onPress={() => { setApiError(''); setPhoneOpen(true); }}
    />
  ) : null);

  // The title row of the email and number steps, the other door at its end.
  const formHeader = (
    <View style={styles.headerRow}>
      <AuthTitle>{seller ? 'Seller Login' : 'Sign In'}</AuthTitle>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.replace(otherDoor)}>
        <Text style={styles.switchLinkText}>{otherDoorLabel}</Text>
      </Pressable>
    </View>
  );

  const onChoose = mfaStage === 'credentials' && choosing;

  return (
    <AuthSheet
      band={onChoose}
      // While choosing, the other door sits in the bar (the title row is the form's).
      switchTo={choosing ? otherDoor : undefined}
      switchLabel={choosing ? otherDoorLabel : undefined}
    >
      <View style={onChoose ? styles.cardChoose : styles.card}>
        {mfaStage === 'verify' && (
          <MfaVerify
            email={mfaEmail}
            code={mfaCode}
            onCodeChange={setMfaCode}
            onSubmit={handleVerifyMfa}
            onCancel={handleCancelMfa}
            isLoading={isLoading}
            apiError={apiError}
          />
        )}
        {mfaStage === 'setup' && (
          <MfaSetup
            email={mfaEmail}
            qrDataUrl={setupData?.qrDataUrl}
            secret={setupData?.secret}
            code={mfaCode}
            onCodeChange={setMfaCode}
            onSubmit={handleCompleteSetup}
            onCancel={handleCancelMfa}
            onContinue={handleContinueAfterSetup}
            backupCodes={backupCodes}
            isLoading={isLoading}
            apiError={apiError}
          />
        )}
        {mfaStage === 'google-profile' && (
          <GoogleCompleteProfile
            profile={googleProfile}
            form={googleForm}
            errors={googleFormErrors}
            onChange={handleGoogleFormChange}
            onAddressChange={(next) => setGoogleForm((prev) => ({ ...prev, ...next }))}
            municipalities={municipalities}
            municipalitiesLoading={municipalitiesLoading}
            showPassword={showGooglePassword}
            onTogglePassword={() => setShowGooglePassword((v) => !v)}
            onSubmit={handleCompleteGoogleProfile}
            onCancel={handleCancelGoogleProfile}
            invite={invite}
            isLoading={completingGoogle}
            apiError={apiError}
          />
        )}
        {onChoose && (
          <AuthChoose
            title={seller ? 'Sell to all of Mindoro' : 'Fresh finds from Mindoro'}
            sub={seller ? 'Log in to your Seller Center' : 'Sign in to shop, chat and track orders'}
            scene={seller ? 'seller' : 'signIn'}
            error={apiError}
            more={(
              <>
                {seller ? 'New to selling? ' : 'New to Emoorm? '}
                <AuthChooseLink onPress={() => router.replace(signUpPath)}>
                  {seller ? 'Open a shop' : 'Create an account'}
                </AuthChooseLink>
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
        )}
        {mfaStage === 'credentials' && phoneOpen && (
          <>
            {formHeader}
            <PhoneSignIn onAnswer={applyGoogleAnswer} onBack={() => setPhoneOpen(false)} />
          </>
        )}
        {mfaStage === 'credentials' && !choosing && !phoneOpen && (
          <>
            {formHeader}

            <View style={styles.form}>
              <AuthField
                label="Email address"
                value={formData.email}
                onChangeText={(v) => handleChange('email', v)}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                error={errors.email}
              />

              <AuthField
                label="Password"
                labelRight={(
                  <Pressable accessibilityRole="link" hitSlop={6} onPress={() => router.replace('/forgot-password')} style={styles.forgot}>
                    <Text style={styles.forgotText}>Forgot?</Text>
                  </Pressable>
                )}
                secure
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                value={formData.password}
                onChangeText={(v) => handleChange('password', v)}
                placeholder="Enter your password"
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={handleSubmit}
                error={errors.password}
              />

              <AuthSubmit
                label={seller ? 'Log in to Seller Center' : 'Log in'}
                busyLabel="Signing in…"
                busy={isLoading}
                onPress={handleSubmit}
                style={styles.submit}
              />

              {apiError ? <AuthErrorBox>{apiError}</AuthErrorBox> : null}

              {/* The "or" only when another way in follows. */}
              {googleOn || phoneEnabled ? <AuthDivider style={styles.divider} /> : null}

              {googleButton(false)}
              {phoneButton(false)}

              <Text style={styles.footer}>
                <Text style={styles.footerText}>{seller ? 'New to selling? ' : 'New to Emoorm? '}</Text>
                <Text accessibilityRole="link" style={styles.footerLink} onPress={() => router.replace(signUpPath)}>
                  {seller ? 'Open a shop' : 'Create an account'}
                </Text>
              </Text>

              <Text style={styles.terms}>
                By logging in, you agree to Emoorm&apos;s{' '}
                <Text accessibilityRole="link" style={styles.termsLink} onPress={() => router.push('/terms')}>Terms</Text>
                {' & '}
                <Text accessibilityRole="link" style={styles.termsLink} onPress={() => router.push('/privacy')}>Privacy Policy</Text>
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Help is in the first step's body ("Trouble signing in?"). */}
      {onChoose ? null : <HelpLink />}
      {seller ? <RoleSwitchOverlay visible={switching} target="seller" /> : null}
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
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  // .login-switch-link in the sheet: plain words, no pill and no icon.
  switchLinkText: { fontSize: 15, lineHeight: 24, color: t.success[700], ...font(500) },
  form: { gap: 16 },
  forgot: { minHeight: 32, justifyContent: 'center' },
  forgotText: { fontSize: 13, lineHeight: 20.8, color: t.primary[600], ...font(500) },
  submit: { marginTop: 8 },
  divider: { marginVertical: 4 },
  footer: { marginTop: 8, textAlign: 'center', fontSize: 14, lineHeight: 21, color: t.neutral[500], ...font(400) },
  footerText: { color: t.neutral[500], ...font(400) },
  footerLink: { color: t.primary[600], ...font(500) },
  terms: { marginTop: 16, marginBottom: 14, textAlign: 'center', fontSize: 12, lineHeight: 18.6, color: t.neutral[500], ...font(400) },
  termsLink: { color: t.primary[600], textDecorationLine: 'underline' },
}));
