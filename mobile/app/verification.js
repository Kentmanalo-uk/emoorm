import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowClockwiseIcon, CameraIcon, ChatsCircleIcon, CircleNotchIcon, IdentificationCardIcon, LockSimpleIcon,
  ShieldCheckIcon, ShieldWarningIcon, UploadSimpleIcon, XCircleIcon,
} from 'phosphor-react-native';
import apiClient, { STORAGE_KEYS } from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import LoadingSkeleton from '../src/components/LoadingSkeleton';
import { ProfileSelect } from '../src/components/profile/ProfileAddressPicker';
import IdCamera, { assetToUpload } from '../src/components/profile/IdCamera';
import { errorText, fetchIdentityStatus } from '../src/components/profile/profileLib';
import { API_BASE_URL } from '../src/lib/config';
import { invalidateCachedData } from '../src/lib/dataCache';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';

const STATUS_META = {
  NOT_VERIFIED: {
    label: 'Not Verified',
    color: t.neutral[500],
    Icon: ShieldWarningIcon,
    text: 'Verify your identity with a valid Philippine government-issued ID.',
  },
  PENDING: {
    label: 'Verification in Progress',
    color: t.warning[600],
    Icon: CircleNotchIcon,
    text: 'We are reading your ID and checking it against your account. This can take up to a minute.',
  },
  VERIFIED: {
    label: 'Verified',
    color: t.primary[600],
    Icon: ShieldCheckIcon,
    text: 'Your identity is verified.',
  },
  FAILED: {
    label: 'Verification Failed',
    color: t.danger[600],
    Icon: XCircleIcon,
    text: 'We could not verify your identity.',
  },
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** POST /identity-verification: the ID type and the photos, read on the server (up to two minutes). */
async function submitIdentityVerification(idType, front, back) {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const form = new FormData();
  form.append('idType', idType);
  form.append('idImage', await assetToUpload(front, 'id-front.jpg'));
  if (back) form.append('idBackImage', await assetToUpload(back, 'id-back.jpg'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(`${API_BASE_URL}/identity-verification`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) throw new Error(json?.message || `Verification failed (${response.status})`);
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/** The spinning icon of a check in progress. */
function Spin({ children }) {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDeg((d) => (d + 24) % 360), 60);
    return () => clearInterval(timer);
  }, []);
  return <View style={{ transform: [{ rotate: `${deg}deg` }] }}>{children}</View>;
}

/** One photo slot (front or back): the camera, upload and the preview. */
function PhotoSlot({ side, label, hint, asset, disabled, optional, onUpload, onClear, onCamera }) {
  const ratio = asset?.width && asset?.height ? asset.width / asset.height : 1.586;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      {asset ? (
        <View style={styles.preview}>
          <Image
            source={{ uri: asset.uri }}
            accessibilityLabel={`${label} preview`}
            resizeMode="contain"
            style={[styles.previewImg, { aspectRatio: ratio }]}
          />
          <Pressable accessibilityRole="button" onPress={onClear} disabled={disabled} style={[styles.ghost, disabled && styles.off]}>
            {({ pressed }) => (
              <>
                <ArrowClockwiseIcon size={16} color={pressed ? t.primary[600] : t.neutral[700]} />
                <Text style={[styles.ghostText, pressed && { color: t.primary[600] }]}>Replace photo</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.drop}>
          <IdentificationCardIcon size={40} color={t.neutral[500]} />
          <Text style={styles.dropText}>{hint}</Text>
          <View style={styles.dropActions}>
            <Pressable accessibilityRole="button" onPress={() => onCamera(side)} style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && { backgroundColor: t.primary[50] }]}>
              <CameraIcon size={18} color={t.primary[600]} />
              <Text style={[styles.btnText, { color: t.primary[600] }]}>Scan with camera</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onUpload(side)} style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && { backgroundColor: t.primary[50] }]}>
              <UploadSimpleIcon size={18} color={t.primary[600]} />
              <Text style={[styles.btnText, { color: t.primary[600] }]}>Upload photo</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * /profile/verification (web/src/pages/ProfileVerification.jsx with
 * components/identity/IdentityVerifier.jsx): the ID check's status, then the
 * form — the ID type, a photo of the front (the back is optional), the rules
 * and Verify identity. Out of tries for the day: Contact support.
 */
export default function ProfileVerification() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idType, setIdType] = useState('');
  const [files, setFiles] = useState({ front: null, back: null });
  const [submitting, setSubmitting] = useState(false);
  const [cameraSide, setCameraSide] = useState(null);
  const [contacting, setContacting] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchIdentityStatus());
    } catch (error) {
      toast.error(errorText(error, 'Failed to load verification status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickFile = (side, selected) => {
    if (!selected) return;
    const type = selected.mimeType || selected.file?.type || 'image/jpeg';
    if (!IMAGE_TYPES.includes(type)) {
      toast.error('Use a JPG, PNG, or WebP image.');
      return;
    }
    const size = selected.fileSize || selected.file?.size || 0;
    if (size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setFiles((cur) => ({ ...cur, [side]: { ...selected, mimeType: type } }));
  };

  const uploadFor = async (side) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.92 });
      if (!result.canceled && result.assets?.[0]) pickFile(side, result.assets[0]);
    } catch {
      toast.error('Could not open your photos');
    }
  };

  const current = submitting ? 'PENDING' : (status?.status || 'NOT_VERIFIED');
  const outOfAttempts = status?.attemptsRemaining === 0;

  const handleSubmit = async () => {
    if (!idType) {
      toast.error('Select your ID type');
      return;
    }
    if (!files.front) {
      toast.error('Capture or upload a photo of the front of your ID');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitIdentityVerification(idType, files.front, files.back);
      setStatus(result);
      setFiles({ front: null, back: null });
      invalidateCachedData('profile:');
      if (result.status === 'VERIFIED') toast.success('Your identity has been verified');
      else toast.error('Identity verification failed');
    } catch (error) {
      toast.error(error?.name === 'AbortError' ? 'Verification failed. Please try again.' : (error?.message || 'Verification failed. Please try again.'));
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // Opens a support case with the municipal admin for the user's address.
  const contactSupport = async () => {
    setContacting(true);
    try {
      const reason = status?.failureReason ? ` Last result: "${status.failureReason}"` : '';
      const res = await apiClient.post('/support/cases', {
        category: 'IDENTITY_VERIFICATION',
        subject: 'Help verifying my identity',
        message: `Hi, I reached today's limit for identity verification and still can't verify my account.${reason} Could you help me verify my identity?`,
      });
      router.push(`/support?c=${res.data.id}`);
    } catch (error) {
      toast.error(errorText(error, 'Could not reach municipal support'));
    } finally {
      setContacting(false);
    }
  };

  const meta = STATUS_META[current] || STATUS_META.NOT_VERIFIED;
  const StatusIcon = meta.Icon;
  const canSubmit = current === 'NOT_VERIFIED' || current === 'FAILED';
  const verifyOff = submitting || !files.front || !idType || outOfAttempts;
  const idOptions = [{ value: '', label: 'Select your ID', disabled: true }, ...(status?.supportedIdTypes || [])];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Identity Verification" backTo="/profile" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          {status?.requiredForCheckout === false
            ? 'Verification is optional right now, but a verified account is ready if it becomes required.'
            : 'Verified identity is required before checking out.'}
        </Text>

        {loading ? (
          <View style={styles.card} accessibilityLabel="Loading">
            <LoadingSkeleton height={60} borderRadius={12} />
            <LoadingSkeleton height={44} borderRadius={10} />
            <LoadingSkeleton height={140} borderRadius={12} />
          </View>
        ) : (
          <View>
            <View style={styles.status} accessibilityLiveRegion="polite">
              <View style={styles.statusTop}>
                <View style={styles.statusIcon}>
                  {current === 'PENDING'
                    ? <Spin><StatusIcon size={28} weight="bold" color={meta.color} /></Spin>
                    : <StatusIcon size={28} weight="fill" color={meta.color} />}
                </View>
                <View style={styles.statusBody}>
                  <Text style={styles.statusLabel}>{meta.label}</Text>
                  <Text style={styles.statusText}>
                    {current === 'FAILED' && status?.failureReason
                      ? status.failureReason
                      : current === 'VERIFIED' ? 'Your identity is verified. You can check out and place orders.' : meta.text}
                  </Text>
                  {current === 'VERIFIED' && status?.idTypeLabel ? (
                    <Text style={styles.statusMeta}>
                      Verified with {status.idTypeLabel}
                      {status.verifiedAt ? ` on ${new Date(status.verifiedAt).toLocaleDateString()}` : ''}
                    </Text>
                  ) : null}
                  {outOfAttempts && current !== 'VERIFIED' ? (
                    <Text style={styles.statusMeta}>You've used all verification attempts for today. Your municipal admin can help.</Text>
                  ) : null}
                </View>
              </View>
              {outOfAttempts && current !== 'VERIFIED' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={contactSupport}
                  disabled={contacting}
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { backgroundColor: t.primary[700] }, contacting && styles.off]}
                >
                  <ChatsCircleIcon size={18} weight="fill" color="#fff" />
                  <Text style={[styles.btnText, { color: '#fff' }]}>{contacting ? 'Opening…' : 'Contact support'}</Text>
                </Pressable>
              ) : null}
            </View>

            {!submitting && status?.debug ? (
              <View style={styles.debug}>
                <Pressable onPress={() => setDebugOpen((o) => !o)}>
                  <Text style={styles.debugSummary}>{debugOpen ? '▾' : '▸'} OCR debug (development only)</Text>
                </Pressable>
                {debugOpen ? (
                  <Text style={styles.debugPre} selectable>{`${JSON.stringify(status.debug.scores)}\n\n${status.debug.ocrText}`}</Text>
                ) : null}
              </View>
            ) : null}

            {canSubmit ? (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{current === 'FAILED' ? 'Try again with a valid ID' : 'Verify with a government ID'}</Text>
                  {status?.attemptsRemaining != null ? (
                    <Text style={styles.attempts}>
                      {status.attemptsRemaining} attempt{status.attemptsRemaining === 1 ? '' : 's'} left today
                    </Text>
                  ) : null}
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>ID type</Text>
                  <ProfileSelect
                    title="ID type"
                    value={idType}
                    options={idOptions}
                    onChange={setIdType}
                    placeholder="Select your ID"
                    disabled={submitting}
                    style={styles.select}
                  />
                </View>

                <PhotoSlot
                  side="front"
                  label="Photo of the front of your ID"
                  hint="Use a clear, well-lit photo showing the whole card. Your name must be readable."
                  asset={files.front}
                  disabled={submitting}
                  onUpload={uploadFor}
                  onClear={() => setFiles((cur) => ({ ...cur, front: null }))}
                  onCamera={setCameraSide}
                />

                <PhotoSlot
                  side="back"
                  label="Photo of the back of your ID"
                  hint="Add the back of the card if your name or ID number is printed there."
                  optional
                  asset={files.back}
                  disabled={submitting}
                  onUpload={uploadFor}
                  onClear={() => setFiles((cur) => ({ ...cur, back: null }))}
                  onCamera={setCameraSide}
                />

                <View style={styles.rules}>
                  <View style={styles.rule}>
                    <Text style={styles.ruleDot}>•</Text>
                    <Text style={styles.ruleText}>
                      The name on your ID must closely match your account name.{' '}
                      <Text style={styles.ruleLink} onPress={() => router.push('/edit-profile')} accessibilityRole="link">Edit your name</Text>
                    </Text>
                  </View>
                  <View style={styles.rule}>
                    <Text style={styles.ruleDot}>•</Text>
                    <Text style={styles.ruleText}>Only your name is checked, not your address.</Text>
                  </View>
                  <View style={styles.rule}>
                    <Text style={styles.ruleDot}>•</Text>
                    <Text style={styles.ruleText}>Each ID can verify only one account.</Text>
                  </View>
                </View>

                <View style={styles.privacy}>
                  <LockSimpleIcon size={16} color={t.neutral[500]} style={{ marginTop: 2 }} />
                  <Text style={styles.privacyText}>Your ID photos are processed once and discarded. We only keep encrypted verification details.</Text>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: verifyOff }}
                    onPress={handleSubmit}
                    disabled={verifyOff}
                    style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { backgroundColor: t.primary[700] }, verifyOff && styles.off]}
                  >
                    {submitting ? <ActivityIndicator size={18} color="#fff" /> : null}
                    <Text style={[styles.btnText, { color: '#fff' }]}>{submitting ? 'Verifying...' : 'Verify identity'}</Text>
                  </Pressable>
                  {outOfAttempts ? <Text style={styles.attempts}>Daily attempt limit reached. Try again tomorrow.</Text> : null}
                </View>
              </View>
            ) : null}
          </View>
        )}

        {status?.status === 'VERIFIED' ? (
          <Text style={styles.note}>
            Changing your name in{' '}
            <Text style={styles.noteLink} onPress={() => router.push('/settings')} accessibilityRole="link">Settings</Text>
            {' '}will require you to verify again.
          </Text>
        ) : null}
      </ScrollView>

      {cameraSide ? (
        <IdCamera
          side={cameraSide}
          onClose={() => setCameraSide(null)}
          onUpload={async () => {
            const side = cameraSide;
            setCameraSide(null);
            await uploadFor(side);
          }}
          onCapture={(captured) => {
            pickFile(cameraSide, captured);
            setCameraSide(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  subtitle: { fontSize: 13, lineHeight: 18.85, color: t.neutral[500], ...font(400) },

  status: {
    gap: 12, marginHorizontal: -12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: t.neutral[0],
    borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  statusTop: { flexDirection: 'row', gap: 12 },
  statusIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  statusBody: { flex: 1, minWidth: 0 },
  statusLabel: { marginBottom: 4, fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  statusText: { fontSize: 13, lineHeight: 19.5, color: t.neutral[600], ...font(400) },
  statusMeta: { marginTop: 6, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },

  debug: { marginTop: 12, gap: 8 },
  debugSummary: { fontSize: 13, lineHeight: 20, color: t.neutral[500], ...font(400) },
  debugPre: { padding: 12, maxHeight: 260, fontSize: 12, lineHeight: 18, backgroundColor: t.neutral[50], color: t.neutral[700] },

  card: { gap: 16, marginHorizontal: -12, padding: 14, backgroundColor: t.neutral[0] },
  cardHead: { gap: 2, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.neutral[100] },
  cardTitle: { fontSize: 16, lineHeight: 18.4, color: t.neutral[900], ...font(500) },
  attempts: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },

  field: { gap: 8 },
  label: { fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(500) },
  optional: { fontStyle: 'italic', ...font(500) },
  select: { minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderColor: t.neutral[300] },

  drop: {
    alignItems: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300],
    borderRadius: 12, backgroundColor: t.neutral[50],
  },
  dropText: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
  dropActions: { alignSelf: 'stretch', gap: 8, marginTop: 6 },
  preview: { alignItems: 'flex-start', gap: 10 },
  previewImg: { width: '100%', maxHeight: 280, borderRadius: 10, backgroundColor: t.neutral[100] },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  ghostText: { fontSize: 14, lineHeight: 16.8, color: t.neutral[700], ...font(500) },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingVertical: 10, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'transparent', borderRadius: 10,
  },
  btnOutline: { backgroundColor: t.neutral[0], borderColor: t.primary[600] },
  btnPrimary: { backgroundColor: t.primary[600] },
  btnText: { fontSize: 14, lineHeight: 16.8, ...font(500) },
  off: { opacity: 0.55 },

  rules: { gap: 4, paddingLeft: 4 },
  rule: { flexDirection: 'row', gap: 7 },
  ruleDot: { width: 7, fontSize: 13, lineHeight: 20.15, color: t.neutral[600], ...font(400) },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 20.15, color: t.neutral[600], ...font(400) },
  ruleLink: { color: t.primary[600], ...font(500) },

  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18.85, color: t.neutral[500], ...font(400) },
  actions: { gap: 8 },

  note: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },
  noteLink: { color: t.primary[600], ...font(500) },
});
