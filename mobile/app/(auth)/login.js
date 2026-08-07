import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Link, router } from 'expo-router';
import Button from '../../src/components/Button';
import TextField from '../../src/components/TextField';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import toast from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import { colors, spacing, typography } from '../../src/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const validate = () => {
    const next = {};
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      next.email = 'Email is invalid';
    }
    if (!password) {
      next.password = 'Password is required';
    } else if (password.length < 6) {
      next.password = 'Password must be at least 6 characters';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await apiClient.post(ENDPOINTS.AUTH.LOGIN, {
        email: email.toLowerCase().trim(),
        password,
      });

      if (res.data?.requiresMfa || res.data?.requiresMfaSetup) {
        setApiError('Admin accounts require MFA and must sign in on the web app.');
        return;
      }

      const { user, accessToken, refreshToken } = res.data;
      await login(user, accessToken, refreshToken);
      toast.success(`Welcome back, ${user.fullName?.split(' ')[0] || 'there'}!`);
      router.replace('/');
    } catch (error) {
      setApiError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>E-MOORM</Text>
      <Text style={styles.subtitle}>Log in to continue</Text>

      {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: '' })); }}
        placeholder="you@example.com"
        keyboardType="email-address"
        error={errors.email}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={(v) => { setPassword(v); if (errors.password) setErrors((p) => ({ ...p, password: '' })); }}
        placeholder="••••••••"
        secureTextEntry
        error={errors.password}
      />

      <Button title="Log In" onPress={handleSubmit} loading={isLoading} style={styles.button} />

      <View style={styles.links}>
        <Link href="/(auth)/forgot-password" style={styles.link}>Forgot password?</Link>
        <Link href="/(auth)/register" style={styles.link}>Create an account</Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bgPrimary,
  },
  title: { ...typography.h1, color: colors.primary, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  apiError: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  links: { marginTop: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  link: { ...typography.body, color: colors.primaryDark },
});
