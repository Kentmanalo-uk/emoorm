import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircleIcon as CheckCircle2, IdentificationCardIcon as IdCard, StorefrontIcon as Store, UploadSimpleIcon as Upload, WarningIcon as Warning } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import TextField from '../src/components/TextField';
import Select from '../src/components/Select';
import Button from '../src/components/Button';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { uploadKycDocument } from '../src/lib/upload';
import { toast } from '../src/lib/toast';
import { colors, radius, spacing, typography } from '../src/theme';
import { fetchMunicipalities, fetchCategories } from '../src/lib/referenceData';

const ID_TYPES = ['PhilSys National ID', 'Passport', 'Driver License (LTO)', 'PRC Professional ID', 'SSS / GSIS ID', 'UMID', 'Voter ID', 'Postal ID', 'PhilHealth ID', 'Barangay ID'];
const FULFILLMENT_OPTIONS = [{ label: 'Deliver to buyers', value: 'DELIVERY' }, { label: 'Buyers pick up', value: 'PICKUP' }, { label: 'Both', value: 'BOTH' }];
const PAYOUT_METHODS = [{ label: 'GCash', value: 'GCASH' }, { label: 'Maya', value: 'MAYA' }, { label: 'Bank transfer', value: 'BANK' }, { label: 'Cash on delivery only', value: 'COD_ONLY' }];
const MAX_CATEGORIES = 5;

export default function SellerApply() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [form, setForm] = useState({ shopName: '', shopDescription: '', shopAddress: user?.address || '', shopMunicipalityId: user?.municipalityId || '', shopCategories: [], payoutMethod: 'GCASH', payoutAccountName: user?.fullName || '', payoutAccountNumber: user?.contactNumber || '', fulfillmentPreference: 'DELIVERY', idType: '', idFrontUrl: '', idBackUrl: '' });
  // Local-only preview URIs (device file:// paths) for the ID photos — never sent to the server.
  const [previews, setPreviews] = useState({ idFrontUrl: '', idBackUrl: '' });
  const [uploading, setUploading] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [municipalities, setMunicipalities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [application, setApplication] = useState(null);

  useEffect(() => {
    fetchMunicipalities().then(setMunicipalities).catch(() => { });
    fetchCategories().then(setCategories).catch(() => { });
    apiClient.get(ENDPOINTS.SELLER.APPLICATION_STATUS).then((r) => setApplication(r.data || null)).catch(() => { });
  }, []);

  const status = application?.status ?? user?.sellerApplicationStatus ?? null;
  const identityVerified = application?.identityVerified === true;

  if (user?.role === 'SELLER') {
    return <View style={styles.screen}><ScreenHeader title="Seller Application" /><View style={styles.status}><CheckCircle2 size={52} color={colors.primary} /><Text style={styles.statusTitle}>Seller account enabled</Text><Text style={styles.statusText}>Open Seller Center to manage your store and inventory.</Text><Button title="Open Seller Center" onPress={() => router.replace('/seller')} style={styles.statusButton} /></View></View>;
  }
  if (status === 'PENDING') {
    return <View style={styles.screen}><ScreenHeader title="Seller Application" /><View style={styles.status}><CheckCircle2 size={52} color={colors.warning} /><Text style={styles.statusTitle}>Application under review</Text><Text style={styles.statusText}>The municipal admin is checking your details. You stay a buyer until it is approved.</Text></View></View>;
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleCategory = (id) => {
    setForm((current) => {
      const has = current.shopCategories.includes(id);
      if (!has && current.shopCategories.length >= MAX_CATEGORIES) {
        toast.error(`Pick up to ${MAX_CATEGORIES} categories`);
        return current;
      }
      return { ...current, shopCategories: has ? current.shopCategories.filter((c) => c !== id) : [...current.shopCategories, id] };
    });
  };

  const chooseImage = async (field) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Photo permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    // Too small to read means a rejected application — catch it before uploading.
    if (Math.min(asset.width || 0, asset.height || 0) < 600) {
      return toast.error('Photo is too small', 'Use one at least 600px on its shortest side');
    }
    setUploading(field);
    try {
      const uploaded = await uploadKycDocument(asset);
      setForm((current) => ({ ...current, [field]: uploaded.fileId }));
      setPreviews((current) => ({ ...current, [field]: asset.uri }));
    }
    catch (error) { toast.error('Upload failed', error.message); }
    finally { setUploading(''); }
  };

  const submit = async () => {
    if (!user?.contactNumber) return toast.error('Add a contact number to your profile first');
    if (!form.shopName.trim() || !form.shopAddress.trim()) return toast.error('Shop name and address are required');
    if (!form.shopMunicipalityId) return toast.error('Select the municipality your shop is in');
    if (form.shopCategories.length === 0) return toast.error('Pick at least one category');
    if (form.payoutMethod !== 'COD_ONLY' && (!form.payoutAccountName.trim() || !form.payoutAccountNumber.trim())) return toast.error('Complete your payout details');
    if (!identityVerified && (!form.idType || !form.idFrontUrl || !form.idBackUrl)) return toast.error('Complete all identity verification fields');
    if (!acceptedTerms) return toast.error('Accept the Seller Terms of Service to continue');
    setSubmitting(true);
    try {
      const response = await apiClient.post(ENDPOINTS.SELLER.APPLICATION, { ...form, acceptedTerms: true });
      // The account stays a buyer until an admin approves the application.
      const updated = { ...user, ...response.data, role: response.data?.role || 'BUYER', sellerApplicationStatus: response.data?.sellerApplicationStatus || 'PENDING' };
      await updateUser(updated);
      setApplication((current) => ({ ...(current || {}), status: 'PENDING', rejectionReason: null }));
      toast.success('Application submitted', "We'll notify you once it's reviewed");
    } catch (error) { toast.error('Submission failed', error.message); }
    finally { setSubmitting(false); }
  };

  return <View style={styles.screen}><ScreenHeader title="Start Selling" subtitle="Seller verification" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {status === 'REJECTED' ? <View style={styles.reject}><Warning size={20} color={colors.error} /><View style={styles.noticeText}><Text style={styles.rejectTitle}>Your previous application was not approved</Text>{application?.rejectionReason ? <Text style={styles.noticeBody}>{application.rejectionReason}</Text> : null}<Text style={styles.noticeBody}>Fix that and submit again.</Text></View></View> : null}
    <View style={styles.notice}><Store size={20} color={colors.secondary} /><View style={styles.noticeText}><Text style={styles.noticeTitle}>Your shop goes live once approved</Text><Text style={styles.noticeBody}>The municipality you pick below decides which admin reviews your application.</Text></View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Shop Details</Text><TextField label="Shop name" value={form.shopName} onChangeText={(value) => setField('shopName', value)} autoCapitalize="words" placeholder="Maria's Fresh Farm" maxLength={60} /><TextField label="Shop description" value={form.shopDescription} onChangeText={(value) => setField('shopDescription', value)} autoCapitalize="sentences" placeholder="Tell buyers what makes your shop special" multiline /><Select label="Shop municipality" value={form.shopMunicipalityId} onChange={(value) => setField('shopMunicipalityId', value)} options={municipalities.map((m) => ({ label: m.name, value: m.id }))} placeholder="Select municipality" /><TextField label="Shop address" value={form.shopAddress} onChangeText={(value) => setField('shopAddress', value)} autoCapitalize="words" placeholder="Purok, Barangay" />
      <Text style={styles.fieldLabel}>Shop categories</Text>
      <View style={styles.chips}>{categories.map((category) => {
        const active = form.shopCategories.includes(category.id);
        return <Pressable key={category.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleCategory(category.id)}><Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text></Pressable>;
      })}</View>
      <Text style={styles.fieldHint}>Pick up to {MAX_CATEGORIES} — this is where your products appear.</Text>
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Payments &amp; Delivery</Text><Select label="Payout method" value={form.payoutMethod} onChange={(value) => setField('payoutMethod', value)} options={PAYOUT_METHODS} placeholder="Select payout method" />{form.payoutMethod !== 'COD_ONLY' ? <><TextField label="Account name" value={form.payoutAccountName} onChangeText={(value) => setField('payoutAccountName', value)} autoCapitalize="words" placeholder="Name on the account" /><TextField label="Account number" value={form.payoutAccountNumber} onChangeText={(value) => setField('payoutAccountNumber', value)} keyboardType="phone-pad" placeholder="09171234567" /></> : null}<Select label="How buyers get orders" value={form.fulfillmentPreference} onChange={(value) => setField('fulfillmentPreference', value)} options={FULFILLMENT_OPTIONS} placeholder="Select fulfillment" /></View>
    <View style={styles.section}><View style={styles.sectionHeading}><IdCard size={20} color={colors.secondary} /><Text style={styles.sectionTitleInline}>Identity Verification</Text></View>
      {identityVerified
        ? <View style={styles.verified}><CheckCircle2 size={20} color={colors.primary} /><View style={styles.noticeText}><Text style={styles.noticeTitle}>Identity already verified</Text><Text style={styles.noticeBody}>We checked your ID when you verified your account and kept no copy of the photo.</Text></View></View>
        : <><Select label="Government ID type" value={form.idType} onChange={(value) => setField('idType', value)} options={ID_TYPES.map((value) => ({ label: value, value }))} placeholder="Select ID type" /><UploadTile label="Front of ID" value={form.idFrontUrl} previewUri={previews.idFrontUrl} loading={uploading === 'idFrontUrl'} onPress={() => chooseImage('idFrontUrl')} /><UploadTile label="Back of ID" value={form.idBackUrl} previewUri={previews.idBackUrl} loading={uploading === 'idBackUrl'} onPress={() => chooseImage('idBackUrl')} /></>}
    </View>
    <Pressable style={styles.terms} onPress={() => setAcceptedTerms((value) => !value)}><View style={[styles.checkbox, acceptedTerms && styles.checkboxOn]}>{acceptedTerms ? <CheckCircle2 size={16} color={colors.white} weight="fill" /> : null}</View><Text style={styles.termsText}>I confirm the information above is accurate and I agree to Emoorm&apos;s Seller Terms of Service.</Text></Pressable>
    <Button title="Submit Seller Application" onPress={submit} loading={submitting} />
  </ScrollView></View>;
}

function UploadTile({ label, value, previewUri, loading, onPress }) {
  return <Pressable style={styles.uploadTile} onPress={onPress}>{value && previewUri ? <Image source={{ uri: previewUri }} style={styles.uploadPreview} /> : <View style={styles.uploadPlaceholder}>{loading ? <ActivityIndicator color={colors.primary} /> : <Upload size={22} color={colors.secondary} />}</View>}<View style={styles.uploadText}><Text style={styles.uploadLabel}>{label}</Text><Text style={styles.uploadHint}>{value ? 'Tap to replace' : 'JPEG, PNG, or WebP'}</Text></View>{value ? <CheckCircle2 size={19} color={colors.primary} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgGreenLight }, reject: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fef2f2' }, rejectTitle: { ...typography.body, color: colors.error }, noticeText: { flex: 1 }, noticeTitle: { ...typography.body, color: colors.secondary }, noticeBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, section: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white }, sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }, sectionTitleInline: { ...typography.h3, color: colors.textPrimary }, fieldLabel: { ...typography.body, color: colors.textPrimary, marginBottom: spacing.sm }, fieldHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.gray100 }, chipActive: { backgroundColor: colors.primary }, chipText: { ...typography.caption, color: colors.textSecondary }, chipTextActive: { color: colors.white }, verified: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgGreenLight }, terms: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xs }, checkbox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.gray200 }, checkboxOn: { backgroundColor: colors.primary }, termsText: { ...typography.caption, flex: 1, color: colors.textSecondary, lineHeight: 18 }, uploadTile: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.gray50 }, uploadPlaceholder: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.bgGreenLight }, uploadPreview: { width: 54, height: 54, borderRadius: radius.base }, uploadText: { flex: 1 }, uploadLabel: { ...typography.body, color: colors.textPrimary }, uploadHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 }, status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, statusTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg }, statusText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 }, statusButton: { alignSelf: 'stretch', marginTop: spacing.xl },
});
