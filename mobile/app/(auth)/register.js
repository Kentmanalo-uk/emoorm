import { useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../../src/components/Button';
import TextField from '../../src/components/TextField';
import Select from '../../src/components/Select';
import AuthHeader from '../../src/components/AuthHeader';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import toast from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import { colors, spacing, typography } from '../../src/theme';
import { fetchMunicipalities } from '../../src/lib/referenceData';

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;

export default function Register() {
  const { redirect } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    contactNumber: '',
    password: '',
    confirmPassword: '',
    municipalityId: '',
    barangay: '',
    address: '',
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [municipalities, setMunicipalities] = useState([]);
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    fetchMunicipalities()
      .then(setMunicipalities)
      .catch(() => toast.error('Failed to load municipalities'));
  }, []);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) setApiError('');
  };

  const validate = () => {
    const next = {};
    if (!form.fullName.trim()) {
      next.fullName = 'Full name is required';
    } else if (form.fullName.trim().length < 2) {
      next.fullName = 'Full name must be at least 2 characters';
    }
    if (!form.email.trim()) {
      next.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      next.email = 'Email is invalid';
    }
    if (!form.municipalityId) {
      next.municipalityId = 'Municipality is required';
    }
    if (form.contactNumber && !/^(\+63|0)?[0-9]{10}$/.test(form.contactNumber.replace(/[-\s]/g, ''))) {
      next.contactNumber = 'Contact number must be 10 digits';
    }
    if (!form.password) {
      next.password = 'Password is required';
    } else if (form.password.length < 8) {
      next.password = 'Password must be at least 8 characters';
    } else if (!PASSWORD_RULE.test(form.password)) {
      next.password = 'Must contain uppercase, lowercase, number, and special character';
    }
    if (!form.confirmPassword) {
      next.confirmPassword = 'Please confirm your password';
    } else if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await apiClient.post(ENDPOINTS.AUTH.REGISTER, {
        email: form.email.toLowerCase().trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        fullName: form.fullName.trim(),
        contactNumber: form.contactNumber.trim() || undefined,
        municipalityId: form.municipalityId,
        barangay: form.barangay.trim() || undefined,
        address: form.address.trim() || undefined,
      });

      const { user, accessToken, refreshToken } = res.data;
      await login(user, accessToken, refreshToken);
      toast.success('Account created!', `Welcome, ${user.fullName}`);
      const destination = typeof redirect === 'string' && redirect.startsWith('/') && redirect !== '/register' ? redirect : '/';
      router.replace(destination);
    } catch (error) {
      if (Array.isArray(error.errors) && error.errors.length > 0) {
        setApiError(error.errors[0].message || error.message);
      } else {
        setApiError(error.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <AuthHeader title="Create Account" subtitle="Join E-MOORM as a buyer" showBrand />

      {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

      <TextField label="Full Name" value={form.fullName} onChangeText={(v) => setField('fullName', v)} placeholder="Juan Dela Cruz" error={errors.fullName} />
      <TextField label="Email address" value={form.email} onChangeText={(v) => setField('email', v)} placeholder="you@example.com" keyboardType="email-address" error={errors.email} />
      <TextField label="Contact Number (optional)" value={form.contactNumber} onChangeText={(v) => setField('contactNumber', v)} placeholder="09171234567" keyboardType="phone-pad" error={errors.contactNumber} />
      <Select
        label="Municipality"
        value={form.municipalityId}
        onChange={(v) => setField('municipalityId', v)}
        options={municipalities.map((m) => ({ label: m.name, value: m.id }))}
        placeholder={municipalities.length ? 'Select your municipality' : 'Loading…'}
        error={errors.municipalityId}
      />
      <TextField label="Barangay (optional)" value={form.barangay} onChangeText={(v) => setField('barangay', v)} placeholder="Barangay" />
      <TextField label="Address (optional)" value={form.address} onChangeText={(v) => setField('address', v)} placeholder="Street, house number" />
      <TextField label="Password" value={form.password} onChangeText={(v) => setField('password', v)} placeholder="••••••••" secureTextEntry error={errors.password} />
      <TextField label="Confirm Password" value={form.confirmPassword} onChangeText={(v) => setField('confirmPassword', v)} placeholder="••••••••" secureTextEntry error={errors.confirmPassword} />

      <Button title="Create Account" onPress={handleSubmit} loading={isLoading} style={styles.button} />

      <Link href={{ pathname: '/login', params: typeof redirect === 'string' ? { redirect } : {} }} style={styles.link}>Already have an account? Log in</Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.bgPrimary,
  },
  apiError: { ...typography.body, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  link: { ...typography.body, color: colors.primaryDark, textAlign: 'center', marginTop: spacing.xl },
});
