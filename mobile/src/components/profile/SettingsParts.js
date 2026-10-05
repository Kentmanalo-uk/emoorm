import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TextInput, View, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  CameraIcon, ChatCircleTextIcon, DownloadSimpleIcon, SealCheckIcon, TrashIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import apiClient from '../../api/client';
import ScreenHeader from '../ScreenHeader';
import LoadingSkeleton from '../LoadingSkeleton';
import { resolveImg } from '../../lib/media';
import { uploadImage } from '../../lib/upload';
import { toast } from '../../lib/toast';
import { fetchMunicipalities } from '../../lib/referenceData';
import { invalidateCachedData } from '../../lib/dataCache';
import useAuthStore from '../../store/authStore';
import { font, t } from '../../theme';
import {
  PasswordField, PsButton, PsCard, PsField, PsInput, SaveBar,
} from './ProfileUI';
import ProfileAddressPicker from './ProfileAddressPicker';
import {
  adoptTokens, cleanUsername, contactProblem, errorText, fetchIdentityStatus, fullNameProblem, passwordProblem, usernameProblem,
} from './profileLib';

/*
 * Settings on phones, one part per page (web/src/pages/ProfileSettingsPhone.jsx):
 * the part's fields in one card, Cancel and Save changes pinned at the bottom.
 */
export const PARTS = {
  profile: 'Name & photo',
  contact: 'Contact number',
  address: 'Home address',
  password: 'Change password',
  data: 'Your data',
};

/** Back to where the part was opened from (the list, the Profile card…). */
const useLeave = () => {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/settings'));
};

/** The account as saved now: a part's page waits for it, so its fields start from it. */
export const useFreshAccount = () => {
  const updateUser = useAuthStore((s) => s.updateUser);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    let live = true;
    apiClient.get('/auth/profile')
      .then((res) => { if (live && res.data) updateUser({ ...useAuthStore.getState().user, ...res.data }); })
      .catch(() => {})
      .finally(() => { if (live) setFresh(true); });
    return () => { live = false; };
  }, [updateUser]);
  return fresh;
};

function PartFrame({ title, children, bar }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} backTo="/settings" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, bar && { paddingBottom: 96 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {bar}
      </KeyboardAvoidingView>
    </View>
  );
}

/** A part's page: its fields in one card, Cancel and Save changes at the bottom. */
function PartPage({ title, children, onSave, saving, canSave }) {
  const leave = useLeave();
  return (
    <PartFrame title={title} bar={<SaveBar onCancel={leave} onSave={() => onSave(leave)} saving={saving} canSave={canSave} />}>
      <PsCard>{children}</PsCard>
    </PartFrame>
  );
}

/** While the saved account is read. */
export function PartLoading({ part }) {
  return (
    <PartFrame title={PARTS[part]}>
      <PsCard style={{ gap: 10 }}>
        <LoadingSkeleton height={14} />
        <LoadingSkeleton height={14} />
        <LoadingSkeleton height={14} width="60%" />
      </PsCard>
    </PartFrame>
  );
}

/** Saves some of the account's fields; the account in the app follows. */
const useProfileSave = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [saving, setSaving] = useState(false);
  const save = async (payload, done, message = 'Saved') => {
    setSaving(true);
    try {
      const res = await apiClient.put('/auth/profile', payload);
      await updateUser({ ...useAuthStore.getState().user, ...(res.data ?? {}) });
      invalidateCachedData('profile:');
      toast.success(message);
      done();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };
  return { user, saving, save };
};

export function ProfilePart() {
  const { user, saving, save } = useProfileSave();
  const original = { fullName: user?.fullName || '', username: user?.username || '', profilePhoto: user?.profilePhoto || '' };
  const [form, setForm] = useState(original);
  const [uploading, setUploading] = useState(false);
  const [verified, setVerified] = useState(false);

  // A new name undoes the ID check: say so before it is saved.
  useEffect(() => {
    let live = true;
    fetchIdentityStatus().then((res) => { if (live) setVerified(res?.status === 'VERIFIED'); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const nameChanged = form.fullName.trim() !== original.fullName.trim();
  const dirty = nameChanged || form.username !== original.username || form.profilePhoto !== original.profilePhoto;

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { toast.error('Photo must be under 5 MB'); return; }
    if (asset.mimeType && !/^image\/(jpe?g|png|webp)$/i.test(asset.mimeType)) { toast.error('Only JPEG, PNG, or WebP images allowed'); return; }
    setUploading(true);
    try {
      const uploaded = await uploadImage(asset);
      setForm((f) => ({ ...f, profilePhoto: uploaded.url }));
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onSave = (done) => {
    const problem = fullNameProblem(form.fullName) || usernameProblem(form.username);
    if (problem) { toast.error(problem); return; }
    const payload = { fullName: form.fullName.trim(), profilePhoto: form.profilePhoto || null };
    if (form.username !== original.username) payload.username = form.username.trim();
    save(payload, done, 'Profile updated');
  };

  const photo = resolveImg(form.profilePhoto);
  const initial = (form.fullName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <PartPage title={PARTS.profile} onSave={onSave} saving={saving} canSave={dirty && !uploading}>
      <View style={styles.photoRow}>
        <View style={styles.photo}>
          {photo ? <Image source={{ uri: photo }} style={styles.photoImg} /> : <View style={styles.photoFallback}><Text style={styles.photoInitial}>{initial}</Text></View>}
          {uploading ? <View style={styles.photoBusy}><ActivityIndicator color={t.neutral[700]} /></View> : null}
        </View>
        <View style={styles.photoActions}>
          <View style={styles.photoBtns}>
            <PsButton label={form.profilePhoto ? 'Change photo' : 'Upload photo'} Icon={CameraIcon} onPress={pickPhoto} disabled={uploading} style={{ flex: 1 }} />
            {form.profilePhoto ? (
              <PsButton label="Remove" variant="ghost" onPress={() => setForm((f) => ({ ...f, profilePhoto: '' }))} disabled={uploading} style={{ flex: 1 }} />
            ) : null}
          </View>
          <Text style={styles.photoHint}>JPG, PNG, or WebP. Max 5 MB.</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <PsField
          label="Full name"
          warn={verified && nameChanged}
          help={verified && nameChanged
            ? 'Your ID check was made with your current name. Saving a new name means verifying again.'
            : 'Use the name on your government ID.'}
        >
          <PsInput value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} placeholder="Juan Dela Cruz" maxLength={80} autoComplete="name" />
        </PsField>
        <PsField label="Username" help="3–20 characters: letters, numbers, dot or underscore">
          <PsInput
            prefix="@"
            value={form.username}
            onChangeText={(v) => setForm((f) => ({ ...f, username: cleanUsername(v) }))}
            placeholder="juandelacruz"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </PsField>
      </View>
    </PartPage>
  );
}

export function ContactPart() {
  const { user, saving, save } = useProfileSave();
  const original = user?.contactNumber || '';
  const [value, setValue] = useState(original);

  const onSave = (done) => {
    const problem = contactProblem(value.trim());
    if (problem) { toast.error(problem); return; }
    save({ contactNumber: value.trim() || null }, done, 'Contact number saved');
  };

  return (
    <PartPage title={PARTS.contact} onSave={onSave} saving={saving} canSave={value.trim() !== original.trim()}>
      <PsField label="Mobile number" help="11 digits starting with 09. Sellers and riders use it to reach you about your orders.">
        <PsInput value={value} onChangeText={setValue} placeholder="09171234567" keyboardType="number-pad" autoComplete="tel" maxLength={13} />
      </PsField>
      <PhoneVerify />
    </PartPage>
  );
}

export function AddressPart() {
  const { user, saving, save } = useProfileSave();
  const [municipalities, setMunicipalities] = useState([]);
  const [muniLoading, setMuniLoading] = useState(true);
  const [address, setAddress] = useState(() => ({
    province: 'Oriental Mindoro',
    provinceCode: '',
    municipalityId: user?.municipalityId || '',
    municipalityName: user?.municipality?.name || '',
    municipalityCode: '',
    barangay: user?.barangay || '',
    barangayCode: '',
    street: user?.address || '',
  }));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchMunicipalities().then(setMunicipalities).catch(() => {}).finally(() => setMuniLoading(false));
  }, []);

  const saved = [user?.municipalityId || '', (user?.barangay || '').trim(), (user?.address || '').trim()];
  const now = [address.municipalityId || '', address.barangay.trim(), address.street.trim()];
  const dirty = now.some((v, i) => v !== saved[i]);

  const onSave = (done) => {
    if (!address.barangay.trim()) { setErrors({ barangay: 'Choose your barangay.' }); return; }
    // The town stays (support changes it): the barangay and street are saved.
    save({ province: 'Oriental Mindoro', barangay: address.barangay.trim(), address: address.street.trim() }, done, 'Home address saved');
  };

  return (
    <PartPage title={PARTS.address} onSave={onSave} saving={saving} canSave={dirty}>
      <ProfileAddressPicker
        value={address}
        onChange={(next) => { setAddress((prev) => ({ ...prev, ...next })); setErrors({}); }}
        dbMunicipalities={municipalities}
        dbLoading={muniLoading}
        errors={errors}
        lockTown
        townHint="Contact support to change your municipality."
      />
      <Text style={styles.note}>
        Orders go to your delivery addresses. Your Home delivery address, if it was saved from this one, is updated too.
      </Text>
    </PartPage>
  );
}

export function PasswordPart() {
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const onSave = async (done) => {
    const problem = passwordProblem(pw);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      const res = await apiClient.post('/auth/change-password', pw);
      // The change signs out every device, this one included: keep this one signed in.
      if (res?.data?.accessToken) await adoptTokens(res.data.accessToken, res.data.refreshToken);
      toast.success('Password changed. Other devices have been signed out.');
      done();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PartPage title={PARTS.password} onSave={onSave} saving={saving} canSave={Boolean(pw.currentPassword && pw.newPassword && pw.confirmPassword)}>
      <View style={styles.grid}>
        <PasswordField label="Current password" value={pw.currentPassword} onChange={(v) => setPw((p) => ({ ...p, currentPassword: v }))} />
        <PasswordField
          label="New password"
          value={pw.newPassword}
          onChange={(v) => setPw((p) => ({ ...p, newPassword: v }))}
          help="Min 8 chars, with upper, lower, number & special character."
        />
        <PasswordField label="Confirm new password" value={pw.confirmPassword} onChange={(v) => setPw((p) => ({ ...p, confirmPassword: v }))} />
      </View>
    </PartPage>
  );
}

/** Download a copy of the account, or delete it: no Save bar, each acts at once. */
export function DataPart() {
  return (
    <PartFrame title={PARTS.data}>
      <PsCard><AccountData /></PsCard>
    </PartFrame>
  );
}

/**
 * "Your data" (web components/account/AccountData.jsx): download a copy of the
 * account, or delete it. Deleting closes it at once and erases it 30 days later;
 * the server says first whether anything has to finish, and whether the password
 * or the email confirms it.
 */
function AccountData() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState(null);
  const [proof, setProof] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setDownloading(true);
    try {
      const data = await apiClient.get('/account/export');
      const json = JSON.stringify(data, null, 2);
      const fileName = `emoorm-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const blob = new globalThis.Blob([json], { type: 'application/json' });
        const url = globalThis.URL.createObjectURL(blob);
        const a = globalThis.document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        globalThis.URL.revokeObjectURL(url);
      } else {
        await Share.share({ title: fileName, message: json });
      }
      toast.success('Your data was downloaded');
    } catch {
      toast.error('Could not download your data. Try again in a while.');
    } finally {
      setDownloading(false);
    }
  };

  const startDelete = async () => {
    setOpen(true);
    setError('');
    setCheck(null);
    try {
      const res = await apiClient.get('/account/deletion');
      setCheck(res.data);
    } catch (err) {
      setError(err.message || 'Could not check your account. Try again.');
    }
  };

  const confirmDelete = async () => {
    if (!check || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/account/delete', check.confirmWith === 'email' ? { email: proof } : { password: proof });
      await logout();
      toast.success('Your account was deleted. We sent the details to your email.');
      router.replace('/');
    } catch (err) {
      setError(err.message || 'Could not delete your account. Try again.');
      setBusy(false);
    }
  };

  const blocked = Boolean(check && (!check.allowed || check.blockers?.length));

  return (
    <View>
      <View style={styles.adRow}>
        <View>
          <Text style={styles.adTitle}>Download your data</Text>
          <Text style={styles.adDesc}>A copy of your profile, addresses, orders, messages and reviews, as one file.</Text>
        </View>
        <PsButton label={downloading ? 'Preparing…' : 'Download'} Icon={DownloadSimpleIcon} busy={downloading} onPress={download} />
      </View>
      <View style={[styles.adRow, styles.adLine]}>
        <View>
          <Text style={styles.adTitle}>Delete account</Text>
          <Text style={styles.adDesc}>You are signed out everywhere at once. After 30 days your account is erased for good.</Text>
        </View>
        {!open ? <PsButton label="Delete" Icon={TrashIcon} variant="danger" onPress={startDelete} textStyle={{ color: t.danger[700] }} /> : null}
      </View>

      {open ? (
        <View style={styles.adForm}>
          {!check && !error ? (
            <View style={styles.adChecking}><ActivityIndicator size="small" color={t.neutral[500]} /><Text style={styles.adDesc}>Checking your account…</Text></View>
          ) : null}
          {check && !check.allowed ? (
            <View style={styles.adNote}>
              <WarningCircleIcon size={16} weight="fill" color={t.warning[800]} style={{ marginTop: 2 }} />
              <Text style={styles.adNoteText}>Admin accounts cannot be deleted here. Ask the super admin to remove your access first.</Text>
            </View>
          ) : null}
          {check?.allowed && check.blockers?.length > 0 ? (
            <View style={styles.adNote}>
              <WarningCircleIcon size={16} weight="fill" color={t.warning[800]} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.adNoteText, font(500)]}>Finish these first:</Text>
                {check.blockers.map((b) => <Text key={b} style={styles.adNoteText}>{'•  '}{b}</Text>)}
              </View>
            </View>
          ) : null}
          {check && !blocked ? (
            <>
              <View>
                {[
                  'Your orders, messages, reviews and addresses are erased.',
                  'Orders you finished at other shops stay in their records, without your name, address or number.',
                  'Changed your mind? Contact us within 30 days.',
                ].map((line) => <Text key={line} style={styles.adList}>{'•  '}{line}</Text>)}
              </View>
              {check.confirmWith === 'email' ? (
                <PsField label="Type your email to confirm">
                  <PsInput value={proof} onChangeText={setProof} autoCapitalize="none" keyboardType="email-address" autoComplete="off" />
                </PsField>
              ) : (
                <PasswordField label="Enter your password to confirm" value={proof} onChange={setProof} />
              )}
            </>
          ) : null}
          {error ? <Text style={styles.adError} accessibilityRole="alert">{error}</Text> : null}
          <View style={styles.adActions}>
            <PsButton label="Cancel" variant="ghost" onPress={() => { setOpen(false); setProof(''); }} disabled={busy} style={{ flex: 1 }} />
            {check && !blocked ? (
              <PsButton label={busy ? 'Deleting…' : 'Delete my account'} variant="solidDanger" busy={busy} disabled={!proof.trim()} onPress={confirmDelete} style={{ flex: 1 }} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Prove the mobile number with a code by SMS (web components/account/PhoneVerify).
 * Hidden until SMS is set up on the server.
 */
function PhoneVerify() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState(user?.contactNumber || '');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    apiClient.get('/auth/phone/config').then((res) => { if (live) setEnabled(Boolean(res.data?.enabled)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!enabled) return null;

  const verified = user?.phoneVerifiedAt && user.phoneVerifiedNumber === user.contactNumber;
  if (verified && !sentTo) {
    return (
      <View style={[styles.pvLine, { marginTop: 6 }]}>
        <SealCheckIcon size={16} weight="fill" color={t.primary[700]} />
        <Text style={[styles.pvText, { color: t.primary[700] }]}>{user.phoneVerifiedNumber} is verified</Text>
      </View>
    );
  }

  const send = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/auth/phone/send', { number });
      setSentTo(res.data.sentTo);
      toast.success(`Code sent to ${res.data.sentTo}`);
    } catch (err) {
      toast.error(err.message || 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/auth/phone/verify', { code });
      await updateUser({ ...useAuthStore.getState().user, ...res.data });
      setSentTo('');
      setCode('');
      toast.success('Your number is verified');
    } catch (err) {
      toast.error(err.message || 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  };

  const okNumber = /^09\d{9}$/.test(number.replace(/[\s-]/g, ''));
  return (
    <View style={styles.pv}>
      <View style={styles.pvLine}>
        <ChatCircleTextIcon size={16} color={t.neutral[600]} />
        <Text style={styles.pvText}>Verify your mobile number by SMS. Shops trust cash-on-delivery orders from verified numbers.</Text>
      </View>
      {!sentTo ? (
        <View style={styles.pvRow}>
          <TextInput style={styles.pvInput} value={number} keyboardType="phone-pad" maxLength={13} placeholder="09171234567" onChangeText={setNumber} accessibilityLabel="Mobile number to verify" />
          <Pressable accessibilityRole="button" onPress={send} disabled={busy || !okNumber} style={[styles.pvBtn, (busy || !okNumber) && { opacity: 0.5 }]}>
            <Text style={styles.pvBtnText}>Send code</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pvRow}>
          <TextInput style={styles.pvInput} value={code} keyboardType="number-pad" maxLength={6} placeholder="6-digit code" onChangeText={(v) => setCode(v.replace(/\D/g, ''))} accessibilityLabel="Code from the SMS" autoComplete="one-time-code" />
          <Pressable accessibilityRole="button" onPress={verify} disabled={busy || code.length !== 6} style={[styles.pvBtn, (busy || code.length !== 6) && { opacity: 0.5 }]}>
            <Text style={styles.pvBtnText}>Verify</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSentTo('')} disabled={busy} style={[styles.pvBtn, { backgroundColor: 'transparent' }]}>
            <Text style={[styles.pvBtnText, { color: t.neutral[600] }]}>Change number</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { paddingHorizontal: 12, paddingTop: 24, paddingBottom: 24 },
  grid: { gap: 14 },
  note: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: {
    width: 64, height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 2, borderColor: '#fff',
    backgroundColor: t.neutral[100], boxShadow: `0px 0px 0px 1px ${t.neutral[200]}`,
  },
  photoImg: { width: '100%', height: '100%' },
  photoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  photoInitial: { fontSize: 24, lineHeight: 38.4, color: t.neutral[500], ...font(500) },
  photoBusy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.75)' },
  photoActions: { flex: 1, minWidth: 0, gap: 6 },
  photoBtns: { flexDirection: 'row', gap: 6 },
  photoHint: { marginTop: 2, fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },

  adRow: { gap: 12, paddingVertical: 14 },
  adLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  adTitle: { marginBottom: 3, fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  adDesc: { fontSize: 13, lineHeight: 18.85, color: t.neutral[500], ...font(400) },
  adChecking: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adForm: { gap: 14, marginTop: 4, padding: 16, borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[50] },
  adList: { fontSize: 13, lineHeight: 20.15, color: t.neutral[700], ...font(400) },
  adNote: { flexDirection: 'row', gap: 8 },
  adNoteText: { flexShrink: 1, fontSize: 13, lineHeight: 19.5, color: t.warning[800], ...font(400) },
  adError: { fontSize: 13, lineHeight: 19.5, color: t.danger[700], ...font(400) },
  adActions: { flexDirection: 'row', gap: 8 },

  pv: { gap: 8, marginTop: 8 },
  pvLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  pvText: { flex: 1, fontSize: 13, lineHeight: 18.85, color: t.neutral[600], ...font(400) },
  pvRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pvInput: {
    flex: 1, minWidth: 140, height: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    fontSize: 14, color: t.neutral[900], ...font(400),
  },
  pvBtn: { height: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: t.primary[600] },
  pvBtnText: { fontSize: 14, color: '#fff', ...font(500) },
});
