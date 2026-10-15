import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircleIcon, ClockIcon, DesktopIcon, DeviceMobileIcon, GlobeIcon, LockKeyIcon, QrCodeIcon,
  ShieldCheckIcon, UserIcon, WarningCircleIcon, XCircleIcon,
} from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { resolveImg } from '../src/lib/media';
import { font, t } from '../src/theme';

/*
 * "Allow this computer?" after scanning the website's "Log in with QR" code
 * (qr-scan.js). Shows who will be signed in there (this account), on what
 * (browser and system), from which network address, when it was asked for
 * and how long is left; Allow signs that computer in at once (its page is
 * waiting: GET /auth/qr/status/:token), Don't allow tells it no.
 *
 * Accounts with two-factor sign-in enter their 6-digit code to allow (the
 * server asks for it); admin accounts can't sign in by QR at all.
 */

const timeOf = (iso) => (iso
  ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  : '');
const isPhone = (label) => /android|ios/i.test(String(label || ''));
const needsCode = (message) => /authenticator|6-digit/i.test(String(message || ''));

export default function QrApprove() {
  const { token: rawToken } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  // loading | ready | submitting | approved | rejected | expired | error
  const [phase, setPhase] = useState('loading');
  const [request, setRequest] = useState(null);
  const [message, setMessage] = useState('');
  const [askCode, setAskCode] = useState(Boolean(user?.mfaEnabled));
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(null);
  const leaveTimer = useRef(null);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // The scan: binds the code to this account and says who is asking.
  useEffect(() => {
    let live = true;
    apiClient.post(ENDPOINTS.QR_LOGIN.SCAN, { token: rawToken })
      .then((res) => {
        if (!live) return;
        setRequest(res.data);
        setPhase('ready');
      })
      .catch((err) => {
        if (!live) return;
        setMessage(err.message || 'This QR code is invalid or has expired.');
        setPhase('error');
      });
    return () => { live = false; };
  }, [rawToken]);

  // How long the code has left (the computer's page shows the same).
  useEffect(() => {
    if (!request?.expiresAt || !['ready', 'submitting'].includes(phase)) return undefined;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(request.expiresAt).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setPhase('expired');
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [request?.expiresAt, phase]);

  const finish = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const respond = async (approve) => {
    if (approve && askCode && code.length !== 6) {
      setMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setPhase('submitting');
    setMessage('');
    try {
      await apiClient.post(ENDPOINTS.QR_LOGIN.APPROVE, { token: request.token, approve, ...(askCode && approve ? { code } : {}) });
      setPhase(approve ? 'approved' : 'rejected');
      leaveTimer.current = setTimeout(finish, approve ? 2600 : 1600);
    } catch (err) {
      const text = err.message || 'Something went wrong. Please try again.';
      if (approve && needsCode(text)) {
        // The account has two-factor sign-in: the code, then Allow again.
        setAskCode(true);
        setMessage(askCode ? 'That code didn’t work. Check your authenticator app and try again.' : text);
        setPhase('ready');
        return;
      }
      if (/expired/i.test(text)) {
        setPhase('expired');
        return;
      }
      setMessage(text);
      setPhase('error');
    }
  };

  const busy = phase === 'submitting';
  const device = request?.deviceLabel || 'A web browser';
  const DeviceIcon = isPhone(device) ? DeviceMobileIcon : DesktopIcon;
  const photo = resolveImg(user?.profilePhoto);
  const mm = left != null ? Math.floor(left / 60) : 0;
  const ss = left != null ? String(left % 60).padStart(2, '0') : '00';

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Log in on a computer" menu={false} backTo="/profile" />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {phase === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary[600]} />
            <Text style={styles.muted}>Checking the code…</Text>
          </View>
        ) : null}

        {(phase === 'ready' || phase === 'submitting') && request ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}><DeviceIcon size={34} color={t.primary[600]} /></View>
              <Text style={styles.title} accessibilityRole="header">Allow this computer to log in?</Text>
              <Text style={styles.lead}>
                It will be signed in to your E-MOORM account, the same as this phone. You won’t need a password there.
              </Text>
            </View>

            {/* Who gets signed in. */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Signing in as</Text>
              <View style={styles.account}>
                <View style={styles.avatar}>
                  {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} /> : <UserIcon size={22} color={t.primary[600]} />}
                </View>
                <View style={styles.accountText}>
                  <Text style={styles.accountName} numberOfLines={1}>{user?.fullName || 'Your account'}</Text>
                  {user?.email ? <Text style={styles.accountMeta} numberOfLines={1}>{user.email}</Text> : null}
                </View>
              </View>
            </View>

            {/* What is asking. */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>The computer asking</Text>
              <InfoRow Icon={DeviceIcon} label="Device" value={device} />
              {request.ipAddress ? <InfoRow Icon={GlobeIcon} label="Network address" value={request.ipAddress} /> : null}
              <InfoRow Icon={QrCodeIcon} label="Requested" value={`Today, ${timeOf(request.requestedAt) || 'just now'}`} />
              <InfoRow
                Icon={ClockIcon}
                label="Code expires in"
                value={left != null ? `${mm}:${ss}` : '—'}
                warn={left != null && left <= 30}
                last
              />
            </View>

            {askCode ? (
              <View style={styles.card}>
                <View style={styles.codeHead}>
                  <LockKeyIcon size={18} color={t.neutral[700]} />
                  <Text style={styles.codeTitle}>Your authenticator code</Text>
                </View>
                <Text style={styles.codeHelp}>Two-factor sign-in is on for this account. Enter the 6-digit code from your authenticator app.</Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setMessage(''); }}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor={t.neutral[300]}
                  style={styles.codeInput}
                  accessibilityLabel="Authenticator code"
                />
              </View>
            ) : null}

            <View style={styles.notice}>
              <ShieldCheckIcon size={18} color={t.warning[700]} />
              <Text style={styles.noticeText}>
                Only allow this if you are logging in on that computer yourself, right now. Never scan a code someone sent you.
              </Text>
            </View>

            {message ? <Text style={styles.error} accessibilityLiveRegion="polite">{message}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => respond(true)}
              style={({ pressed }) => [styles.allow, pressed && styles.allowPressed, busy && styles.disabled]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.allowText}>Allow</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => respond(false)}
              style={({ pressed }) => [styles.deny, pressed && styles.denyPressed, busy && styles.disabled]}
            >
              <Text style={styles.denyText}>Don’t allow</Text>
            </Pressable>
          </>
        ) : null}

        {phase === 'approved' ? (
          <Result
            Icon={CheckCircleIcon}
            color={t.primary[600]}
            title="You’re logged in on the computer"
            text={`${device} is now signed in as ${user?.fullName || 'you'}. You can keep using it there.`}
            onDone={finish}
          />
        ) : null}
        {phase === 'rejected' ? (
          <Result
            Icon={XCircleIcon}
            color={t.neutral[500]}
            title="Not allowed"
            text="Nobody was logged in. The computer’s page says the request was declined."
            onDone={finish}
          />
        ) : null}
        {phase === 'expired' ? (
          <Result
            Icon={ClockIcon}
            color={t.warning[600]}
            title="This code expired"
            text="Codes last 2 minutes. On the computer, tap “Get a new code”, then scan it again."
            action="Scan again"
            onAction={() => router.replace('/qr-scan')}
            onDone={finish}
          />
        ) : null}
        {phase === 'error' ? (
          <Result
            Icon={WarningCircleIcon}
            color={t.danger[600]}
            title="Can’t allow this login"
            text={message}
            action="Scan again"
            onAction={() => router.replace('/qr-scan')}
            onDone={finish}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function InfoRow({ Icon, label, value, warn = false, last = false }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <Icon size={18} color={warn ? t.warning[600] : t.neutral[500]} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, warn && styles.rowWarn]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Result({ Icon, color, title, text, action, onAction, onDone }) {
  return (
    <View style={styles.result}>
      <Icon size={56} weight="fill" color={color} />
      <Text style={styles.resultTitle} accessibilityRole="header">{title}</Text>
      {text ? <Text style={styles.resultText}>{text}</Text> : null}
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.allow, styles.resultBtn, pressed && styles.allowPressed]}>
          <Text style={styles.allowText}>{action}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.deny, styles.resultBtn, pressed && styles.denyPressed]}>
        <Text style={styles.denyText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[50] },
  body: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  center: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[500] },

  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 4, paddingHorizontal: 8 },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, backgroundColor: t.primary[50],
  },
  title: { fontSize: 21, lineHeight: 27, ...font(600), color: t.neutral[900], textAlign: 'center' },
  lead: { marginTop: 6, fontSize: 14.5, lineHeight: 21, ...font(400), color: t.neutral[600], textAlign: 'center' },

  card: {
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: t.neutral[0],
    borderWidth: 1, borderColor: t.neutral[100],
  },
  cardLabel: { marginBottom: 10, fontSize: 12, lineHeight: 16, ...font(600), color: t.neutral[500], textTransform: 'uppercase', letterSpacing: 0.4 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[50],
  },
  accountText: { flex: 1, minWidth: 0 },
  accountName: { fontSize: 16, lineHeight: 21, ...font(600), color: t.neutral[900] },
  accountMeta: { fontSize: 13.5, lineHeight: 19, ...font(400), color: t.neutral[500] },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.neutral[200] },
  rowLabel: { fontSize: 14, lineHeight: 19, ...font(400), color: t.neutral[600] },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, lineHeight: 19, ...font(500), color: t.neutral[900], fontVariant: ['tabular-nums'] },
  rowWarn: { color: t.warning[700] },

  codeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeTitle: { fontSize: 15, lineHeight: 20, ...font(600), color: t.neutral[900] },
  codeHelp: { marginTop: 4, marginBottom: 10, fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[600] },
  codeInput: {
    height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
    textAlign: 'center', fontSize: 24, letterSpacing: 8, ...font(600), color: t.neutral[900],
  },

  notice: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: t.warning[50],
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18.5, ...font(400), color: t.warning[800] },
  error: { fontSize: 13.5, lineHeight: 19, ...font(500), color: t.danger[600], textAlign: 'center' },

  allow: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: t.primary[600], marginTop: 4,
  },
  allowPressed: { backgroundColor: t.primary[700] },
  allowText: { fontSize: 16, lineHeight: 20, ...font(600), color: '#fff' },
  deny: {
    minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 999,
    borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  denyPressed: { backgroundColor: t.neutral[100] },
  denyText: { fontSize: 15.5, lineHeight: 20, ...font(600), color: t.neutral[700] },
  disabled: { opacity: 0.6 },

  result: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 8 },
  resultTitle: { marginTop: 6, fontSize: 20, lineHeight: 26, ...font(600), color: t.neutral[900], textAlign: 'center' },
  resultText: { fontSize: 14.5, lineHeight: 21, ...font(400), color: t.neutral[600], textAlign: 'center', marginBottom: 14 },
  resultBtn: { alignSelf: 'stretch' },
});
