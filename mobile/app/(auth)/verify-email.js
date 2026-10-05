import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircleIcon, WarningCircleIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import toast from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import AuthSheet from '../../src/components/auth/AuthSheet';
import { AuthSubmit, BusyLabel } from '../../src/components/auth/AuthForm';
import AuthDone, { DoneIcon, DoneText, DoneTitle } from '../../src/components/auth/AuthDone';
import { font, t } from '../../src/theme';

/**
 * /verify-email?token=… — the link in the welcome email (web
 * src/pages/VerifyEmail.jsx). Opening it confirms the address (no sign-in
 * needed). A dead link offers a fresh one to a signed-in account, or sign-in
 * first.
 */
export default function VerifyEmail() {
  const params = useLocalSearchParams();
  const token = typeof params.token === 'string' ? params.token : '';
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [state, setState] = useState(token ? 'checking' : 'failed');
  const [message, setMessage] = useState(token ? '' : 'This link is missing its code. Open the link from your email again.');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  // One request per token.
  const asked = useRef('');

  useEffect(() => {
    if (!token || asked.current === token) return;
    asked.current = token;
    apiClient.post('/auth/verify-email', { token })
      .then((res) => {
        const confirmed = res.data?.email || '';
        setEmail(confirmed);
        setState('done');
        const current = useAuthStore.getState().user;
        if (current && (!confirmed || current.email === confirmed)) updateUser({ ...current, isVerified: true });
      })
      .catch((err) => {
        setMessage(err.message || 'This confirmation link is invalid or has expired.');
        setState('failed');
      });
  }, [token, updateUser]);

  const resend = async () => {
    setSending(true);
    try {
      const res = await apiClient.post('/auth/resend-verification');
      toast.success(`We sent a new link to ${res.data?.email || 'your email'}.`);
    } catch (err) {
      toast.error(err.message || 'Could not send a new link. Try again in a minute.');
    } finally {
      setSending(false);
    }
  };

  const alreadyConfirmed = isAuthenticated && user?.isVerified === true;

  return (
    <AuthSheet bar={false}>
      {state === 'checking' ? (
        <AuthDone>
          <DoneTitle>Confirming your email…</DoneTitle>
          <View style={styles.busy}>
            <BusyLabel color={t.neutral[500]} textStyle={styles.busyText}>One moment</BusyLabel>
          </View>
        </AuthDone>
      ) : null}

      {state === 'done' ? (
        <AuthDone>
          <DoneIcon Icon={CheckCircleIcon} />
          <DoneTitle>Email confirmed</DoneTitle>
          <DoneText>
            {email ? `${email} is confirmed. ` : 'Your email is confirmed. '}
            Welcome to Emoorm!
          </DoneText>
          <AuthSubmit
            label={isAuthenticated ? 'Go to my profile' : 'Log in'}
            onPress={() => router.replace(isAuthenticated ? '/profile' : '/login')}
          />
          <View style={styles.footer}>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={styles.backLink}>
              <Text style={styles.backLinkText}>Start shopping</Text>
            </Pressable>
          </View>
        </AuthDone>
      ) : null}

      {state === 'failed' ? (
        <AuthDone>
          <DoneIcon Icon={WarningCircleIcon} warn />
          <DoneTitle>{alreadyConfirmed ? 'Your email is already confirmed' : "We couldn't confirm your email"}</DoneTitle>
          <DoneText>{alreadyConfirmed ? 'Nothing else to do here.' : message}</DoneText>
          {alreadyConfirmed ? (
            <AuthSubmit label="Go to my profile" onPress={() => router.replace('/profile')} />
          ) : isAuthenticated ? (
            <AuthSubmit label="Send me a new link" busyLabel="Sending…" busy={sending} fade onPress={resend} />
          ) : (
            <AuthSubmit
              label="Log in to get a new link"
              onPress={() => router.replace({ pathname: '/login', params: { redirect: '/profile' } })}
            />
          )}
        </AuthDone>
      ) : null}
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  busy: { alignItems: 'center', marginBottom: 24 },
  busyText: { fontSize: 15, lineHeight: 22.5, color: t.neutral[500], ...font(400) },
  footer: { marginTop: 24, alignItems: 'center' },
  backLink: { minHeight: 44, justifyContent: 'center' },
  backLinkText: { fontSize: 14, lineHeight: 22.4, color: t.primary[600], ...font(500) },
});
