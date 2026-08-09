import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Store } from 'lucide-react-native';
import Button from '../../src/components/Button';
import TextField from '../../src/components/TextField';
import AuthHeader from '../../src/components/AuthHeader';
import ScreenHeader from '../../src/components/ScreenHeader';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import toast from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import { colors, spacing, typography } from '../../src/theme';

export default function Login({ sellerMode = false }) {
  const { redirect } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleSellerAccess = () => {
    router.push('/seller-login');
  };

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
      const requestedDestination = typeof redirect === 'string' && redirect.startsWith('/') && redirect !== '/login' ? redirect : '/';
      const destination = sellerMode
        ? user.role === 'SELLER' ? '/seller' : '/seller-apply'
        : requestedDestination === '/seller-apply' && user.role === 'SELLER' ? '/seller' : requestedDestination;
      router.replace(destination);
    } catch (error) {
      setApiError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={sellerMode ? 'Seller Login' : 'Login'}
        action={(
          sellerMode ? (
            <View style={styles.sellerButton}>
              <Store size={21} color={colors.secondary} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Seller login"
              hitSlop={8}
              onPress={handleSellerAccess}
              style={styles.sellerButton}
            >
              <Store size={21} color={colors.secondary} />
            </Pressable>
          )
        )}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}>
        <AuthHeader title={sellerMode ? 'Seller access' : 'Welcome back'} subtitle={sellerMode ? 'Log in to manage or start your store' : 'Log in to continue'} showBrand />

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

        <Button title={sellerMode ? 'Continue as Seller' : 'Log In'} onPress={handleSubmit} loading={isLoading} style={styles.button} />

        <View style={styles.links}>
          <Link href="/(auth)/forgot-password" style={styles.link}>Forgot password?</Link>
          <Link href={{ pathname: '/register', params: sellerMode ? { redirect: '/seller-apply' } : typeof redirect === 'string' ? { redirect } : {} }} style={styles.link}>Create an account</Link>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  sellerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.bgPrimary,
  },
  apiError: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  links: { marginTop: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  link: { ...typography.body, color: colors.primaryDark },
});
