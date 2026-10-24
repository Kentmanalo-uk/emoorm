import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowRightIcon, BriefcaseIcon, BuildingsIcon, CheckCircleIcon, CheckIcon, IdentificationCardIcon,
  MapPinIcon, SparkleIcon, StorefrontIcon, UserIcon, WalletIcon, WarningIcon,
} from 'phosphor-react-native';
import { Redirect, useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import { SheetButton, SheetFrame } from '../src/components/Sheet';
import ProfileAddressPicker from '../src/components/profile/ProfileAddressPicker';
import {
  ApplyInput, ApplyNote, BRAND, BRAND_SOFT, Chip, Chips, ContactNumberField, Field, Form, InfoBox, InfoRow,
  NoteLine, OptionCards, PAYOUT_METHODS, PapersField, PaymentMethods, PictureField, QR_METHODS, Section, SectionHead,
} from '../src/components/seller/apply/ApplyParts';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';
import { fetchCategories, fetchMunicipalities } from '../src/lib/referenceData';

/*
 * /seller/apply (web/src/pages/SellerApply.jsx + SellerApply.css, phones):
 * a guided form in five numbered steps (About you, Your shop, Where your
 * shop is, Selling as, How buyers pay), two notes on what comes later, then
 * the live preview with the terms and "Open my shop". Only the basics: the
 * shop's description, logo and cover and how buyers get orders are asked in
 * the guided setup right after (/seller/welcome). The form is saved as a
 * draft on the server as it changes (the same draft the website keeps), and
 * applying makes the account a seller straight away, so it goes on to the
 * guided setup.
 */

const MAX_CATEGORIES = 5;
const DRAFT_PATH = `${ENDPOINTS.SELLER.APPLICATION_STATUS}/draft`;

// What applying sends besides the payment: the shop and where it is.
const APPLY_FIELDS = [
  'shopName', 'shopCategories', 'shopAddress', 'municipalityId', 'province',
  'shopTagline', 'shopDescription', 'shopLogoUrl', 'shopCoverUrl', 'fulfillmentPreference',
];

// How the seller sells. A registered business adds its permit details.
const BUSINESS_TYPES = [
  { value: 'INDIVIDUAL', label: 'Individual seller', desc: 'Selling under your own name', Icon: UserIcon },
  { value: 'REGISTERED', label: 'Registered business', desc: 'DTI / SEC registered', Icon: BuildingsIcon },
];

/** The picked methods in card order, known ones only. */
const orderedMethods = (list) => PAYOUT_METHODS.map((m) => m.value).filter((v) => list.includes(v));
/** The list with a method switched on or off. */
const toggleMethod = (list, method) => (list.includes(method) ? list.filter((v) => v !== method) : orderedMethods([...list, method]));
/** The online method whose account is asked for (GCash first), if any is picked. */
const accountMethodOf = (methods) => PAYOUT_METHODS.find((m) => m.value !== 'COD_ONLY' && methods?.includes(m.value));
/** The main method older readers get in payoutMethod: the first online one, else cash. */
const mainMethodOf = (methods) => accountMethodOf(methods)?.value || (methods.includes('COD_ONLY') ? 'COD_ONLY' : '');
/** Which kind of QR the uploaded code is: the one picked, or the only QR method chosen. */
const qrTypeOf = (form) => {
  const picked = QR_METHODS.filter((m) => form.payoutMethods.includes(m));
  return picked.includes(form.payoutQrType) ? form.payoutQrType : picked[0] || '';
};
/** A saved draft's methods: the list, or the single method an older draft holds. */
const draftMethods = (draft, fallback) => {
  const list = Array.isArray(draft.payoutMethods) ? draft.payoutMethods : (draft.payoutMethod ? [draft.payoutMethod] : []);
  // An older draft may hold Maya or Bank, which are no longer offered.
  const known = orderedMethods(list);
  return known.length ? known : fallback;
};

const EMPTY_FORM = {
  shopName: '',
  shopTagline: '',
  shopDescription: '',
  shopLogoUrl: '',
  shopCoverUrl: '',
  shopCategories: [],
  shopAddress: '',
  // Structured address parts (composed into shopAddress on change)
  province: 'Oriental Mindoro',
  provinceCode: '',
  municipalityId: '',
  municipalityName: '',
  municipalityCode: '',
  barangay: '',
  barangayCode: '',
  street: '',
  sellerBusinessType: 'INDIVIDUAL',
  sellerPermitNumber: '',
  sellerPermitUrl: '',
  sellerBirTin: '',
  payoutMethods: ['GCASH'],
  payoutAccountName: '',
  payoutAccountNumber: '',
  payoutQrUrl: '',
  payoutQrType: '',
  fulfillmentPreference: 'DELIVERY',
};

/** Same rules the server enforces, so problems surface as you type. */
const fieldError = (key, value, current) => {
  switch (key) {
    case 'shopName': {
      const name = (value || '').trim();
      if (!name) return 'Shop name is required';
      if (name.length < 3) return 'Use at least 3 characters';
      if (name.length > 60) return 'Use 60 characters or fewer';
      return '';
    }
    case 'shopTagline':
      return (value || '').length > 80 ? 'Use 80 characters or fewer' : '';
    case 'shopDescription':
      return (value || '').length > 1000 ? 'Use 1000 characters or fewer' : '';
    case 'shopAddress':
      return (value || '').trim() ? '' : 'Complete your shop address';
    case 'municipalityId':
      return value ? '' : 'Select the municipality your shop is in';
    case 'shopCategories':
      return value?.length ? '' : 'Pick at least one category';
    case 'payoutMethods':
      return value?.length ? '' : 'Pick at least one way buyers pay';
    case 'payoutAccountName':
      return accountMethodOf(current?.payoutMethods) && !(value || '').trim() ? 'Account name is required' : '';
    case 'payoutAccountNumber': {
      const account = accountMethodOf(current?.payoutMethods);
      return account && !(value || '').trim() ? `${account.numberLabel} is required` : '';
    }
    case 'sellerPermitNumber':
      if (current?.sellerBusinessType !== 'REGISTERED') return '';
      if (!(value || '').trim()) return 'Permit or registration number is required';
      return value.trim().length > 60 ? 'Use 60 characters or fewer' : '';
    case 'sellerBirTin':
      return current?.sellerBusinessType === 'REGISTERED' && (value || '').trim().length > 30 ? 'Use 30 characters or fewer' : '';
    default:
      return '';
  }
};

const VALIDATED = ['shopName', 'shopDescription', 'shopAddress', 'municipalityId', 'shopCategories', 'sellerPermitNumber', 'sellerBirTin', 'payoutMethods', 'payoutAccountName', 'payoutAccountNumber'];
// The step each checked field is in, so a failed submit can scroll to the first one.
const STEP_OF = {
  shopName: 2, shopCategories: 2, shopAddress: 3, municipalityId: 3, sellerPermitNumber: 4, sellerBirTin: 4,
  payoutMethods: 5, payoutAccountName: 5, payoutAccountNumber: 5,
};

export default function SellerApply() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once this page's application goes through: the account is a seller
  // from then on, and goes to the guided setup rather than the Seller Center.
  const [applied, setApplied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // The municipality is deliberately NOT pre-filled from the profile: the
  // picker would show nothing while the form quietly carried the account's own
  // municipality, and that is the one field that decides who reviews the shop.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    province: user?.province || 'Oriental Mindoro',
    barangay: user?.barangay || '',
    street: user?.address || '',
    payoutAccountName: user?.fullName || '',
    payoutAccountNumber: user?.contactNumber || '',
  }));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || '');
  const [errors, setErrors] = useState({});

  // Server-held application state: status, rejection reason, saved draft.
  const [application, setApplication] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [municipalities, setMunicipalities] = useState([]);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  const scrollRef = useRef(null);
  const sectionY = useRef({});

  useEffect(() => {
    let cancelled = false;
    fetchMunicipalities()
      .then((list) => { if (!cancelled) setMunicipalities(list || []); })
      .catch(() => { })
      .finally(() => { if (!cancelled) setMunicipalitiesLoading(false); });
    fetchCategories().then((list) => { if (!cancelled) setCategories(list || []); }).catch(() => { });
    apiClient.get(ENDPOINTS.SELLER.APPLICATION_STATUS)
      .then((r) => {
        if (cancelled) return;
        setApplication(r.data || null);
        const draft = r.data?.draft;
        if (draft) {
          setForm((prev) => ({
            ...prev,
            ...draft,
            shopCategories: Array.isArray(draft.shopCategories) ? draft.shopCategories : prev.shopCategories,
            payoutMethods: draftMethods(draft, prev.payoutMethods),
            payoutMethod: undefined,
            fulfillmentPreference: draft.fulfillmentPreference || prev.fulfillmentPreference,
          }));
        }
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoadingApplication(false); });
    return () => { cancelled = true; };
  }, []);

  const status = application?.status ?? user?.sellerApplicationStatus ?? null;
  const isSeller = user?.role === 'SELLER';

  // ── Draft autosave ──────────────────────────────────────────────────
  const savedDraftRef = useRef('');
  useEffect(() => {
    if (loadingApplication || status === 'PENDING' || isSeller || applied) return undefined;
    const payload = {};
    for (const [key, value] of Object.entries(form)) {
      if (Array.isArray(value) ? value.length : value) payload[key] = value;
    }
    const serialized = JSON.stringify(payload);
    if (serialized === savedDraftRef.current || serialized === '{}') return undefined;
    const timer = setTimeout(() => {
      savedDraftRef.current = serialized;
      apiClient.put(DRAFT_PATH, { draft: payload }).catch(() => { });
    }, 1500);
    return () => clearTimeout(timer);
  }, [form, loadingApplication, status, isSeller, applied]);

  const set = useCallback((key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => (p[key] ? { ...p, [key]: '' } : p));
  }, []);

  const toggleCategory = (id) => {
    setForm((p) => {
      const has = p.shopCategories.includes(id);
      if (!has && p.shopCategories.length >= MAX_CATEGORIES) {
        toast.error(`Pick up to ${MAX_CATEGORIES} categories`);
        return p;
      }
      return { ...p, shopCategories: has ? p.shopCategories.filter((c) => c !== id) : [...p.shopCategories, id] };
    });
    setErrors((p) => (p.shopCategories ? { ...p, shopCategories: '' } : p));
  };

  const touch = (key) => {
    const message = fieldError(key, form[key], form);
    setErrors((p) => ({ ...p, [key]: message }));
  };

  const account = accountMethodOf(form.payoutMethods);
  const registered = form.sellerBusinessType === 'REGISTERED';
  const qrType = qrTypeOf(form);
  const bothQr = QR_METHODS.every((m) => form.payoutMethods.includes(m));
  // Just a count for the preview ("3 items left"): the fields themselves say
  // what is wrong once the seller tries to submit.
  const itemsLeft = useMemo(() => [
    !contactNumber,
    !form.shopName.trim(),
    !form.shopCategories.length,
    !form.shopAddress.trim() || !form.municipalityId,
    registered && !form.sellerPermitNumber.trim(),
    !form.payoutMethods.length,
    account && (!form.payoutAccountName.trim() || !form.payoutAccountNumber.trim()),
    !acceptedTerms,
  ].filter(Boolean).length, [form, contactNumber, acceptedTerms, account, registered]);

  const scrollToStep = (step) => {
    const y = sectionY.current[step];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const submit = async () => {
    setConfirming(false);
    setIsSubmitting(true);
    try {
      // Only what this form asks for (and shop details an older draft may
      // hold). The rest comes in the guided setup.
      const extras = Object.fromEntries(APPLY_FIELDS
        .map((key) => [key, form[key]])
        .filter(([, v]) => (Array.isArray(v) ? v.length : v)));
      const res = await apiClient.post(ENDPOINTS.SELLER.APPLICATION, {
        ...extras,
        payoutMethods: form.payoutMethods,
        payoutMethod: mainMethodOf(form.payoutMethods),
        ...(!account ? {} : {
          payoutAccountName: form.payoutAccountName.trim(),
          payoutAccountNumber: form.payoutAccountNumber.trim(),
          ...(qrType && form.payoutQrUrl ? { payoutQrUrl: form.payoutQrUrl, payoutQrType: qrType } : {}),
        }),
        sellerBusinessType: registered ? 'REGISTERED' : 'INDIVIDUAL',
        ...(!registered ? {} : {
          sellerPermitNumber: form.sellerPermitNumber.trim(),
          sellerBirTin: form.sellerBirTin.trim(),
          sellerPermitUrl: form.sellerPermitUrl,
        }),
        shopMunicipalityId: form.municipalityId,
        shopBarangay: form.barangay,
        acceptedTerms: true,
      });
      const updated = res?.data || {};
      setApplied(true);
      // The account is a seller now: the shop is set up and private until an
      // admin approves the application, so the Seller Center opens straight away.
      await updateUser({
        ...user,
        ...updated,
        role: updated.role || 'SELLER',
        sellerApplicationStatus: updated.sellerApplicationStatus || 'PENDING',
      });
    } catch (err) {
      toast.error(err?.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const errs = {};
    for (const key of VALIDATED) {
      const message = fieldError(key, form[key], form);
      if (message) errs[key] = message;
    }
    setErrors(errs);
    const failed = Object.keys(errs);
    if (failed.length > 0) {
      toast.error('Please complete the highlighted fields');
      const step = Math.min(...failed.map((k) => STEP_OF[k] || 99));
      if (step < 99) scrollToStep(step);
      return;
    }
    if (!contactNumber) {
      toast.error('Add a contact number before applying');
      scrollToStep(1);
      return;
    }
    if (!acceptedTerms) {
      toast.error('Please accept the Seller Terms of Service');
      return;
    }
    // Submitting notifies the municipal admin and cannot be taken back.
    setConfirming(true);
  };

  // Next after applying: the guided setup, step by step.
  if (isSeller) return <Redirect href={applied ? '/seller/welcome' : '/seller'} />;

  if (status === 'PENDING') {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Seller Center" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.column, { paddingBottom: 64 + insets.bottom }]}>
          <View style={styles.status}>
            <CheckCircleIcon size={52} weight="fill" color={t.warning[500]} />
            <Text style={styles.statusTitle}>Application under review</Text>
            <Text style={styles.statusText}>
              The municipal admin is checking your details. We&apos;ll notify you once
              there&apos;s a decision (usually 1–2 business days).
            </Text>
            {application?.submittedAt ? (
              <Text style={[styles.statusText, styles.statusMeta]}>
                Submitted {new Date(application.submittedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={({ pressed }) => [styles.submit, styles.statusBack, pressed && styles.submitPressed]}>
              <Text style={styles.submitText}>Back to shop</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  const reviewer = form.municipalityName ? `${form.municipalityName} admin` : 'Pick your town';
  const buyersPay = form.payoutMethods.length
    ? form.payoutMethods.map((m) => PAYOUT_METHODS.find((p) => p.value === m)?.label).filter(Boolean).join(', ')
    : '—';
  const at = (step) => (e) => { sectionY.current[step] = e.nativeEvent.layout.y; };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Seller Center" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: 64 + insets.bottom }]}
        >
          {status === 'REJECTED' ? (
            <ApplyNote tone="reject" Icon={WarningIcon} title="Your previous application was not approved">
              {application?.rejectionReason ? <NoteLine>{application.rejectionReason}</NoteLine> : null}
              <NoteLine>Fix that and submit again. The details you entered are still here.</NoteLine>
            </ApplyNote>
          ) : null}

          <View style={styles.intro}>
            <Text style={styles.introTitle} accessibilityRole="header">Open your shop</Text>
            <Text style={styles.introText}>Five short steps, about two minutes. Your shop goes live once your municipal admin approves it.</Text>
          </View>

          {/* ── 1 · You ── */}
          <Section onLayout={at(1)}>
            <SectionHead step={1} title="About you" Icon={UserIcon}>How the admin and your buyers can reach you.</SectionHead>
            <InfoBox>
              <InfoRow label="Name" value={user?.fullName || '—'} />
              <InfoRow label="Email" value={user?.email || '—'} />
              <ContactNumberField
                value={contactNumber}
                onSaved={(next) => {
                  setContactNumber(next);
                  updateUser({ ...user, contactNumber: next });
                }}
              />
            </InfoBox>
          </Section>

          {/* ── 2 · The shop ── */}
          <Section onLayout={at(2)}>
            <SectionHead step={2} title="Your shop" Icon={StorefrontIcon}>Its name and what it sells. You can change these later.</SectionHead>
            <Form>
              <Field
                label="Shop name"
                required
                error={errors.shopName}
                hint={`${form.shopName.length}/60 · must be unique on Emoorm`}
              >
                <ApplyInput
                  value={form.shopName}
                  onChangeText={(v) => set('shopName', v)}
                  onBlur={() => touch('shopName')}
                  placeholder="e.g. Maria's Fresh Farm"
                  maxLength={60}
                  autoCapitalize="words"
                  error={Boolean(errors.shopName)}
                />
              </Field>
              <Field
                label="What do you sell?"
                required
                error={errors.shopCategories}
                hint={`Pick up to ${MAX_CATEGORIES}. This is where your products appear.`}
              >
                <Chips label="What do you sell?" error={Boolean(errors.shopCategories)}>
                  {categories.length === 0 ? <Text style={styles.hint}>Loading categories…</Text> : null}
                  {categories.map((c) => (
                    <Chip key={c.id} label={c.name} on={form.shopCategories.includes(c.id)} onPress={() => toggleCategory(c.id)} />
                  ))}
                </Chips>
              </Field>
            </Form>
          </Section>

          {/* ── 3 · Where ── */}
          <Section onLayout={at(3)}>
            <SectionHead step={3} title="Where your shop is" Icon={MapPinIcon}>The town you pick decides which municipal admin reviews your shop.</SectionHead>
            <ProfileAddressPicker
              value={{
                province: form.province,
                provinceCode: form.provinceCode,
                municipalityId: form.municipalityId,
                municipalityName: form.municipalityName,
                municipalityCode: form.municipalityCode,
                barangay: form.barangay,
                barangayCode: form.barangayCode,
                street: form.street,
              }}
              onChange={(next) => {
                setForm((prev) => {
                  const merged = { ...prev, ...next };
                  const composed = [merged.street, merged.barangay, merged.municipalityName, merged.province]
                    .map((v) => (v || '').trim())
                    .filter(Boolean)
                    .join(', ');
                  return { ...merged, shopAddress: composed };
                });
                setErrors((prev) => (prev.shopAddress || prev.municipalityId ? { ...prev, shopAddress: '', municipalityId: '' } : prev));
              }}
              dbMunicipalities={municipalities}
              dbLoading={municipalitiesLoading}
              errors={{ municipalityId: errors.shopAddress || errors.municipalityId }}
            />
          </Section>

          {/* ── 4 · Selling as ── */}
          <Section onLayout={at(4)}>
            <SectionHead step={4} title="Selling as" Icon={BriefcaseIcon}>
              Registered businesses add their permit. Selling under your own name? Nothing more needed.
            </SectionHead>
            <Form>
              <OptionCards
                label="How do you sell?"
                options={BUSINESS_TYPES}
                value={form.sellerBusinessType || 'INDIVIDUAL'}
                onChange={(value) => {
                  set('sellerBusinessType', value);
                  setErrors((p) => ({ ...p, sellerPermitNumber: '', sellerBirTin: '' }));
                }}
              />
              {registered ? (
                <>
                  <Field label="Permit or registration number" required error={errors.sellerPermitNumber}>
                    <ApplyInput
                      value={form.sellerPermitNumber}
                      onChangeText={(v) => set('sellerPermitNumber', v)}
                      onBlur={() => touch('sellerPermitNumber')}
                      placeholder="DTI, SEC or business permit no."
                      maxLength={60}
                      error={Boolean(errors.sellerPermitNumber)}
                    />
                  </Field>
                  <Field label="Business permit / DTI / SEC papers" hint="Optional · a clear photo or scan. Only the reviewing admin sees it.">
                    <PapersField value={form.sellerPermitUrl} onChange={(id) => set('sellerPermitUrl', id)} />
                  </Field>
                  <Field label="BIR TIN" error={errors.sellerBirTin} hint="Optional">
                    <ApplyInput
                      value={form.sellerBirTin}
                      onChangeText={(v) => set('sellerBirTin', v)}
                      onBlur={() => touch('sellerBirTin')}
                      placeholder="000-000-000-000"
                      maxLength={30}
                      error={Boolean(errors.sellerBirTin)}
                    />
                  </Field>
                </>
              ) : null}
            </Form>
          </Section>

          {/* ── 5 · How buyers pay ── */}
          <Section onLayout={at(5)}>
            <SectionHead step={5} title="How buyers pay" Icon={WalletIcon}>Where your buyers&apos; payments go. You can change it later.</SectionHead>
            <Form>
              <Field error={errors.payoutMethods} hint="Pick all that apply. You can change these anytime in Seller Center.">
                <PaymentMethods
                  value={form.payoutMethods}
                  onToggle={(method) => {
                    setForm((p) => ({ ...p, payoutMethods: toggleMethod(p.payoutMethods, method) }));
                    setErrors((p) => ({ ...p, payoutMethods: '', payoutAccountName: '', payoutAccountNumber: '' }));
                  }}
                />
              </Field>
              {account ? (
                <>
                  <Field label="Account name" required error={errors.payoutAccountName}>
                    <ApplyInput
                      value={form.payoutAccountName}
                      onChangeText={(v) => set('payoutAccountName', v)}
                      onBlur={() => touch('payoutAccountName')}
                      placeholder="Name on the account"
                      autoComplete="name"
                      autoCapitalize="words"
                      error={Boolean(errors.payoutAccountName)}
                    />
                  </Field>
                  <Field label={account.numberLabel} required error={errors.payoutAccountNumber}>
                    <ApplyInput
                      value={form.payoutAccountNumber}
                      onChangeText={(v) => set('payoutAccountNumber', v)}
                      onBlur={() => touch('payoutAccountNumber')}
                      placeholder={account.numberPlaceholder}
                      keyboardType="phone-pad"
                      error={Boolean(errors.payoutAccountNumber)}
                    />
                  </Field>
                  <Field label="Your QR code" optional>
                    <View style={styles.qr}>
                      <PictureField shape="square" label="QR code" value={form.payoutQrUrl} onChange={(url) => set('payoutQrUrl', url)} />
                      <View style={styles.qrText}>
                        {bothQr ? (
                          <Chips label="This QR is for">
                            {QR_METHODS.map((m) => (
                              <Chip key={m} role="radio" label={PAYOUT_METHODS.find((p) => p.value === m).label} on={qrType === m} onPress={() => set('payoutQrType', m)} />
                            ))}
                          </Chips>
                        ) : null}
                        <Text style={styles.hint}>
                          Your {bothQr ? 'GCash or QR Ph' : PAYOUT_METHODS.find((p) => p.value === qrType)?.label} QR, so buyers can scan to pay. You can add it later.
                        </Text>
                      </View>
                    </View>
                  </Field>
                </>
              ) : null}
            </Form>
          </Section>

          {/* The ID check comes later, in the Seller Center (/seller/verification). */}
          <ApplyNote tone="later" Icon={IdentificationCardIcon} title="Verify your identity later">
            <NoteLine>After you apply, verify your ID from your Seller Center. It takes a minute and helps the admin approve your shop faster.</NoteLine>
          </ApplyNote>

          {/* What comes after: the guided setup. */}
          <ApplyNote tone="next" Icon={SparkleIcon} title="After you apply">
            <NoteLine>A short guided setup: your logo and cover, a few words about your shop, how buyers get their orders, and your first product.</NoteLine>
          </ApplyNote>

          {/* ── Live preview (under the form on phones) ── */}
          <View style={styles.preview}>
            <View style={styles.previewHead}>
              <Text style={styles.previewTitle}>Application preview</Text>
              <View style={[styles.previewBadge, itemsLeft === 0 && styles.previewBadgeReady]}>
                <Text style={[styles.previewBadgeText, itemsLeft === 0 && styles.previewBadgeTextReady]}>
                  {itemsLeft === 0 ? 'Ready to submit' : `${itemsLeft} item${itemsLeft === 1 ? '' : 's'} left`}
                </Text>
              </View>
            </View>

            <View style={styles.previewCard}>
              <View style={styles.previewCover}>
                <Svg width="100%" height="100%" preserveAspectRatio="none">
                  <Defs>
                    <LinearGradient id="applyCover" x1="0" y1="0" x2="1" y2="0.6">
                      <Stop offset="0" stopColor={BRAND_SOFT} />
                      <Stop offset="1" stopColor="#cfe6d0" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#applyCover)" />
                </Svg>
              </View>
              <View style={styles.previewShop}>
                <View style={styles.previewAvatar}>
                  <Text style={styles.previewAvatarText}>{(form.shopName.trim() || 'S').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.previewName} numberOfLines={1}>{form.shopName.trim() || 'Your shop name'}</Text>
                <Text style={styles.previewAddress} numberOfLines={1}>{form.shopAddress || 'Shop address'}</Text>
              </View>
              {form.shopCategories.length > 0 ? (
                <View style={styles.previewCats}>
                  {form.shopCategories.map((id) => {
                    const category = categories.find((c) => c.id === id);
                    return category ? <Text key={id} style={styles.previewCat}>{category.name}</Text> : null;
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.previewList}>
              {[
                ['Applicant', user?.fullName || '—'],
                ['Contact', contactNumber || '—'],
                ['Selling as', registered ? 'Registered business' : 'Individual seller'],
                ['Buyers pay', buyersPay],
                ['Reviewed by', reviewer],
              ].map(([label, value]) => (
                <View key={label} style={styles.previewRow}>
                  <Text style={styles.previewDt}>{label}</Text>
                  <Text style={styles.previewDd}>{value}</Text>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              onPress={() => setAcceptedTerms((v) => !v)}
              style={styles.terms}
            >
              <View style={[styles.termsBox, acceptedTerms && styles.termsBoxOn]}>
                {acceptedTerms ? <CheckIcon size={12} weight="bold" color={t.neutral[0]} /> : null}
              </View>
              <Text style={styles.termsText}>
                I confirm the information above is accurate and I agree to Emoorm&apos;s{' '}
                <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/terms')}>Seller Terms of Service</Text>.
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [styles.submit, pressed && styles.submitPressed, isSubmitting && styles.submitBusy]}
            >
              <Text style={styles.submitText}>{isSubmitting ? 'Submitting…' : 'Open my shop'}</Text>
              {!isSubmitting ? <ArrowRightIcon size={16} color={t.neutral[0]} /> : null}
            </Pressable>
            <Text style={styles.draftNote}>Your progress is saved automatically.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Submitting notifies the municipal admin and cannot be taken back. */}
      <SheetFrame
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Open your shop?"
        footer={(
          <>
            <SheetButton variant="seller" label="Keep editing" onPress={() => setConfirming(false)} />
            <SheetButton variant="seller" primary label={isSubmitting ? 'Submitting…' : 'Yes, submit'} onPress={submit} disabled={isSubmitting} />
          </>
        )}
      >
        <Text style={styles.confirmText}>
          The {form.municipalityName || 'municipal'} admin will be notified and will review your
          shop. Meanwhile you can set it up and add products.
        </Text>
      </SheetFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  flex: { flex: 1 },
  content: { gap: 12, paddingTop: 16, paddingHorizontal: 16 },
  column: { gap: 12, paddingTop: 16, paddingHorizontal: 16 },

  intro: { paddingHorizontal: 2, paddingBottom: 4 },
  introTitle: { fontSize: 22, lineHeight: 27.5, color: t.neutral[900], ...font(700) },
  introText: { marginTop: 6, fontSize: 14, lineHeight: 21.7, color: t.neutral[600], ...font(400) },
  hint: { fontSize: 12.5, lineHeight: 18.1, color: t.neutral[500], ...font(400) },

  qr: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  qrText: { flex: 1, minWidth: 0, gap: 10 },

  preview: { gap: 16, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.neutral[0] },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  previewTitle: { flexShrink: 1, fontSize: 15, lineHeight: 20, color: t.neutral[900], ...font(700) },
  previewBadge: { flexShrink: 0, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.neutral[100] },
  previewBadgeReady: { backgroundColor: BRAND_SOFT },
  previewBadgeText: { fontSize: 12, lineHeight: 16, color: t.neutral[600], ...font(600) },
  previewBadgeTextReady: { color: BRAND },
  previewCard: { overflow: 'hidden', paddingBottom: 14, borderRadius: 14, backgroundColor: t.neutral[50] },
  previewCover: { height: 84 },
  previewShop: { alignItems: 'flex-start', gap: 6, marginTop: -28, paddingHorizontal: 14 },
  previewAvatar: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: t.neutral[0],
    alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND,
  },
  previewAvatarText: { fontSize: 20, lineHeight: 24, color: t.neutral[0], ...font(700) },
  previewName: { alignSelf: 'stretch', fontSize: 15, lineHeight: 20, color: t.neutral[900], ...font(700) },
  previewAddress: { alignSelf: 'stretch', marginTop: -6, fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  previewCats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingHorizontal: 14 },
  previewCat: {
    paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden', backgroundColor: t.neutral[0],
    fontSize: 11.5, lineHeight: 15, color: BRAND, ...font(500),
  },
  previewList: { gap: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  previewDt: { flexShrink: 0, fontSize: 12.5, lineHeight: 18, color: t.neutral[500], ...font(400) },
  previewDd: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, color: t.neutral[900], textAlign: 'right', ...font(500) },

  terms: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  termsBox: {
    width: 18, height: 18, marginTop: 1, borderRadius: 4, borderWidth: 1.5, borderColor: t.neutral[400],
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0],
  },
  termsBoxOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  termsText: { flex: 1, fontSize: 13, lineHeight: 19.5, color: t.neutral[600], ...font(400) },
  termsLink: { color: t.primary[700], textDecorationLine: 'underline', ...font(600) },

  submit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, paddingHorizontal: 20,
    borderRadius: 14, backgroundColor: t.primary[600],
  },
  submitPressed: { backgroundColor: t.primary[700] },
  submitBusy: { opacity: 0.65 },
  submitText: { fontSize: 15, lineHeight: 20, color: t.neutral[0], ...font(600) },
  draftNote: { marginTop: -6, fontSize: 12.5, lineHeight: 17, color: t.neutral[500], textAlign: 'center', ...font(400) },

  status: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, borderRadius: 16, backgroundColor: t.neutral[0] },
  statusTitle: { marginTop: 16, fontSize: 20, lineHeight: 26, color: t.neutral[900], textAlign: 'center', ...font(600) },
  statusText: { maxWidth: 420, marginTop: 8, fontSize: 14, lineHeight: 21.7, color: t.neutral[600], textAlign: 'center', ...font(400) },
  statusMeta: { fontSize: 12.5, lineHeight: 18, color: t.neutral[500] },
  statusBack: { alignSelf: 'stretch', marginTop: 24 },

  confirmText: { fontSize: 14, lineHeight: 21.7, color: t.neutral[600], ...font(400) },
});
