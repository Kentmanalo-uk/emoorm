import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import Button from '../../src/components/Button';
import TextField from '../../src/components/TextField';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import toast from '../../src/lib/toast';
import { colors, spacing, typography } from '../../src/theme';

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;

export default function ResetPassword() {
  const params = useLocalSearchParams();
  const [token, setToken] = useState(String(params.token || ''));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const hasTokenFromParams = Boolean(params.token);

  const validate = () => {
    const next = {};
    if (!token.trim()) next.token = 'Reset token is required.';
    if (!password) {
      next.password = 'Password is required.';
    } else if (password.length < 8 || !PASSWORD_RULE.test(password)) {
      next.password = 'Must be 8+ chars with uppercase, lowercase, number, and special character.';
    }
    if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      await apiClient.post(ENDPOINTS.AUTH.RESET_PASSWORD, {
        token: token.trim(),
        password,
        confirmPassword,
      });
      setDone(true);
      toast.success('Password updated! Please sign in.');
      setTimeout(() => router.replace('/(auth)/login'), 1500);
    } catch (err) {
      setApiError(err.message || 'Reset failed. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.subtitle}>You can now sign in with your new password. Redirecting…</Text>
        <Link href="/(auth)/login" style={styles.link}>Go to Sign In now</Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>
        {hasTokenFromParams
          ? 'Choose a new password for your account.'
          : "Paste the reset token from your email and choose a new password."}
      </Text>

      {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

      {!hasTokenFromParams && (
        <TextField label="Reset Token" value={token} onChangeText={setToken} placeholder="Paste your reset token" error={errors.token} />
      )}
      <TextField label="New Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry error={errors.password} />
      <TextField label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" secureTextEntry error={errors.confirmPassword} />

      <Button title="Reset Password" onPress={handleSubmit} loading={isLoading} style={styles.button} />

      <Link href="/(auth)/login" style={styles.link}>Back to Login</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bgPrimary,
  },
  title: { ...typography.h1, color: colors.primary, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  apiError: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  link: { ...typography.body, color: colors.primaryDark, textAlign: 'center', marginTop: spacing.xl },
});
