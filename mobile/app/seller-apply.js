import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraIcon, CheckCircleIcon as CheckCircle2, CheckIcon, FileTextIcon, IdentificationCardIcon as IdCard, MoneyIcon, StorefrontIcon as Store, WarningIcon as Warning, XIcon } from 'phosphor-react-native';
import { SvgXml } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import TextField from '../src/components/TextField';
import Select from '../src/components/Select';
import Button from '../src/components/Button';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { toast } from '../src/lib/toast';
import { uploadImage, uploadKycDocument } from '../src/lib/upload';
import { resolveImg } from '../src/lib/media';
import { colors, font, radius, spacing, typography } from '../src/theme';
import { fetchMunicipalities, fetchCategories } from '../src/lib/referenceData';
import { GCASH_LOGO, QRPH_LOGO } from '../src/components/seller/fulfillment/paymentLogos';

const FULFILLMENT_OPTIONS = [{ label: 'Deliver to buyers', value: 'DELIVERY' }, { label: 'Buyers pick up', value: 'PICKUP' }, { label: 'Both', value: 'BOTH' }];
// How buyers pay the shop. GCash and QR Ph need the account buyers pay into.
const PAYOUT_METHODS = [
  { value: 'GCASH', label: 'GCash', logo: GCASH_LOGO, desc: 'Buyers pay to your GCash number', numberLabel: 'GCash number', numberPlaceholder: '0917 123 4567' },
  { value: 'QRPH', label: 'QR Ph', logo: QRPH_LOGO, desc: 'Buyers scan your bank or e-wallet QR', numberLabel: 'Account number', numberPlaceholder: 'Bank or e-wallet account number' },
  { value: 'COD_ONLY', label: 'Cash on delivery', desc: 'Buyers pay in cash when they get the order' },
];
const QR_METHODS = ['GCASH', 'QRPH'];
// How the seller sells. A registered business adds its permit details.
const BUSINESS_TYPES = [
  { value: 'INDIVIDUAL', label: 'Individual seller', desc: 'Selling under your own name' },
  { value: 'REGISTERED', label: 'Registered business', desc: 'DTI / SEC registered' },
];
const MAX_CATEGORIES = 5;

/** The picked methods in card order. */
const orderedMethods = (list) => PAYOUT_METHODS.map((m) => m.value).filter((v) => list.includes(v));
/** The list with a method switched on or off. */
const toggleMethod = (list, method) => (list.includes(method) ? list.filter((v) => v !== method) : orderedMethods([...list, method]));
/** The online method whose account is asked for (GCash first), if any is picked. */
const accountMethodOf = (methods) => PAYOUT_METHODS.find((m) => m.value !== 'COD_ONLY' && methods.includes(m.value));
/** The main method older readers get in payoutMethod: the first online one, else cash. */
const mainMethodOf = (methods) => accountMethodOf(methods)?.value || (methods.includes('COD_ONLY') ? 'COD_ONLY' : '');

export default function SellerApply() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [form, setForm] = useState({ shopName: '', shopDescription: '', shopAddress: user?.address || '', shopMunicipalityId: user?.municipalityId || '', shopCategories: [], shopLogoUrl: '', shopCoverUrl: '', sellerBusinessType: 'INDIVIDUAL', sellerPermitNumber: '', sellerPermitUrl: '', sellerBirTin: '', payoutMethods: ['GCASH'], payoutAccountName: user?.fullName || '', payoutAccountNumber: user?.contactNumber || '', payoutQrUrl: '', payoutQrType: '', fulfillmentPreference: 'DELIVERY' });
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [municipalities, setMunicipalities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [application, setApplication] = useState(null);
  const [uploading, setUploading] = useState(null);
  // The papers are stored privately: the preview is the picked photo itself.
  const [papersPreview, setPapersPreview] = useState(null);

  useEffect(() => {
    fetchMunicipalities().then(setMunicipalities).catch(() => { });
    fetchCategories().then(setCategories).catch(() => { });
    apiClient.get(ENDPOINTS.SELLER.APPLICATION_STATUS).then((r) => setApplication(r.data || null)).catch(() => { });
  }, []);

  const status = application?.status ?? user?.sellerApplicationStatus ?? null;

  // A seller already has a shop: the website sends them to Seller Center home.
  if (user?.role === 'SELLER') return <Redirect href="/seller" />;
  if (status === 'PENDING') {
    return <View style={styles.screen}><ScreenHeader title="Seller Application" /><View style={styles.status}><CheckCircle2 size={52} color={colors.warning} /><Text style={styles.statusTitle}>Application under review</Text><Text style={styles.statusText}>The municipal admin is checking your details. You stay a buyer until it is approved.</Text></View></View>;
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const account = accountMethodOf(form.payoutMethods);
  const registered = form.sellerBusinessType === 'REGISTERED';
  const qrPicked = QR_METHODS.filter((m) => form.payoutMethods.includes(m));
  const qrType = qrPicked.includes(form.payoutQrType) ? form.payoutQrType : qrPicked[0] || '';

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

  // Any photo the phone can open: uploadImage makes it a JPEG the server takes.
  const pickPicture = async (field) => {
    if (uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(field);
    try {
      const res = await uploadImage(result.assets[0]);
      setField(field, res.url);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const pickPapers = async () => {
    if (uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading('sellerPermitUrl');
    try {
      const res = await uploadKycDocument(result.assets[0]);
      setField('sellerPermitUrl', res.fileId);
      setPapersPreview(result.assets[0].uri);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    if (!user?.contactNumber) return toast.error('Add a contact number to your profile first');
    if (!form.shopName.trim() || !form.shopAddress.trim()) return toast.error('Shop name and address are required');
    if (!form.shopMunicipalityId) return toast.error('Select the municipality your shop is in');
    if (form.shopCategories.length === 0) return toast.error('Pick at least one category');
    if (registered && !form.sellerPermitNumber.trim()) return toast.error('Enter your permit or registration number');
    if (form.payoutMethods.length === 0) return toast.error('Pick at least one way buyers pay');
    if (account && (!form.payoutAccountName.trim() || !form.payoutAccountNumber.trim())) return toast.error('Complete your payout details');
    if (!acceptedTerms) return toast.error('Accept the Seller Terms of Service to continue');
    setSubmitting(true);
    try {
      const { payoutQrUrl, payoutQrType, payoutAccountName, payoutAccountNumber, sellerPermitNumber, sellerPermitUrl, sellerBirTin, ...rest } = form;
      const response = await apiClient.post(ENDPOINTS.SELLER.APPLICATION, {
        ...rest,
        payoutMethod: mainMethodOf(form.payoutMethods),
        ...(registered ? { sellerPermitNumber: sellerPermitNumber.trim(), sellerPermitUrl, sellerBirTin: sellerBirTin.trim() } : {}),
        ...(account ? { payoutAccountName: payoutAccountName.trim(), payoutAccountNumber: payoutAccountNumber.trim() } : {}),
        ...(account && qrType && payoutQrUrl ? { payoutQrUrl, payoutQrType: qrType } : {}),
        acceptedTerms: true,
      });
      // The account stays a buyer until an admin approves the application.
      const updated = { ...user, ...response.data, role: response.data?.role || 'BUYER', sellerApplicationStatus: response.data?.sellerApplicationStatus || 'PENDING' };
      await updateUser(updated);
      setApplication((current) => ({ ...(current || {}), status: 'PENDING', rejectionReason: null }));
      toast.success('Application submitted', "We'll notify you once it's reviewed");
    } catch (error) { toast.error('Submission failed', error.message); }
    finally { setSubmitting(false); }
  };

  return <View style={styles.screen}><ScreenHeader title="Start Selling" subtitle="Open your shop" /><ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {status === 'REJECTED' ? <View style={styles.reject}><Warning size={20} color={colors.error} /><View style={styles.noticeText}><Text style={styles.rejectTitle}>Your previous application was not approved</Text>{application?.rejectionReason ? <Text style={styles.noticeBody}>{application.rejectionReason}</Text> : null}<Text style={styles.noticeBody}>Fix that and submit again.</Text></View></View> : null}
    <View style={styles.notice}><Store size={20} color={colors.secondary} /><View style={styles.noticeText}><Text style={styles.noticeTitle}>Your shop goes live once approved</Text><Text style={styles.noticeBody}>The municipality you pick below decides which admin reviews your application.</Text></View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Shop Details</Text><TextField label="Shop name" value={form.shopName} onChangeText={(value) => setField('shopName', value)} autoCapitalize="words" placeholder="Maria's Fresh Farm" maxLength={60} /><TextField label="Shop description" value={form.shopDescription} onChangeText={(value) => setField('shopDescription', value)} autoCapitalize="sentences" placeholder="Tell buyers what makes your shop special" multiline /><Select label="Shop municipality" value={form.shopMunicipalityId} onChange={(value) => setField('shopMunicipalityId', value)} options={municipalities.map((m) => ({ label: m.name, value: m.id }))} placeholder="Select municipality" /><TextField label="Shop address" value={form.shopAddress} onChangeText={(value) => setField('shopAddress', value)} autoCapitalize="words" placeholder="Purok, Barangay" />
      <Text style={styles.fieldLabel}>Shop categories</Text>
      <View style={styles.chips}>{categories.map((category) => {
        const active = form.shopCategories.includes(category.id);
        return <Pressable key={category.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleCategory(category.id)}><Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text></Pressable>;
      })}</View>
      <Text style={styles.fieldHint}>Pick up to {MAX_CATEGORIES} — this is where your products appear.</Text>
      <Text style={[styles.fieldLabel, styles.spaced]}>Shop logo and cover photo</Text>
      <View style={styles.pics}>
        <PicturePick shape="round" label="Logo" value={form.shopLogoUrl} busy={uploading === 'shopLogoUrl'} onPick={() => pickPicture('shopLogoUrl')} onRemove={() => setField('shopLogoUrl', '')} />
        <PicturePick shape="wide" label="Cover photo" value={form.shopCoverUrl} busy={uploading === 'shopCoverUrl'} onPick={() => pickPicture('shopCoverUrl')} onRemove={() => setField('shopCoverUrl', '')} />
      </View>
      <Text style={styles.fieldHint}>Optional · you can add these later in Seller Center.</Text>
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Business Details</Text><Text style={styles.fieldLabel}>How do you sell?</Text>
      <View style={styles.payList} accessibilityRole="radiogroup">{BUSINESS_TYPES.map((type) => {
        const on = form.sellerBusinessType === type.value;
        return <Pressable key={type.value} accessibilityRole="radio" accessibilityLabel={type.label} accessibilityState={{ checked: on }} onPress={() => setField('sellerBusinessType', type.value)} style={({ pressed }) => [styles.payCard, styles.typeCard, on && styles.payCardOn, pressed && !on && styles.payCardPressed]}>
          <View style={styles.payText}><Text style={styles.payCodLabel}>{type.label}</Text><Text style={styles.payDesc}>{type.desc}</Text></View>
          <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
        </Pressable>;
      })}</View>
      {registered ? <View style={styles.spaced}><TextField label="Permit or registration number" value={form.sellerPermitNumber} onChangeText={(value) => setField('sellerPermitNumber', value)} placeholder="DTI, SEC or business permit no." maxLength={60} />
        <Text style={styles.fieldLabel}>Business permit / DTI / SEC papers</Text>
        <View>
          <Pressable accessibilityRole="button" accessibilityLabel={form.sellerPermitUrl ? 'Change business papers' : 'Add business papers'} onPress={pickPapers} disabled={uploading === 'sellerPermitUrl'} style={({ pressed }) => [styles.picBox, styles.papersBox, pressed && styles.picPressed]}>
            {form.sellerPermitUrl && papersPreview ? <Image source={{ uri: papersPreview }} style={styles.picImg} resizeMode="cover" /> : <View style={styles.picEmpty}>{form.sellerPermitUrl ? <FileTextIcon size={22} color={colors.primary} /> : <CameraIcon size={20} color={colors.textMuted} />}<Text style={styles.picEmptyText}>{uploading === 'sellerPermitUrl' ? 'Uploading…' : form.sellerPermitUrl ? 'Papers uploaded · tap to change' : 'Add a photo of your papers'}</Text></View>}
          </Pressable>
          {form.sellerPermitUrl && uploading !== 'sellerPermitUrl' ? <Pressable accessibilityRole="button" accessibilityLabel="Remove business papers" onPress={() => { setField('sellerPermitUrl', ''); setPapersPreview(null); }} hitSlop={8} style={styles.picRemove}><XIcon size={12} color={colors.white} weight="bold" /></Pressable> : null}
        </View>
        <Text style={[styles.fieldHint, styles.papersHint]}>Optional · a clear photo or scan. Only the reviewing admin sees it.</Text>
        <TextField label="BIR TIN (optional)" value={form.sellerBirTin} onChangeText={(value) => setField('sellerBirTin', value)} placeholder="000-000-000-000" maxLength={30} />
      </View> : null}
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Payments &amp; Delivery</Text><Text style={styles.fieldLabel}>Payment methods</Text><PaymentMethods value={form.payoutMethods} onToggle={(method) => setForm((current) => ({ ...current, payoutMethods: toggleMethod(current.payoutMethods, method) }))} /><Text style={[styles.fieldHint, styles.payTip]}>Pick all that apply. You can change these anytime in Seller Center.</Text>
      {account ? <><TextField label="Account name" value={form.payoutAccountName} onChangeText={(value) => setField('payoutAccountName', value)} autoCapitalize="words" placeholder="Name on the account" /><TextField label={account.numberLabel} value={form.payoutAccountNumber} onChangeText={(value) => setField('payoutAccountNumber', value)} keyboardType="phone-pad" placeholder={account.numberPlaceholder} />
        <Text style={styles.fieldLabel}>Upload your QR code</Text>
        <View style={styles.qrRow}>
          <PicturePick shape="square" label="QR code" value={form.payoutQrUrl} busy={uploading === 'payoutQrUrl'} onPick={() => pickPicture('payoutQrUrl')} onRemove={() => setField('payoutQrUrl', '')} />
          <View style={styles.qrText}>
            {qrPicked.length > 1 ? <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="This QR is for">{qrPicked.map((m) => {
              const on = qrType === m;
              return <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipActive]} onPress={() => setField('payoutQrType', m)}><Text style={[styles.chipText, on && styles.chipTextActive]}>{PAYOUT_METHODS.find((p) => p.value === m).label}</Text></Pressable>;
            })}</View> : null}
            <Text style={styles.qrHint}>Optional · your {qrPicked.length > 1 ? 'GCash or QR Ph' : PAYOUT_METHODS.find((p) => p.value === qrType)?.label} QR, so buyers can scan to pay. You can add it later.</Text>
          </View>
        </View>
      </> : null}
      <View style={styles.spaced}><Select label="How buyers get orders" value={form.fulfillmentPreference} onChange={(value) => setField('fulfillmentPreference', value)} options={FULFILLMENT_OPTIONS} placeholder="Select fulfillment" /></View></View>
    {/* The ID check comes later, in the Seller Center (/seller/verification). */}
    <View style={styles.later}><IdCard size={20} color={colors.secondary} /><View style={styles.noticeText}><Text style={styles.noticeTitle}>Verify your identity later</Text><Text style={styles.noticeBody}>After you apply, verify your ID from your Seller Center. It takes a minute and helps the admin approve your shop faster.</Text></View></View>
    <Pressable style={styles.terms} onPress={() => setAcceptedTerms((value) => !value)}><View style={[styles.checkbox, acceptedTerms && styles.checkboxOn]}>{acceptedTerms ? <CheckCircle2 size={16} color={colors.white} weight="fill" /> : null}</View><Text style={styles.termsText}>I confirm the information above is accurate and I agree to Emoorm&apos;s Seller Terms of Service.</Text></Pressable>
    <Button title="Submit Seller Application" onPress={submit} loading={submitting} />
  </ScrollView></View>;
}

// GCash, QR Ph and Cash on delivery as cards on the page: the logo (or a cash
// icon), a line on how buyers pay, and a checkbox. Several can be picked.
function PaymentMethods({ value, onToggle }) {
  return <View style={styles.payList}>{PAYOUT_METHODS.map((m) => {
    const on = value.includes(m.value);
    const toggle = () => onToggle(m.value);
    return <Pressable key={m.value} accessibilityRole="checkbox" accessibilityLabel={m.label} accessibilityState={{ checked: on }} onPress={toggle} style={({ pressed }) => [styles.payCard, on && styles.payCardOn, pressed && !on && styles.payCardPressed]}>
      <View style={styles.payText}>
        {m.logo ? <View style={styles.payLogo}><SvgXml xml={m.logo} height={22} width={94} /></View> : <View style={styles.payCod}><View style={styles.payCodIcon}><MoneyIcon size={16} color={colors.white} weight="fill" /></View><Text style={styles.payCodLabel}>{m.label}</Text></View>}
        <Text style={styles.payDesc}>{m.desc}</Text>
      </View>
      <View style={[styles.check, on && styles.checkOn]}>{on ? <CheckIcon size={13} color={colors.white} weight="bold" /> : null}</View>
    </Pressable>;
  })}</View>;
}

// A picture to upload: the logo (round), cover photo (wide) or payment QR (square).
function PicturePick({ shape, label, value, busy, onPick, onRemove }) {
  const src = value ? resolveImg(value) : null;
  const boxStyle = shape === 'round' ? styles.picRound : shape === 'square' ? styles.picSquare : styles.picWide;
  return <View style={[styles.pic, shape === 'wide' && styles.picWideWrap]}>
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={value ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`} onPress={onPick} disabled={busy} style={({ pressed }) => [styles.picBox, boxStyle, pressed && styles.picPressed]}>
        {src ? <Image source={{ uri: src }} style={styles.picImg} resizeMode={shape === 'square' ? 'contain' : 'cover'} /> : <View style={styles.picEmpty}><CameraIcon size={20} color={colors.textMuted} /><Text style={styles.picEmptyText}>{busy ? 'Uploading…' : 'Add'}</Text></View>}
      </Pressable>
      {src && !busy ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} onPress={onRemove} hitSlop={8} style={[styles.picRemove, shape === 'round' && styles.picRemoveRound]}><XIcon size={12} color={colors.white} weight="bold" /></Pressable> : null}
    </View>
    <Text style={styles.picLabel}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgGreenLight }, reject: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fef2f2' }, rejectTitle: { ...typography.body, color: colors.error }, noticeText: { flex: 1 }, noticeTitle: { ...typography.body, color: colors.secondary }, noticeBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, section: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white }, sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }, fieldLabel: { ...typography.body, color: colors.textPrimary, marginBottom: spacing.sm }, fieldHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }, spaced: { marginTop: spacing.lg }, payTip: { marginTop: 0, marginBottom: spacing.lg }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.gray100 }, chipActive: { backgroundColor: colors.primary }, chipText: { ...typography.caption, color: colors.textSecondary }, chipTextActive: { color: colors.white }, later: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white }, terms: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xs }, checkbox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.gray200 }, checkboxOn: { backgroundColor: colors.primary }, termsText: { ...typography.caption, flex: 1, color: colors.textSecondary, lineHeight: 18 }, payList: { gap: spacing.sm, marginBottom: spacing.sm }, payCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.gray200, backgroundColor: colors.white }, payCardOn: { borderColor: colors.primary, backgroundColor: colors.bgGreenLight }, payCardPressed: { backgroundColor: colors.gray50 }, payText: { flex: 1, gap: 5 }, payLogo: { height: 24, justifyContent: 'center' }, payCod: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 24 }, payCodIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16a34a' }, payCodLabel: { ...typography.body, ...font(700), color: colors.textPrimary }, payDesc: { ...typography.caption, color: colors.textSecondary }, check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' }, checkOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  pics: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, pic: { alignItems: 'center', gap: 6 }, picWideWrap: { flex: 1, alignItems: 'stretch' }, picBox: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 }, picRound: { width: 84, height: 84, borderRadius: 42 }, picSquare: { width: 84, height: 84, borderRadius: radius.lg }, picWide: { height: 84, borderRadius: radius.lg }, picPressed: { backgroundColor: colors.bgGreenLight }, picImg: { width: '100%', height: '100%', backgroundColor: colors.white }, picEmpty: { alignItems: 'center', gap: 4 }, picEmptyText: { ...typography.caption, color: colors.textMuted }, picRemove: { position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,24,39,0.62)' }, picRemoveRound: { top: 0, right: 0 }, picLabel: { ...typography.caption, color: colors.textSecondary },
  typeCard: { minHeight: 60 }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' }, radioOn: { borderColor: colors.primary }, radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary }, papersBox: { height: 120, borderRadius: radius.lg }, papersHint: { marginBottom: spacing.lg },
  qrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, qrText: { flex: 1, gap: spacing.sm }, qrHint: { ...typography.caption, color: colors.textMuted },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, statusTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg }, statusText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 }, statusButton: { alignSelf: 'stretch', marginTop: spacing.xl },
});
