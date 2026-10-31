import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { SvgXml } from 'react-native-svg';
import {
  CheckCircleIcon, CheckIcon, MapPinIcon, MoneyIcon, QrCodeIcon, StorefrontIcon, TrashIcon, TruckIcon, UploadSimpleIcon, WarningIcon,
} from '../../../lib/icons';
import apiClient from '../../../api/client';
import { resolveImg } from '../../../lib/media';
import { toast } from '../../../lib/toast';
import { uploadImage } from '../../../lib/upload';
import { fetchMunicipalities } from '../../../lib/referenceData';
import { font, t, themed } from '../../../theme';
import SellerPage, { SellerPrivateLine } from '../SellerPage';
import { useSellerShell } from '../SellerShell';
import PhoneSaveBar, { savebarSpace } from '../PhoneSaveBar';
import CheckoutChoiceCard, { CheckoutCourierMark } from '../../checkout/CheckoutChoiceCard';
import CheckoutAddressPicker from '../../checkout/CheckoutAddressPicker';
import LocationPicker from '../../maps/LocationPicker';
import { validPin } from '../../maps/mapUtils';
import { useCartSettings } from '../../cart/cartSettings';
import {
  FieldInput, FieldLabel, ModeCard, ModeGrid, PartNote, Question,
  SettingsList, SettingsRow, SfBody, SfSwitch,
} from './FulfillmentParts';
import { WeightFixer } from './DeliveryHelpers';
import DeliveryPlaces from './DeliveryPlaces';
import { ScrollRevealContext, useScrollReveal } from '../../ScrollReveal';
import {
  costShort, emptyPlan, planFromSaved, planProblems, planRequest, whereShort,
} from './deliveryPlan';
import {
  MODES, MODE_LABELS, PARTS, QR_METHODS, checkAccountNumber, courierFrom,
  joinPickup, partPath, pickupGap, qrMethod, splitPickup,
} from './fulfillmentLib';

/*
 * The seller's Delivery & payment on phones (web/src/pages/SellerFulfillment.jsx,
 * its phone layout): /seller/fulfillment lists the parts (Delivery & pickup,
 * Pickup spot, Delivery, Payment options), each with what is set now, and
 * /seller/fulfillment/<part> edits one part with Cancel and Save changes at
 * the bottom. Each part starts from the saved settings and sends only its
 * own settings, so nothing unsaved carries over between them.
 *
 * <SellerFulfillmentScreen part={null | 'method' | 'pickup' | 'delivery' | 'payment'} />
 */

// Links written for the one-page layout (/seller/fulfillment#payment).
const PART_OF_ANCHOR = {
  method: 'method',
  pickup: 'pickup',
  'delivery-areas': 'delivery',
  'delivery-fee': 'delivery',
  'delivery-couriers': 'delivery',
  payment: 'payment',
};

/**
 * Phones: the pickup address picked like every other address in the app
 * (web components/seller/PickupAddressField.jsx). The address text changes
 * only when the seller changes something; `onChange(text, parts)`.
 */
function PickupAddressField({ value, shopTown, municipalities, onChange }) {
  const [parts, setParts] = useState(() => splitPickup(value, shopTown));
  const handleChange = (next) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    // The picker also settles the province and the codes by itself; only the
    // seller's own changes rewrite the address.
    const moved = ['municipalityName', 'barangay', 'street']
      .some((k) => String(merged[k] || '') !== String(parts[k] || ''));
    if (moved) onChange(joinPickup(merged), merged);
  };
  return (
    <CheckoutAddressPicker
      value={parts}
      onChange={handleChange}
      dbMunicipalities={municipalities}
      streetLabel="Street, building or landmark"
      streetPlaceholder="e.g. Stall 4, public market"
    />
  );
}

export default function SellerFulfillmentScreen({ part: rawPart }) {
  const part = rawPart || null;
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { setStore: setShellStore, refreshSetup } = useSellerShell();
  const [store, setStore] = useState(null);
  const [municipalities, setMunicipalities] = useState([]);
  // The seller's own delivery: the places delivered to and each one's fee
  // (deliveryPlan.js). Each change is saved at once (PUT
  // /stores/my/delivery); `savedDelivery` is what is saved now.
  const [plan, setPlan] = useState(emptyPlan);
  const [savedDelivery, setSavedDelivery] = useState(null);
  const appSettings = useCartSettings();
  const platformRate = {
    base: Number(appSettings?.deliveryFee ?? 50),
    included: Number(appSettings?.deliveryIncludedKm ?? 3),
    perKm: Number(appSettings?.deliveryPerKm ?? 10),
  };
  // The pickup address as picked (town, barangay, street), once changed.
  const [pickupDraft, setPickupDraft] = useState(null);
  const [qrOn, setQrOn] = useState(false);
  // Who delivers: the seller themselves, and/or couriers from the super admin's list.
  const [courierList, setCourierList] = useState([]);
  const [shipping, setShipping] = useState({ selfDelivery: true, courierIds: [] });
  const [shippingLoaded, setShippingLoaded] = useState(false);
  const [unweighed, setUnweighed] = useState({ list: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pinError, setPinError] = useState('');
  const scrollRef = useRef(null);
  // The delivery panels (Add a place, Change…) scroll themselves into sight.
  const { reveal, contentProps } = useScrollReveal(scrollRef);
  // Where the pin field sits in the page (the card starts 4px down).
  const pinY = useRef({ body: 4, pin: 0 });

  const [form, setForm] = useState({
    fulfillmentMode: 'DELIVERY',
    pickupAddress: '',
    pickupInstructions: '',
    // The pickup spot on the map: buyers' route and road guide lead here.
    latitude: null,
    longitude: null,
    paymentQrImage: '',
    paymentQrType: 'GCASH',
    paymentInstructions: '',
    paymentAccountName: '',
    paymentAccountNumber: '',
    acceptsCod: true,
  });
  const setField = (name) => (value) => setForm((p) => ({ ...p, [name]: value }));

  // Old one-page links (?focus=payment) open the part's page.
  const anchorPart = !part && params.focus ? PART_OF_ANCHOR[String(params.focus)] : null;
  useEffect(() => {
    if (anchorPart) router.replace(partPath(anchorPart));
    else if (part && !PARTS.includes(part)) router.replace('/seller/fulfillment');
  }, [anchorPart, part]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUnweighed = useCallback(() => apiClient.get('/couriers/my-store')
    .then((res) => setUnweighed({ list: res.data?.unweighed || [], count: res.data?.unweighedCount || 0 }))
    .catch(() => {}), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.get('/couriers'), apiClient.get('/couriers/my-store')])
      .then(([all, mine]) => {
        if (cancelled) return;
        setCourierList(all.data || []);
        setShipping({
          selfDelivery: mine.data?.selfDelivery ?? true,
          courierIds: (mine.data?.couriers || []).map((c) => c.id),
        });
        setUnweighed({ list: mine.data?.unweighed || [], count: mine.data?.unweighedCount || 0 });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setShippingLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let live = true;
    fetchMunicipalities().then((list) => { if (live) setMunicipalities(list || []); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [storeRes, deliveryRes] = await Promise.all([
          apiClient.get('/stores/my/store'),
          apiClient.get('/stores/my/delivery'),
        ]);
        if (!live) return;
        const s = storeRes.data;
        setStore(s);
        // Where and how much, as saved.
        setSavedDelivery(deliveryRes.data);
        setPlan(planFromSaved(deliveryRes.data));
        setForm({
          fulfillmentMode: s.fulfillmentMode || 'DELIVERY',
          pickupAddress: s.pickupAddress || '',
          pickupInstructions: s.pickupInstructions || '',
          latitude: s.latitude ?? null,
          longitude: s.longitude ?? null,
          paymentQrImage: s.paymentQrImage || '',
          paymentQrType: s.paymentQrType || 'GCASH',
          paymentInstructions: s.paymentInstructions || '',
          paymentAccountName: s.paymentAccountName || '',
          paymentAccountNumber: s.paymentAccountNumber || '',
          acceptsCod: s.acceptsCod ?? true,
        });
        setQrOn(Boolean(s.paymentQrImage));
      } catch (err) {
        if (live) toast.error(err.message || 'Failed to load store');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const pickQr = async () => {
    if (uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const res = await uploadImage(result.assets[0]);
      setForm((p) => ({ ...p, paymentQrImage: res.url }));
      toast.success('QR image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const homeId = store?.municipalityId || '';
  const nameOf = useCallback((id) => municipalities.find((m) => m.id === id)?.name || '', [municipalities]);
  const allTownIds = useMemo(() => municipalities.map((m) => m.id), [municipalities]);

  /**
   * Saves the places list at once (it has no separate Save): Me, Home and
   * "Complete your shop" follow. Rejects (after the toast) so the sheet
   * stays open.
   */
  const commitPlan = async (next, message) => {
    const blocking = planProblems(next, (id) => nameOf(id) || 'this town').filter((p) => p.key !== 'places');
    if (blocking.length) {
      toast.error(blocking[0].message);
      throw new Error(blocking[0].message);
    }
    try {
      const saved = await apiClient.put('/stores/my/delivery', planRequest(next));
      setPlan(next);
      setSavedDelivery(saved.data);
      setShellStore((prev) => (prev ? { ...prev, deliveryFeeMode: saved.data.mode, deliveryFee: saved.data.flatFee } : prev));
      refreshSetup?.();
      if (message !== false) toast.success(message || 'Saved');
    } catch (err) {
      toast.error(err.message || 'Could not save. Please try again.');
      throw err;
    }
  };
  const toggleCourier = (id) => setShipping((prev) => ({
    ...prev,
    courierIds: prev.courierIds.includes(id) ? prev.courierIds.filter((x) => x !== id) : [...prev.courierIds, id],
  }));

  const showDeliveryAreas = form.fulfillmentMode === 'DELIVERY' || form.fulfillmentMode === 'BOTH';
  const showPickup = form.fulfillmentMode === 'PICKUP' || form.fulfillmentMode === 'BOTH';
  const pickupPinned = validPin(form.latitude, form.longitude);

  // A part's own settings, to tell whether its page changed anything.
  const partState = (p) => JSON.stringify(
    p === 'method' ? [form.fulfillmentMode]
      : p === 'pickup' ? [form.pickupAddress.trim(), form.pickupInstructions.trim(), form.latitude, form.longitude]
        : p === 'payment' ? [form.acceptsCod, qrOn, ...(qrOn ? [
          form.paymentQrImage, form.paymentQrType, form.paymentAccountName.trim(),
          form.paymentAccountNumber.replace(/[\s-]/g, ''), form.paymentInstructions.trim(),
        ] : [])]
          : [shipping.selfDelivery, [...shipping.courierIds].sort()],
  );
  const partReady = !loading && (part !== 'delivery' || shippingLoaded);
  const [baseline, setBaseline] = useState(null);
  useEffect(() => {
    if (part && partReady && baseline === null) setBaseline(partState(part));
  }, [part, partReady, baseline]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = baseline !== null && partState(part) !== baseline;

  // Back to where the part was opened from (the list, Me, Shop setup…).
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/seller/fulfillment');
  };

  const scrollToPin = () => {
    const y = pinY.current.body + pinY.current.pin;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
  };

  // One part's page sends only its own settings.
  const saveSettings = async (scope) => {
    if (!store) return;
    const has = (p) => scope === p;
    if (has('pickup') && showPickup && !form.pickupAddress.trim()) {
      toast.error('Please provide a pickup address.');
      return;
    }
    // The barangay and a street or landmark as well.
    const pickupProblem = has('pickup') && showPickup && pickupDraft ? pickupGap(pickupDraft) : null;
    if (pickupProblem) {
      toast.error(pickupProblem);
      return;
    }
    // Buyers who pick up see the way from where they are to this pin.
    if (has('pickup') && showPickup && !pickupPinned) {
      setPinError('Pin your pickup spot on the map.');
      toast.error('Pin your pickup spot on the map so buyers can find it.');
      scrollToPin();
      return;
    }
    // Delivering yourself needs somewhere to deliver (the places save themselves).
    if (has('delivery') && showDeliveryAreas && shipping.selfDelivery && !plan.places.length) {
      toast.error('Add at least one place you deliver to.');
      return;
    }
    // QR payment needs the QR, and the account buyers pay to.
    const qr = qrOn;
    if (has('payment')) {
      const method = qrMethod(form.paymentQrType);
      let problem = null;
      if (!form.acceptsCod && !qr) problem = 'Accept cash on delivery or add a QR code so buyers can pay.';
      else if (qr && !form.paymentQrImage) problem = `Upload your ${method.label} QR code so buyers can scan it.`;
      else if (qr && !form.paymentAccountName.trim()) problem = `Enter the name on your ${method.label} account.`;
      else if (qr && !form.paymentAccountNumber.trim()) {
        problem = method.key === 'GCASH' ? 'Enter your GCash number.' : 'Enter your account number.';
      } else if (qr) {
        problem = checkAccountNumber(form.paymentAccountNumber, form.paymentQrType).error;
      }
      if (problem) {
        toast.error(problem);
        return;
      }
    }

    const changes = {
      method: { fulfillmentMode: form.fulfillmentMode },
      pickup: {
        pickupAddress: form.pickupAddress,
        pickupInstructions: form.pickupInstructions,
        latitude: form.latitude,
        longitude: form.longitude,
      },
      // QR payment off takes the QR down; its details stay for next time.
      payment: qr ? {
        acceptsCod: form.acceptsCod,
        paymentQrImage: form.paymentQrImage,
        paymentQrType: form.paymentQrType,
        paymentAccountName: form.paymentAccountName,
        paymentAccountNumber: form.paymentAccountNumber,
        paymentInstructions: form.paymentInstructions,
      } : { acceptsCod: form.acceptsCod, paymentQrImage: null },
      delivery: null,
    }[scope];

    if (has('delivery') && showDeliveryAreas && !shipping.selfDelivery && shipping.courierIds.length === 0) {
      toast.error('Choose a courier, or deliver orders yourself.');
      return;
    }

    setSaving(true);
    try {
      const res = changes ? await apiClient.put(`/stores/${store.id}`, changes) : null;
      if (has('delivery') && shippingLoaded) await apiClient.put('/couriers/my-store', shipping);
      // Me and Home show what is saved now.
      if (res?.data) setShellStore((prev) => (prev ? { ...prev, ...res.data } : prev));
      refreshSetup?.();
      // A new way to hand orders over may need its part set up next.
      const next = scope !== 'method' ? null
        : showPickup && (!form.pickupAddress.trim() || !pickupPinned) ? 'pickup'
          : showDeliveryAreas && !savedDelivery?.areas?.length ? 'delivery' : null;
      if (next) {
        toast.success(next === 'pickup' ? 'Saved. Now add your pickup spot.' : 'Saved. Now choose where you deliver.');
        router.replace(partPath(next));
      } else {
        toast.success('Saved');
        leave();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (anchorPart || (part && !PARTS.includes(part))) return <SellerPage privateLine={false} />;

  if (loading) {
    return (
      <SellerPage contentStyle={styles.flush}>
        <SfBody><Text style={styles.loading}>Loading store settings…</Text></SfBody>
      </SellerPage>
    );
  }

  // Phones, the list: each part with what is set now; the parts buyers need
  // before the shop can sell say so while they are missing.
  if (!part) {
    // Delivery as saved, in a few words.
    const savedPlan = savedDelivery ? planFromSaved(savedDelivery) : emptyPlan();
    const savedWhere = whereShort(savedPlan, (id) => nameOf(id) || 'Town', homeId, allTownIds);
    const savedCost = costShort(savedPlan, platformRate);
    const savedFeeMissing = !savedCost;
    const deliveryMissing = shipping.selfDelivery ? !savedWhere || savedFeeMissing : shipping.courierIds.length === 0;
    const deliveryValue = !shipping.selfDelivery
      ? (shipping.courierIds.length ? 'Couriers deliver your orders' : 'Choose who delivers')
      : !savedWhere ? 'Choose where you deliver'
        : savedFeeMissing ? `${savedWhere} · Set your delivery fee` : `${savedWhere} · ${savedCost}`;
    const qrKindName = qrMethod(form.paymentQrType).label;
    const ways = [form.acceptsCod && 'Cash on delivery', form.paymentQrImage && `${qrKindName} QR`].filter(Boolean);
    const pickupSet = Boolean(form.pickupAddress.trim());
    return (
      <SellerPage contentStyle={styles.flush}>
        <SettingsList label="Delivery & payment">
          <SettingsRow
            first
            to={partPath('method')}
            icon={TruckIcon}
            label="Delivery & pickup"
            value={MODE_LABELS[form.fulfillmentMode] || 'Delivery only'}
          />
          {showPickup ? (
            <SettingsRow
              to={partPath('pickup')}
              icon={StorefrontIcon}
              label="Pickup spot"
              value={!pickupSet ? 'Not set yet' : pickupPinned ? form.pickupAddress.trim() : 'Pin it on the map'}
              missing={!pickupSet || !pickupPinned}
              tag={pickupSet ? null : 'Needed to sell'}
            />
          ) : null}
          {showDeliveryAreas ? (
            <SettingsRow
              to={partPath('delivery')}
              icon={MapPinIcon}
              label="Delivery: places & fees"
              value={deliveryValue}
              missing={deliveryMissing}
              tag={deliveryMissing ? 'Needed to sell' : null}
            />
          ) : null}
          <SettingsRow
            to={partPath('payment')}
            icon={QrCodeIcon}
            label="Payment options"
            value={ways.length ? ways.join(' · ') : 'No way to pay yet'}
            missing={!ways.length}
            tag={ways.length ? null : 'Needed to sell'}
          />
        </SettingsList>
      </SellerPage>
    );
  }

  // ── One part: its card only, and Cancel / Save changes at the bottom. ──
  const off = (part === 'pickup' && !showPickup) || (part === 'delivery' && !showDeliveryAreas);

  const methodCard = (
    <SfBody>
      <ModeGrid>
        {MODES.map((m) => (
          <ModeCard
            key={m.key}
            checked={form.fulfillmentMode === m.key}
            onPress={() => setField('fulfillmentMode')(m.key)}
            title={m.label}
            desc={m.desc}
          />
        ))}
      </ModeGrid>
    </SfBody>
  );

  const pickupCard = (
    <SfBody>
      <View style={styles.group}>
        <FieldLabel required>Pickup address</FieldLabel>
        <PickupAddressField
          value={form.pickupAddress}
          shopTown={store?.municipality?.name}
          municipalities={municipalities}
          onChange={(text, parts) => {
            setForm((p) => ({ ...p, pickupAddress: text }));
            setPickupDraft(parts);
          }}
        />
      </View>
      <View style={styles.group} onLayout={(e) => { pinY.current.pin = e.nativeEvent.layout.y; }}>
        <FieldLabel required>Pin your pickup spot</FieldLabel>
        <Text style={styles.pinHelp}>
          {pickupPinned
            ? 'Buyers who pick up see the way here from where they are. Drag the pin if the spot moves.'
            : 'Tap the map where buyers collect their orders, or use your location.'}
        </Text>
        <LocationPicker
          value={{ latitude: form.latitude, longitude: form.longitude }}
          onChange={({ latitude, longitude }) => {
            setForm((p) => ({ ...p, latitude, longitude }));
            setPinError('');
          }}
          height={240}
          lockToPhilippines
          hint="Tap the map where buyers collect their orders."
          error={Boolean(pinError)}
        />
        {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
      </View>
      <View style={styles.group}>
        <FieldLabel>Pickup instructions (optional)</FieldLabel>
        <FieldInput
          multiline
          numberOfLines={3}
          value={form.pickupInstructions}
          onChangeText={setField('pickupInstructions')}
          placeholder="Opening hours, landmarks, contact person…"
        />
      </View>
    </SfBody>
  );

  // By distance: the shop pin the distances start at.
  const distanceExtras = !pickupPinned ? (
    <View style={styles.pinWarn} accessibilityRole="alert">
      <WarningIcon size={15} weight="fill" color={t.warning[600]} style={styles.pinWarnIcon} />
      <Text style={styles.pinWarnText}>
        Pin your shop so the distance can be worked out.{' '}
        <Text
          accessibilityRole="link"
          style={styles.pinWarnLink}
          onPress={() => router.push(showPickup ? partPath('pickup') : '/seller/store/location')}
        >
          {showPickup ? 'Pin it in Pickup spot' : 'Pin it in Location'}
        </Text>
      </Text>
    </View>
  ) : null;

  const deliveryCard = (
    <SfBody>
      <Question icon={<TruckIcon size={22} weight="fill" color={t.primary[600]} />} title="Who delivers your orders?" first>
        <View style={styles.couriers}>
          <CheckoutChoiceCard
            box
            checked={shipping.selfDelivery}
            onPress={() => setShipping((prev) => ({ ...prev, selfDelivery: !prev.selfDelivery }))}
            media={<View style={styles.self}><TruckIcon size={18} weight="fill" color="#fff" /></View>}
            title="I deliver myself"
            desc="Your own fee · COD OK"
          />
          {courierList.map((c) => {
            const from = courierFrom(c);
            const on = shipping.courierIds.includes(c.id);
            return (
              <CheckoutChoiceCard
                key={c.id}
                box
                plainMedia
                checked={on}
                disabled={!on && (from == null || unweighed.count > 0)}
                onPress={() => toggleCourier(c.id)}
                media={<CheckoutCourierMark courier={c} size={30} />}
                title={c.name}
                desc={from == null ? 'Rates not set yet' : `From ₱${from} · paid online`}
              />
            );
          })}
        </View>
        {unweighed.count > 0 ? <WeightFixer products={unweighed.list} total={unweighed.count} onSaved={loadUnweighed} /> : null}
        {shipping.courierIds.length > 0 && !form.paymentQrImage ? (
          <Text style={styles.courierWarn} accessibilityRole="alert">
            Couriers need your GCash or QR Ph in Payment options.
          </Text>
        ) : null}
      </Question>

      {shipping.selfDelivery ? (
        <DeliveryPlaces
          plan={plan}
          onCommit={commitPlan}
          municipalities={municipalities}
          homeId={homeId}
          platformRate={platformRate}
          distanceExtras={distanceExtras}
        />
      ) : (
        <View style={styles.courierAuto} accessibilityRole="text">
          <CheckCircleIcon size={18} weight="fill" color={t.primary[600]} style={styles.courierAutoIcon} />
          <Text style={styles.courierAutoText}>
            Couriers set the shipping fee from each product&apos;s weight.
          </Text>
        </View>
      )}

    </SfBody>
  );

  const qrKind = qrMethod(form.paymentQrType);
  const cashLabel = form.fulfillmentMode === 'PICKUP' ? 'Cash on pickup' : 'Cash on delivery';
  const paymentCard = (
    <SfBody style={styles.pay}>
      <Text style={styles.payLead}>Choose how buyers can pay you.</Text>

      <View style={styles.payWay}>
        <Pressable onPress={() => setField('acceptsCod')(!form.acceptsCod)} style={styles.payHead} accessible={false}>
          <MoneyIcon size={28} weight="fill" color={form.acceptsCod ? t.primary[500] : t.neutral[500]} />
          <View style={styles.payText}>
            <Text style={styles.payTitle}>{cashLabel}</Text>
            <Text style={styles.paySub}>Buyers pay in cash when they get their order.</Text>
          </View>
          <SfSwitch value={form.acceptsCod} onValueChange={setField('acceptsCod')} label={cashLabel} />
        </Pressable>
      </View>

      <View style={styles.payWay}>
        <Pressable onPress={() => setQrOn((v) => !v)} style={styles.payHead} accessible={false}>
          <QrCodeIcon size={28} weight="fill" color={qrOn ? t.info[500] : t.neutral[500]} />
          <View style={styles.payText}>
            <Text style={styles.payTitle}>QR payment</Text>
            <Text style={styles.paySub}>Buyers scan your GCash or QR Ph code to pay.</Text>
          </View>
          <SfSwitch value={qrOn} onValueChange={setQrOn} label="QR payment" />
        </Pressable>

        {qrOn ? (
          <View style={styles.payBody}>
            <View style={styles.payField}>
              <Text style={styles.payLabel}>Which QR do you have?</Text>
              <View style={styles.qrKinds} accessibilityRole="radiogroup">
                {QR_METHODS.map((m) => {
                  const active = form.paymentQrType === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      accessibilityRole="radio"
                      accessibilityLabel={m.label}
                      accessibilityState={{ checked: active }}
                      onPress={() => setField('paymentQrType')(m.key)}
                      style={[styles.qrKind, active && styles.qrKindOn]}
                    >
                      <SvgXml xml={m.logo} height={24} width={102} />
                      {active ? (
                        <View style={styles.qrKindCheck}><CheckIcon size={12} weight="bold" color="#fff" /></View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.payField}>
              <Text style={styles.payLabel}>Account name</Text>
              <FieldInput
                value={form.paymentAccountName}
                onChangeText={setField('paymentAccountName')}
                maxLength={120}
                autoComplete="name"
                placeholder={`Name on your ${qrKind.label} account`}
              />
            </View>
            <View style={styles.payField}>
              <Text style={styles.payLabel}>{qrKind.numberLabel}</Text>
              <FieldInput
                value={form.paymentAccountNumber}
                onChangeText={setField('paymentAccountNumber')}
                maxLength={24}
                keyboardType={qrKind.key === 'GCASH' ? 'phone-pad' : 'number-pad'}
                autoComplete={qrKind.key === 'GCASH' ? 'tel' : 'off'}
                placeholder={qrKind.numberPlaceholder}
              />
              <Text style={styles.payHelp}>Buyers see this name and number beside your QR, so they know they are paying you.</Text>
            </View>

            <View style={styles.payField}>
              <Text style={styles.payLabel}>Your {qrKind.label} QR code</Text>
              {form.paymentQrImage ? (
                <View style={styles.qrCard}>
                  <Image source={{ uri: resolveImg(form.paymentQrImage) }} resizeMode="contain" style={styles.qrImg} accessibilityLabel={`${qrKind.label} QR code`} />
                  <View style={styles.qrActions}>
                    <Pressable accessibilityRole="button" onPress={pickQr} disabled={uploading} style={styles.qrAction}>
                      {uploading ? <ActivityIndicator size={14} color={t.neutral[600]} /> : <UploadSimpleIcon size={16} color={t.neutral[800]} />}
                      <Text style={styles.qrActionText}>{uploading ? 'Uploading…' : 'Change'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setField('paymentQrImage')('')} style={[styles.qrAction, styles.qrRemove]}>
                      <TrashIcon size={16} color={t.danger[600]} />
                      <Text style={[styles.qrActionText, styles.qrRemoveText]}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={pickQr} disabled={uploading} style={styles.qrDrop}>
                  <UploadSimpleIcon size={24} color={t.primary[600]} style={styles.qrDropIcon} />
                  <Text style={styles.qrDropTitle}>{uploading ? 'Uploading…' : `Upload your ${qrKind.label} QR`}</Text>
                  <Text style={styles.qrDropSub}>
                    {qrKind.key === 'GCASH'
                      ? 'Save your QR from the GCash app, then add it here.'
                      : 'Save your QR Ph code from your bank or e-wallet app, then add it here.'}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.payField}>
              <Text style={styles.payLabel}>
                Note to buyers <Text style={styles.payOptional}>(optional)</Text>
              </Text>
              <FieldInput
                multiline
                numberOfLines={3}
                value={form.paymentInstructions}
                onChangeText={setField('paymentInstructions')}
                placeholder="e.g. Include your order number as the payment reference."
              />
            </View>
          </View>
        ) : null}
      </View>
    </SfBody>
  );

  const card = {
    method: methodCard, pickup: pickupCard, delivery: deliveryCard, payment: paymentCard,
  }[part];

  return (
    <SellerPage scroll={false} privateLine={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.partContent, { paddingBottom: (off ? 24 : savebarSpace(insets) + 8) + (off ? insets.bottom : 0) }]}
          keyboardShouldPersistTaps="handled"
        >
          <View {...contentProps}>
            <View style={styles.privateWrap}><SellerPrivateLine /></View>
            {off ? (
              <View style={styles.offWrap}>
                <PartNote
                  text={part === 'pickup'
                    ? 'Pickup is off: buyers get their orders delivered.'
                    : 'Delivery is off: buyers pick up their orders.'}
                  linkLabel="Change how buyers get their orders"
                  onPress={() => router.replace(partPath('method'))}
                />
              </View>
            ) : <ScrollRevealContext.Provider value={reveal}>{card}</ScrollRevealContext.Provider>}
          </View>
        </ScrollView>
        {!off ? (
          <PhoneSaveBar onCancel={leave} onSave={() => saveSettings(part)} saving={saving} canSave={dirty} />
        ) : null}
      </KeyboardAvoidingView>
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  // The list runs edge to edge, 4px under the bar as on the website.
  flush: { paddingHorizontal: 0 },
  partContent: { paddingTop: 4 },
  privateWrap: { paddingHorizontal: 12 },
  offWrap: { paddingTop: 12, paddingHorizontal: 12 },
  loading: { padding: 32, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
  group: { gap: 6 },
  pinHelp: { marginTop: -4, marginBottom: 2, fontSize: 13, lineHeight: 18.85, color: t.neutral[500], ...font(400) },
  pinError: { marginTop: 6, fontSize: 13, lineHeight: 19.5, color: t.danger[600], ...font(400) },

  couriers: { gap: 10 },
  self: {
    width: 49, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[600], experimental_backgroundImage: 'linear-gradient(135deg, #34d399, #059669)',
  },
  courierWarn: {
    marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, overflow: 'hidden',
    backgroundColor: t.warning[50], color: t.warning[800], fontSize: 13, lineHeight: 19.5, ...font(400),
  },
  courierAuto: {
    flexDirection: 'row', gap: 10, marginTop: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.primary[50],
  },
  courierAutoIcon: { marginTop: 1 },
  courierAutoText: { flex: 1, fontSize: 13.5, lineHeight: 20.25, color: t.primary[800], ...font(400) },

  // By distance without the shop pin.
  pinWarn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.warning[50],
  },
  pinWarnIcon: { marginTop: 2 },
  pinWarnText: { flex: 1, fontSize: 13, lineHeight: 19.5, color: t.warning[800], ...font(400) },
  pinWarnLink: { color: t.primary[700], textDecorationLine: 'underline', ...font(500) },

  pay: { gap: 12, paddingTop: 16 },
  payLead: { fontSize: 14, lineHeight: 20.3, color: t.neutral[600], ...font(400) },
  payWay: { padding: 14, borderRadius: 14, backgroundColor: t.neutral[50] },
  payHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payText: { flex: 1, minWidth: 0, gap: 2 },
  payTitle: { fontSize: 15, lineHeight: 22, color: t.neutral[900], ...font(500) },
  paySub: { fontSize: 13, lineHeight: 18.2, color: t.neutral[500], ...font(400) },
  payBody: { gap: 16, marginTop: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  payField: { gap: 8, minWidth: 0 },
  payLabel: { fontSize: 14, lineHeight: 20, color: t.neutral[800], ...font(500) },
  payOptional: { color: t.neutral[500], ...font(400) },
  payHelp: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  qrKinds: { flexDirection: 'row', gap: 10 },
  qrKind: {
    flex: 1, height: 60, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  qrKindOn: { borderColor: t.primary[600], boxShadow: '0px 0px 0px 3px rgba(5, 150, 105, 0.12)' },
  qrKindCheck: {
    position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11, borderWidth: 2, bordercolor: t.onBrand,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  qrDrop: {
    alignItems: 'center', gap: 4, paddingVertical: 20, paddingHorizontal: 16,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  qrDropIcon: { marginBottom: 4 },
  qrDropTitle: { fontSize: 14.5, lineHeight: 20, color: t.neutral[900], textAlign: 'center', ...font(500) },
  qrDropSub: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
  qrCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  qrImg: { width: 112, height: 112, borderRadius: 8, backgroundColor: t.neutral[0] },
  qrActions: { flex: 1, minWidth: 0, gap: 8 },
  qrAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  qrActionText: { fontSize: 14, lineHeight: 20, color: t.neutral[800], ...font(500) },
  qrRemove: { borderColor: t.danger[100] },
  qrRemoveText: { color: t.danger[600] },
}));
