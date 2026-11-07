import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import apiClient from '../../api/client';
import { AuthErrorBox, AuthField, AuthSubmit } from './AuthForm';
import { font, t, themed } from '../../theme';

const RESEND_AFTER = 60;

/**
 * Continue with mobile number (web/src/components/auth/PhoneSignIn.jsx): the
 * number, then the 6-digit code texted to it (POST /auth/phone/login/send,
 * then POST /auth/phone/login). `onAnswer` gets the server's answer -- signed
 * in, two-step sign-in, or complete your account (requiresProfile with a
 * googleToken and the number) -- the same shape as a Google sign-in's.
 */
export default function PhoneSignIn({ onAnswer, onBack }) {
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);

  // The resend countdown.
  useEffect(() => {
    if (!wait) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const messageOf = (err, fallback) => err?.message || fallback;

  const sendCode = async () => {
    setError('');
    const clean = number.replace(/[\s-]/g, '').replace(/^\+63/, '0');
    if (!/^09\d{9}$/.test(clean)) {
      setError('Enter a mobile number like 09171234567');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post('/auth/phone/login/send', { number: clean });
      setNumber(clean);
      setSentTo(res?.data?.sentTo || clean);
      setCode('');
      setWait(RESEND_AFTER);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(messageOf(err, 'The code could not be sent. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the text');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post('/auth/phone/login', { number, code: code.trim() });
      onAnswer(res?.data);
    } catch (err) {
      setError(messageOf(err, 'That code did not work. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <View style={styles.form}>
        <View style={styles.group}>
          <AuthField
            label="Mobile number"
            value={number}
            onChangeText={setNumber}
            placeholder="09171234567"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            onSubmitEditing={sendCode}
            error={Boolean(error)}
          />
          <Text style={styles.hint}>We&apos;ll text you a 6-digit code. Standard rates may apply.</Text>
        </View>
        {error ? <AuthErrorBox>{error}</AuthErrorBox> : null}
        <AuthSubmit label="Send code" busyLabel="Sending…" busy={busy} onPress={sendCode} />
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>Other ways to sign in</Text>
        </Pressable>
      </View>
    );
  }

  const resendOff = busy || wait > 0;
  return (
    <View style={styles.form}>
      <Text style={styles.sent}>
        We texted a code to <Text style={styles.sentStrong}>{sentTo}</Text>.{' '}
        <Text
          accessibilityRole="button"
          style={styles.link}
          onPress={() => { setSentTo(''); setError(''); }}
        >
          Change
        </Text>
      </Text>
      <AuthField
        ref={codeRef}
        label="6-digit code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="••••••"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        onSubmitEditing={verify}
        error={Boolean(error)}
        inputStyle={styles.codeInput}
      />
      {error ? <AuthErrorBox>{error}</AuthErrorBox> : null}
      <AuthSubmit label="Continue" busyLabel="Checking…" busy={busy} onPress={verify} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: resendOff }}
        disabled={resendOff}
        onPress={sendCode}
        style={styles.back}
      >
        <Text style={[styles.backText, resendOff && styles.backOff]}>
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .login-form on phones: 16px between the parts.
  form: { gap: 16 },
  // .login-form-group's 8px plus the hint's own 6px.
  group: { gap: 14 },
  // .auth-phone-hint
  hint: { fontSize: 13, lineHeight: 18.85, color: t.neutral[500], ...font(400) },
  // .auth-phone-sent
  sent: { fontSize: 14.5, lineHeight: 21.75, color: t.neutral[600], ...font(400) },
  sentStrong: { color: t.neutral[900], ...font(500) },
  link: { color: t.primary[700], ...font(500) },
  // .auth-phone-code: big digits, spaced out, centred.
  codeInput: { fontSize: 22, letterSpacing: 11, textAlign: 'center' },
  // .auth-phone-back
  back: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
  backText: { fontSize: 14.5, lineHeight: 21.75, color: t.primary[700], ...font(500) },
  backOff: { color: t.neutral[400] },
}));
