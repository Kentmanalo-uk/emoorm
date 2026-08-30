import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DesktopIcon as Desktop,
  CheckCircleIcon as CheckCircle,
  XCircleIcon as XCircle,
  WarningCircleIcon as WarningCircle,
} from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import { toast } from '../src/lib/toast';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

// Mirrors Facebook's "Is this your device?" approval screen. The web browser
// that's waiting to log in is polling GET /auth/qr/status/:token in the
// background — approving/rejecting here is what it detects.
export default function QrApprove() {
  const { token: rawToken } = useLocalSearchParams();
  const router = useRouter();

  const [phase, setPhase] = useState('loading'); // loading | ready | submitting | approved | rejected | error
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [token, setToken] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.post(ENDPOINTS.QR_LOGIN.SCAN, { token: rawToken });
        if (cancelled) return;
        setToken(res.data.token);
        setDeviceInfo(res.data);
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err.message || 'This QR code is invalid or has expired');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [rawToken]);

  const respond = async (approve) => {
    setPhase('submitting');
    try {
      await apiClient.post(ENDPOINTS.QR_LOGIN.APPROVE, { token, approve });
      if (approve) {
        setPhase('approved');
        toast.success('Login approved', 'You can now continue on your computer.');
      } else {
        setPhase('rejected');
        toast.info('Login request cancelled');
      }
      setTimeout(() => router.replace('/'), 1600);
    } catch (err) {
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
      setPhase('error');
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Approve Login" />

      <View style={styles.body}>
        {phase === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Checking QR code…</Text>
          </View>
        )}

        {(phase === 'ready' || phase === 'submitting') && deviceInfo && (
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Desktop size={32} color={colors.secondary} />
            </View>
            <Text style={styles.title}>Is this you?</Text>
            <Text style={styles.subtitle}>
              A login was requested on this device:
            </Text>
            <View style={styles.deviceBox}>
              <Text style={styles.deviceLabel}>{deviceInfo.deviceLabel || 'Unknown device'}</Text>
              <Text style={styles.deviceMeta}>Requested just now</Text>
            </View>
            <Text style={styles.warning}>
              If you didn't request this, tap Cancel and no one will be logged in.
            </Text>

            <Pressable
              style={[styles.approveButton, phase === 'submitting' && styles.buttonDisabled]}
              disabled={phase === 'submitting'}
              onPress={() => respond(true)}
            >
              {phase === 'submitting'
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.approveText}>Yes, Approve</Text>}
            </Pressable>
            <Pressable
              style={[styles.cancelButton, phase === 'submitting' && styles.buttonDisabled]}
              disabled={phase === 'submitting'}
              onPress={() => respond(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {phase === 'approved' && (
          <View style={styles.center}>
            <CheckCircle size={48} color={colors.success} />
            <Text style={styles.resultTitle}>Approved!</Text>
            <Text style={styles.resultText}>You can now continue on your computer.</Text>
          </View>
        )}

        {phase === 'rejected' && (
          <View style={styles.center}>
            <XCircle size={48} color={colors.gray400} />
            <Text style={styles.resultTitle}>Request cancelled</Text>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.center}>
            <WarningCircle size={48} color={colors.error} />
            <Text style={styles.resultTitle}>Can't approve this login</Text>
            <Text style={styles.resultText}>{errorMessage}</Text>
            <Pressable style={styles.doneButton} onPress={() => router.replace('/')}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  card: { alignItems: 'center' },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryLighter,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  deviceBox: {
    width: '100%', backgroundColor: colors.bgSecondary, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.lg,
  },
  deviceLabel: { ...typography.h3, color: colors.textPrimary },
  deviceMeta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  warning: {
    ...typography.caption, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl,
  },
  approveButton: {
    width: '100%', backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', marginBottom: spacing.sm,
  },
  approveText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.white },
  cancelButton: {
    width: '100%', borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.borderMedium,
  },
  cancelText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textSecondary },
  buttonDisabled: { opacity: 0.6 },
  resultTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm },
  resultText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  doneButton: {
    marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  doneText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.white },
});
