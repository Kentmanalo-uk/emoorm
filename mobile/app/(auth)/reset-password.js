import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircleIcon, CheckIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import AuthSheet from '../../src/components/auth/AuthSheet';
import { AuthField, AuthSubmit } from '../../src/components/auth/AuthForm';
import AuthDone, { DoneIcon, DoneText, DoneTitle } from '../../src/components/auth/AuthDone';
import { font, t } from '../../src/theme';

/**
 * Reset password, from the link in the email (/reset-password?token=…): the
 * website's phone sheet (web/src/pages/ResetPassword.jsx + AuthSheet.css),
 * with the password rules ticking off as they are met.
 */
export default function ResetPassword() {
  const params = useLocalSearchParams();
  const tokenFromUrl = typeof params.token === 'string' ? params.token : '';

  const [formData, setFormData] = useState({ token: tokenFromUrl, password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const leaveTimer = useRef(null);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const hasTokenFromUrl = Boolean(tokenFromUrl);

  const rules = [
    { label: 'At least 8 characters', ok: formData.password.length >= 8 },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(formData.password) },
    { label: 'One lowercase letter', ok: /[a-z]/.test(formData.password) },
    { label: 'One number', ok: /\d/.test(formData.password) },
    { label: 'One special character', ok: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) },
  ];

  const handleChange = (name, value) => {
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

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      await apiClient.post('/auth/reset-password', {
        token: formData.token.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });
      setDone(true);
      leaveTimer.current = setTimeout(() => router.replace('/login'), 2000);
    } catch (err) {
      setApiError(err.message || 'Reset failed. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmMatches = formData.confirmPassword && formData.confirmPassword === formData.password;

  return (
    <AuthSheet switchTo="/login" switchLabel="Log in" switchBold>
      {done ? (
        <AuthDone>
          <DoneIcon Icon={CheckCircleIcon} />
          <DoneTitle>Password updated</DoneTitle>
          <DoneText>You can now log in with your new password. Taking you to log in…</DoneText>
          <AuthSubmit label="Log in now" onPress={() => { clearTimeout(leaveTimer.current); router.replace('/login'); }} />
        </AuthDone>
      ) : (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Reset your password</Text>
          <Text style={styles.description}>
            {hasTokenFromUrl
              ? 'Choose a new password for your account. This link expires in 1 hour.'
              : 'Paste the reset token from your email and choose a new password.'}
          </Text>

          <View style={styles.form}>
            {!hasTokenFromUrl ? (
              <AuthField
                kind="sheet"
                label="Reset token"
                value={formData.token}
                onChangeText={(v) => handleChange('token', v)}
                placeholder="Paste your reset token"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                error={errors.token}
              />
            ) : null}

            <View>
              <AuthField
                kind="sheet"
                label="New password"
                secure
                eyeSize={20}
                eyeStart
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                value={formData.password}
                onChangeText={(v) => handleChange('password', v)}
                placeholder="New password"
                autoComplete="new-password"
                textContentType="newPassword"
                error={errors.password}
              />
              {formData.password ? (
                <View style={styles.rules} accessibilityLabel="Password requirements">
                  {rules.map((r) => (
                    <View key={r.label} style={styles.rule}>
                      <View style={[styles.ruleDot, r.ok && styles.ruleDotOk]}>
                        {r.ok ? <CheckIcon size={10} weight="bold" color="#fff" /> : null}
                      </View>
                      <Text style={[styles.ruleText, r.ok && styles.ruleTextOk]}>{r.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View>
              <AuthField
                kind="sheet"
                label="Confirm new password"
                value={formData.confirmPassword}
                onChangeText={(v) => handleChange('confirmPassword', v)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Confirm new password"
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={handleSubmit}
                error={errors.confirmPassword}
              />
              {!errors.confirmPassword && confirmMatches ? (
                <View style={styles.match}>
                  <CheckIcon size={12} weight="bold" color={t.primary[700]} />
                  <Text style={styles.matchText}>Passwords match</Text>
                </View>
              ) : null}
            </View>

            {apiError ? (
              <View accessibilityRole="alert" style={styles.apiError}>
                <Text style={styles.apiErrorText}>{apiError}</Text>
                <Text style={styles.apiErrorMore}>
                  Need a new link?{' '}
                  <Text accessibilityRole="link" style={styles.apiErrorLink} onPress={() => router.replace('/forgot-password')}>
                    Request another one
                  </Text>
                  .
                </Text>
              </View>
            ) : null}

            <AuthSubmit
              label="Reset password"
              busyLabel="Resetting…"
              busy={isLoading}
              fade
              onPress={handleSubmit}
              style={styles.submit}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered it? </Text>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/login')} style={styles.backLink}>
              <Text style={styles.backLinkText}>Log in</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  // .rp-card lays its parts 8px apart.
  card: { paddingTop: 8, gap: 8 },
  title: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 28,
    lineHeight: 32.2,
    letterSpacing: -0.28,
    color: t.neutral[900],
    ...font(500),
  },
  description: { marginBottom: 24, fontSize: 15, lineHeight: 22.5, color: t.neutral[500], ...font(400) },
  form: { gap: 20 },
  rules: { marginTop: 18, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.neutral[200],
  },
  ruleDotOk: { backgroundColor: t.primary[600] },
  ruleText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  ruleTextOk: { color: t.primary[700] },
  match: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 4 },
  matchText: { fontSize: 13, lineHeight: 20.8, color: t.primary[700], ...font(400) },
  apiError: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.danger[200],
    backgroundColor: t.danger[50],
  },
  apiErrorText: { fontSize: 14, lineHeight: 22.4, color: t.danger[600], ...font(400) },
  apiErrorMore: { marginTop: 6, fontSize: 12, lineHeight: 19.2, color: t.danger[600], ...font(400) },
  apiErrorLink: { color: t.primary[600] },
  submit: { marginTop: 4 },
  footer: { marginTop: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[600], ...font(400) },
  backLink: { minHeight: 44, justifyContent: 'center' },
  backLinkText: { fontSize: 14, lineHeight: 22.4, color: t.primary[600], ...font(500) },
});
