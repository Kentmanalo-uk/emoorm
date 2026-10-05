import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EnvelopeSimpleIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import AuthSheet from '../../src/components/auth/AuthSheet';
import { AuthField, AuthOutlineButton, AuthSubmit } from '../../src/components/auth/AuthForm';
import { font, t } from '../../src/theme';

/**
 * Forgot password: the website's phone sheet (web/src/pages/ForgotPassword.jsx
 * + AuthSheet.css), the same sheet as Log in. The reset link exists only in
 * the email; the answer never carries it.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (nextEmail) => {
    setError('');
    if (!nextEmail.trim() || !/\S+@\S+\.\S+/.test(nextEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: nextEmail.toLowerCase().trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Back to Log in swaps the sheet in place.
  const toLogin = () => router.replace('/login');

  return (
    <AuthSheet switchTo="/login" switchLabel="Log in" switchBold>
      {submitted ? (
        <View style={styles.success}>
          <View style={styles.successIcon}>
            <EnvelopeSimpleIcon size={30} weight="fill" color={t.primary[600]} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, styles.center]}>Check your email</Text>
          <Text style={[styles.description, styles.center]}>
            If <Text style={styles.strong}>{email}</Text> is registered, we&apos;ve sent a password reset link.
            The link expires in <Text style={styles.strong}>1 hour</Text>.
          </Text>
          <Text style={styles.hint}>Didn&apos;t get an email? Check your spam folder, or send it again.</Text>
          <View style={styles.actions}>
            <AuthSubmit
              label="Resend link"
              busyLabel="Resending…"
              busy={isLoading}
              fade
              onPress={() => submit(email)}
              style={styles.submit}
            />
            <AuthOutlineButton label="Back to log in" onPress={toLogin} />
          </View>
        </View>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.title}>Forgot your password?</Text>
          <Text style={styles.description}>Enter your registered email and we&apos;ll send you a reset link.</Text>

          <View style={styles.form}>
            <AuthField
              kind="sheet"
              label="Email address"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              onSubmitEditing={() => submit(email)}
              error={error}
            />
            <AuthSubmit
              label="Send reset link"
              busyLabel="Sending…"
              busy={isLoading}
              fade
              onPress={() => submit(email)}
              style={styles.submit}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered it? </Text>
            <Pressable accessibilityRole="link" onPress={toLogin} style={styles.backLink}>
              <Text style={styles.backLinkText}>Log in</Text>
            </Pressable>
          </View>
        </>
      )}
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 28,
    lineHeight: 32.2,
    letterSpacing: -0.28,
    color: t.neutral[900],
    ...font(500),
  },
  center: { textAlign: 'center' },
  description: { marginBottom: 24, fontSize: 15, lineHeight: 22.5, color: t.neutral[500], ...font(400) },
  strong: { color: t.neutral[800], ...font(500) },
  form: { gap: 20 },
  submit: { marginTop: 4 },
  footer: { marginTop: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[600], ...font(400) },
  backLink: { minHeight: 44, justifyContent: 'center' },
  backLinkText: { fontSize: 14, lineHeight: 22.4, color: t.primary[600], ...font(500) },

  success: { paddingTop: 24, alignItems: 'center', gap: 12 },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[50],
  },
  hint: { marginBottom: 20, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
  actions: { alignSelf: 'stretch', gap: 12 },
});
