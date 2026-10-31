import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowClockwiseIcon, CameraIcon, ChatsCircleIcon, CircleNotchIcon, IdentificationCardIcon, LockSimpleIcon,
  ShieldCheckIcon, ShieldWarningIcon, UploadSimpleIcon, XCircleIcon,
} from '../../../lib/icons';
import apiClient, { authedFetch } from '../../../api/client';
import LoadingSkeleton from '../../LoadingSkeleton';
import Select from '../../Select';
import IdCamera, { assetToUpload } from '../../profile/IdCamera';
import { fetchIdentityStatus } from '../../profile/profileLib';
import { invalidateCachedData } from '../../../lib/dataCache';
import { toast } from '../../../lib/toast';
import { font, t, themed } from '../../../theme';
import { CARD_SHADOW, Spin } from '../analytics/parts';
import { PageLoader } from '../../BrandLoader';

/*
 * The OCR identity check (web/src/components/identity/IdentityVerifier.jsx)
 * as the Seller Center's Verify identity page shows it on phones
 * (ProfileVerification.css without the Profile's rounding; SellerSetup.css
 * .sv .idv-verifier): one card with 16px corners holding the status, then
 * the form — ID type, the front of the ID (the back is optional), the
 * rules and Verify identity. Out of tries for the day: Contact support.
 * The buyer's Profile page (app/verification.js) is the same check in the
 * Profile's look; the camera (IdCamera) is shared.
 *
 * verifiedText: what the verified state says here.
 * onStatus(status): every status the server returns.
 * onVerified(status): once, when the account becomes verified here.
 * supportPath: the support inbox a stuck seller is sent to.
 */

const STATUS_META = themed(() => ({
  NOT_VERIFIED: {
    label: 'Not Verified', color: t.neutral[500], Icon: ShieldWarningIcon,
    text: 'Verify your identity with a valid Philippine government-issued ID.',
  },
  PENDING: {
    label: 'Verification in Progress', color: t.warning[600], Icon: CircleNotchIcon,
    text: 'We are reading your ID and checking it against your account. This can take up to a minute.',
  },
  VERIFIED: {
    label: 'Verified', color: t.primary[600], Icon: ShieldCheckIcon,
    text: 'Your identity is verified.',
  },
  FAILED: {
    label: 'Verification Failed', color: t.danger[600], Icon: XCircleIcon,
    text: 'We could not verify your identity.',
  },
}));

/** POST /identity-verification (multipart): the ID type and the photos, read on the server (up to two minutes). */
async function submitIdentityVerification(idType, front, back) {
  const frontPart = await assetToUpload(front, 'id-front.jpg');
  const backPart = back ? await assetToUpload(back, 'id-back.jpg') : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    // authedFetch renews a lapsed session once (a fresh form for the retry).
    const response = await authedFetch('/identity-verification', () => {
      const form = new FormData();
      form.append('idType', idType);
      form.append('idImage', frontPart);
      if (backPart) form.append('idBackImage', backPart);
      return { method: 'POST', body: form, signal: controller.signal };
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) throw new Error(json?.message || `Verification failed (${response.status})`);
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/** .idv-btn: square, full width on phones. */
function Btn({ label, kind = 'outline', Icon, iconWeight, onPress, disabled, busy }) {
  const primary = kind === 'primary';
  const fg = primary ? t.neutral[0] : t.primary[600];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn, primary ? styles.btnPrimary : styles.btnOutline,
        pressed && (primary ? { backgroundColor: t.primary[700] } : { backgroundColor: t.primary[50] }),
        disabled && styles.off,
      ]}
    >
      {busy ? <Spin on><CircleNotchIcon size={18} color={fg} /></Spin> : null}
      {!busy && Icon ? <Icon size={18} weight={iconWeight} color={fg} /> : null}
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** One photo slot (front or back): the camera, upload and the preview. */
function PhotoSlot({
  side, label, hint, asset, disabled, optional, onUpload, onClear, onCamera,
}) {
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
            <Btn label="Scan with camera" Icon={CameraIcon} onPress={() => onCamera(side)} />
            <Btn label="Upload photo" Icon={UploadSimpleIcon} onPress={() => onUpload(side)} />
          </View>
        </View>
      )}
    </View>
  );
}

export default function IdentityVerifier({
  verifiedText, onStatus, onVerified, supportPath = '/support',
}) {
  const router = useRouter();
  const [status, setStatusState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idType, setIdType] = useState('');
  const [files, setFiles] = useState({ front: null, back: null });
  const [submitting, setSubmitting] = useState(false);
  const [cameraSide, setCameraSide] = useState(null);
  const [contacting, setContacting] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const setStatus = useCallback((next) => {
    setStatusState(next);
    onStatus?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchIdentityStatus());
    } catch (error) {
      toast.error(error?.message || 'Failed to load verification status');
    } finally {
      setLoading(false);
    }
  }, [setStatus]);

  useEffect(() => { load(); }, [load]);

  const pickFile = (side, selected) => {
    if (!selected) return;
    // Any photo the phone can open; it is made a sharp JPEG as it is sent.
    setFiles((cur) => ({ ...cur, [side]: selected }));
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
      // The buyer's Profile shows the same status: let it load afresh.
      invalidateCachedData('profile:');
      if (result.status === 'VERIFIED') {
        toast.success('Your identity has been verified');
        onVerified?.(result);
      } else {
        toast.error('Identity verification failed');
      }
    } catch (error) {
      toast.error(error?.name === 'AbortError' ? 'Verification failed. Please try again.' : (error?.message || 'Verification failed. Please try again.'));
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // Opens a support case with the municipal admin for the seller's address.
  const contactSupport = async () => {
    setContacting(true);
    try {
      const reason = status?.failureReason ? ` Last result: "${status.failureReason}"` : '';
      const res = await apiClient.post('/support/cases', {
        category: 'IDENTITY_VERIFICATION',
        subject: 'Help verifying my identity',
        message: `Hi, I reached today's limit for identity verification and still can't verify my account.${reason} Could you help me verify my identity?`,
      });
      router.push(`${supportPath}?c=${res.data.id}`);
    } catch (error) {
      toast.error(error?.message || 'Could not reach municipal support');
    } finally {
      setContacting(false);
    }
  };

  if (loading) {
    return (
      <PageLoader label="Loading" />
    );
  }

  const meta = STATUS_META[current] || STATUS_META.NOT_VERIFIED;
  const StatusIcon = meta.Icon;
  const canSubmit = current === 'NOT_VERIFIED' || current === 'FAILED';
  const verifyOff = submitting || !files.front || !idType || outOfAttempts;
  const idOptions = [{ value: '', label: 'Select your ID', disabled: true }, ...(status?.supportedIdTypes || [])];

  return (
    <View style={styles.verifier}>
      <View style={[styles.status, styles.statusBand]} accessibilityLiveRegion="polite">
        <View style={styles.statusTop}>
          <View style={styles.statusIcon}>
            {current === 'PENDING'
              ? <Spin on><StatusIcon size={28} weight="bold" color={meta.color} /></Spin>
              : <StatusIcon size={28} weight="fill" color={meta.color} />}
          </View>
          <View style={styles.statusBody}>
            <Text style={styles.statusLabel}>{meta.label}</Text>
            <Text style={styles.statusText}>
              {current === 'FAILED' && status?.failureReason
                ? status.failureReason
                : current === 'VERIFIED' && verifiedText ? verifiedText : meta.text}
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
          <Btn label={contacting ? 'Opening…' : 'Contact support'} kind="primary" Icon={ChatsCircleIcon} iconWeight="fill" onPress={contactSupport} disabled={contacting} />
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
            <Select
              title="ID type"
              value={idType}
              options={idOptions}
              onChange={setIdType}
              placeholder="Select your ID"
              disabled={submitting}
              style={styles.select}
              textStyle={styles.selectText}
              caretColor={t.neutral[900]}
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

          <View>
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
            <LockSimpleIcon size={16} color={t.neutral[500]} />
            <Text style={styles.privacyText}>Your ID photos are processed once and discarded. We only keep encrypted verification details.</Text>
          </View>

          <View style={styles.actions}>
            <Btn label={submitting ? 'Verifying...' : 'Verify identity'} kind="primary" onPress={handleSubmit} disabled={verifyOff} busy={submitting} />
            {outOfAttempts ? <Text style={styles.attempts}>Daily attempt limit reached. Try again tomorrow.</Text> : null}
          </View>
        </View>
      ) : null}

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

const styles = themed(() => StyleSheet.create({
  // .sv .idv-verifier: one card in the page's 12px gutter. Its sections are
  // pulled to the screen's edges by the phone rules and clipped by the card,
  // so their padding (16px from the screen) leaves 4px inside the card.
  verifier: { borderRadius: 16, overflow: 'hidden', backgroundColor: t.neutral[0], boxShadow: CARD_SHADOW },

  status: { gap: 16, paddingVertical: 16, paddingHorizontal: 4, backgroundColor: t.neutral[0] },
  statusBand: { borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  statusTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  statusIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  statusBody: { flex: 1, minWidth: 0 },
  statusLabel: { marginBottom: 4, fontSize: 16, lineHeight: 24, color: t.neutral[900], ...font(700) },
  statusText: { fontSize: 14, lineHeight: 21, color: t.neutral[600], ...font(400) },
  statusMeta: { marginTop: 6, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },

  debug: { gap: 8, paddingHorizontal: 4, paddingVertical: 8 },
  debugSummary: { fontSize: 13, lineHeight: 20, color: t.neutral[500], ...font(400) },
  debugPre: { padding: 12, maxHeight: 260, fontSize: 12, lineHeight: 18, backgroundColor: t.neutral[50], color: t.neutral[700] },

  // .idv-card
  card: { gap: 20, paddingVertical: 18, paddingHorizontal: 4, backgroundColor: t.neutral[0] },
  cardHead: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  cardTitle: { fontSize: 18, lineHeight: 22, color: t.neutral[900], ...font(500) },
  attempts: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },

  field: { gap: 8 },
  label: { fontSize: 13, lineHeight: 19.5, color: t.neutral[700], ...font(600) },
  optional: { fontStyle: 'italic', ...font(600) },
  // .idv-input: square, a grey outline.
  select: {
    maxWidth: 420, minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 0,
    borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  selectText: { fontSize: 14, lineHeight: 21, color: t.neutral[900] },

  drop: {
    alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 20,
    borderWidth: 1, borderStyle: 'dashed', borderColor: t.neutral[300], backgroundColor: t.neutral[50],
  },
  dropText: { maxWidth: 440, fontSize: 14, lineHeight: 21, textAlign: 'center', color: t.neutral[500], ...font(400) },
  dropActions: { alignSelf: 'stretch', gap: 10, marginTop: 6 },
  preview: { alignItems: 'flex-start', gap: 10 },
  previewImg: { width: '100%', maxWidth: 420, maxHeight: 280, backgroundColor: t.neutral[100] },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingVertical: 10 },
  ghostText: { fontSize: 14, lineHeight: 17, color: t.neutral[700], ...font(600) },

  btn: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
    paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: 'transparent', borderRadius: 0,
  },
  btnOutline: { backgroundColor: t.neutral[0], borderColor: t.primary[600] },
  btnPrimary: { backgroundColor: t.primary[600] },
  btnText: { fontSize: 14, lineHeight: 17, ...font(600) },
  off: { opacity: 0.55 },

  // .idv-rules: a bulleted list, 18px in.
  rule: { flexDirection: 'row' },
  ruleDot: { width: 18, paddingLeft: 4, fontSize: 13, lineHeight: 22.1, color: t.neutral[600], ...font(400) },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 22.1, color: t.neutral[600], ...font(400) },
  ruleLink: { color: t.primary[600], ...font(500) },

  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },
  actions: { gap: 12 },
}));
