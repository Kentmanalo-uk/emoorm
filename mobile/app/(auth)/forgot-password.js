import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import Button from '../../src/components/Button';
import TextField from '../../src/components/TextField';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { colors, spacing, typography } from '../../src/theme';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, { email: email.toLowerCase().trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          If {email} is registered, we've sent a password reset link. The link expires in 1 hour.
        </Text>
        <Button title="Resend link" variant="secondary" onPress={submit} loading={isLoading} style={styles.button} />
        <Link href="/(auth)/login" style={styles.link}>Back to Login</Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Forgot Password</Text>
      <Text style={styles.subtitle}>We'll send you a reset link</Text>

      <TextField
        label="Email"
        value={email}
        onChangeText={(v) => { setEmail(v); setError(''); }}
        placeholder="you@example.com"
        keyboardType="email-address"
        error={error}
      />

      <Button title="Send Reset Link" onPress={submit} loading={isLoading} style={styles.button} />

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
  button: { marginTop: spacing.sm },
  link: { ...typography.body, color: colors.primaryDark, textAlign: 'center', marginTop: spacing.xl },
});
