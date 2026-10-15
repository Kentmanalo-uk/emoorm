import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckIcon, ClockIcon, HandCoinsIcon, MapPinIcon, PlusIcon, StorefrontIcon, TruckIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { font, t } from '../../src/theme';
import { toast } from '../../src/lib/toast';
import { fetchMunicipalities } from '../../src/lib/referenceData';
import { clearSetupReturn, setSetupReturn } from '../../src/lib/setupReturn';
import SellerGuideArt, { useReducedMotion } from '../../src/components/seller/SellerGuideArt';
import { useSellerShell } from '../../src/components/seller/SellerShell';
import WelcomeFrame from '../../src/components/seller/welcome/WelcomeFrame';
import {
  FeeChoice, PlaceList, PlacesSummary, useInlinePanel,
} from '../../src/components/seller/fulfillment/DeliveryPlaces';
import {
  isWhole, planFromSaved, planProblems, planRequest, putPlace, removePlace, sortPlaces, summaryLines,
} from '../../src/components/seller/fulfillment/deliveryPlan';
import { useCartSettings } from '../../src/components/cart/cartSettings';
import {
  WelcomeBadge, WelcomeButton, WelcomeChoice, WelcomeDone, WelcomeField, WelcomeInlineLink, WelcomeInput,
  WelcomeLaterItem, WelcomeLink, WelcomeNote, WelcomePhoto, WelcomePoints,
  WelcomeRowLink, WelcomeSpinner, WelcomeSub, WelcomeSwitch,
} from '../../src/components/seller/welcome/WelcomeParts';

/*
 * /seller/welcome: the guided setup a new seller sees right after applying
 * (web/src/pages/SellerWelcome.jsx + SellerWelcome.css, phones): one small
 * thing per screen, in three parts (finish the application, set up the shop,
 * add a product). Screens can be skipped, and "Skip setup" leaves, except on
 * the ones a shop needs before buyers can order (REQUIRED: how buyers get
 * orders, the pickup spot, where it delivers, how buyers pay). Whatever is
 * left stays on Home's "Complete your shop" list. Things
 * done on other pages (the ID check, couriers, the payment QR, a product)
 * open that page with the "Back to setup" pill (setSetupReturn), which comes
 * back here with `?step=`.
 *
 * The whole screen, outside the Seller Center's bars (WelcomeFrame). The
 * website moves between screens with ?step= in the address; here the screen
 * is kept in state and mirrored in the `step` param, so the pill's
 * navigate({ params: { step } }) lands on the right one. Android's back
 * button goes back a screen, as the browser's does.
 */

const PARTS = [
  { title: 'Your application', text: 'What helps the admin approve you' },
  { title: 'Your shop', text: 'How buyers see, get and pay for your orders' },
  { title: 'Start selling', text: 'Your first product' },
];

const MODES = [
  { value: 'DELIVERY', label: 'I deliver', text: 'You bring orders to buyers.', Icon: TruckIcon },
  { value: 'PICKUP', label: 'Buyers pick up', text: 'Buyers collect at your shop or stall.', Icon: StorefrontIcon },
  { value: 'BOTH', label: 'Both', text: 'Buyers choose at checkout.', Icon: HandCoinsIcon },
];

const LATER_LABELS = {
  identity: 'Verify your identity',
  business: 'How you sell',
  branding: 'Logo and cover photo',
  about: 'Shop description',
  mode: 'How buyers get orders',
  pickup: 'Pickup spot',
  delivery: 'Delivery places and fees',
  payment: 'How buyers pay',
  product: 'Your first product',
};

// Steps skipped this visit. The website keeps them for the browser tab
// (sessionStorage) so a trip to another page does not forget them; here they
// live while the app runs, which is the same thing on a phone.
let keptSkipped = [];
const keepSkipped = (set) => { keptSkipped = [...set]; return set; };

// Needed before buyers can order (shopReadiness on the API): no skipping.
const REQUIRED = new Set(['mode', 'pickup', 'delivery', 'payment']);

const stepDone = (setup, key) => Boolean(setup?.steps?.find((s) => s.key === key)?.done);

/**
 * The form as the website starts it, from the shop, the application and its
 * delivery (GET /stores/my/delivery: where and how much).
 */
function startForm(shop, details, delivery) {
  // The places and fees, as saved (the same list as the Delivery screen).
  const plan = planFromSaved(delivery);
  const onlyHome = plan.places.length === 1 && !plan.distance && isWhole(plan.places[0])
    && plan.places[0].municipalityId === shop.municipalityId;
  return {
    businessType: details.sellerBusinessType || 'INDIVIDUAL',
    permit: details.sellerPermitNumber || '',
    tin: details.sellerBirTin || '',
    logo: shop.logo || '',
    banner: shop.bannerImage || shop.coverImage || '',
    description: shop.description || '',
    mode: shop.fulfillmentMode || 'DELIVERY',
    pickupAddress: shop.pickupAddress || '',
    pickupInstructions: shop.pickupInstructions || '',
    // Only the shop's town (with its fee), or a list of places.
    deliverWhere: plan.places.length && !onlyHome ? 'PLACES' : 'HOME',
    homeFee: onlyHome ? (plan.free ? 0 : plan.places[0].fee) : null,
    plan,
    acceptsCod: shop.acceptsCod !== false,
  };
}

export default function SellerWelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setStore: setShellStore } = useSellerShell();
  const still = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();

  const [store, setStore] = useState(null);
  const [setup, setSetup] = useState(null);
  const [app, setApp] = useState(null);
  const [municipalities, setMunicipalities] = useState([]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipped, setSkipped] = useState(() => new Set(keptSkipped));
  const [form, setForm] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // The delivery step's inline "Add a place" / Change / Remove panel: { kind, place }.
  const {
    panel: placePanel, open: openPlace, close: closePlace, reg: regPlace,
  } = useInlinePanel();
  const appSettings = useCartSettings();
  const platformRate = {
    base: Number(appSettings?.deliveryFee ?? 50),
    included: Number(appSettings?.deliveryIncludedKm ?? 3),
    perKm: Number(appSettings?.deliveryPerKm ?? 10),
  };

  // The screen on show ('intro', a step's key, or 'done').
  const paramStep = typeof params.step === 'string' ? params.step : '';
  const [current, setCurrent] = useState(paramStep || 'intro');
  // Sent back here by the pill (or a link) with another ?step=.
  useEffect(() => { if (paramStep) setCurrent(paramStep); }, [paramStep]);

  const load = useCallback(async ({ fresh = false } = {}) => {
    try {
      const [s, st, a, areas] = await Promise.all([
        apiClient.get('/stores/my/store'),
        apiClient.get('/stores/my/setup'),
        apiClient.get('/auth/seller-application'),
        apiClient.get('/stores/my/delivery').catch(() => ({ data: null })),
      ]);
      const shop = s.data;
      setStore(shop);
      setShellStore(shop);
      setSetup(st.data);
      setApp(a.data);
      setForm((f) => (f && !fresh ? f : startForm(shop, a.data?.details || {}, areas.data)));
    } catch {
      setFailed(true);
    }
  }, [setShellStore]);

  // Each time the setup comes to the front: no "Back to setup" pill needed
  // any more, and the shop read again. Back from another page, the form
  // starts over from what was saved there (the website loads the page anew).
  const visited = useRef(false);
  useFocusEffect(useCallback(() => {
    clearSetupReturn();
    load({ fresh: visited.current });
    visited.current = true;
  }, [load]));

  useEffect(() => {
    let alive = true;
    fetchMunicipalities().then((list) => { if (alive) setMunicipalities(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const town = store?.municipality?.name || setup?.municipality || 'your town';

  // The screens, in order; pickup and delivery only for the ways the shop uses.
  const steps = useMemo(() => {
    if (!form) return [];
    const { mode } = form;
    return [
      { key: 'identity', part: 0, done: app?.identityVerified === true },
      // Asked in the application now: done once the seller type is given
      // (a registered business with its permit number).
      { key: 'business', part: 0, done: Boolean(app?.details?.sellerBusinessType) && (app.details.sellerBusinessType !== 'REGISTERED' || Boolean(app.details.sellerPermitNumber)) },
      { key: 'branding', part: 1, done: stepDone(setup, 'branding') },
      { key: 'about', part: 1, done: Boolean(store?.description) },
      { key: 'mode', part: 1 },
      mode !== 'DELIVERY' && { key: 'pickup', part: 1, done: stepDone(setup, 'pickup') },
      mode !== 'PICKUP' && { key: 'delivery', part: 1, done: stepDone(setup, 'delivery-areas') && stepDone(setup, 'delivery-fee') },
      { key: 'payment', part: 1 },
      { key: 'product', part: 2, done: stepDone(setup, 'product') },
    ].filter(Boolean);
  }, [form, app, setup, store]);

  const index = steps.findIndex((s) => s.key === current);
  const step = index >= 0 ? steps[index] : null;
  const go = (key) => {
    setCurrent(key);
    router.setParams({ step: key });
  };
  const next = () => go(index + 1 < steps.length ? steps[index + 1].key : 'done');
  const back = () => (index > 0 ? go(steps[index - 1].key) : go('intro'));
  const skip = () => { setSkipped((s) => keepSkipped(new Set(s).add(step.key))); next(); };
  const leave = () => {
    toast.info('Finish the rest any time from Home: "Complete your shop".');
    router.replace('/seller');
  };
  // Off to another page; the pill there brings the seller back to `key`.
  const away = (to, key) => { setSetupReturn(key); router.push(to); };

  // Android's back button: a screen back, as the browser's back is on the website.
  const backRef = useRef(null);
  backRef.current = () => {
    if (step) { back(); return true; }
    if (current === 'done' && steps.length) { go(steps[steps.length - 1].key); return true; }
    return false;
  };
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => backRef.current?.() || false);
    return () => sub.remove();
  }, []));

  const save = async (run) => {
    setSaving(true);
    try {
      await run();
      setSkipped((s) => { const n = new Set(s); n.delete(step.key); return keepSkipped(n); });
      await load();
      next();
    } catch (err) {
      toast.error(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const putStore = (body) => apiClient.put(`/stores/${store.id}`, body);

  const artWidth = (small) => Math.min(screenWidth - 40, small ? 180 : 250);
  const art = (name, small = false) => (
    <SellerGuideArt name={name} width={artWidth(small)} style={styles.art} />
  );

  /* ── Each screen: its picture, words, fields and main button ───── */
  const screen = () => {
    if (!step) return null;
    switch (step.key) {
      case 'identity':
        return {
          art: 'identity',
          title: 'Verify your identity',
          text: 'Scan a valid ID with your camera. Admins approve verified shops faster.',
          body: step.done ? <WelcomeDone>Your ID is verified.</WelcomeDone> : (
            <WelcomePoints
              items={[
                { Icon: ClockIcon, text: 'Takes about a minute' },
                { Icon: CheckIcon, text: 'We don\'t keep a copy of your ID photo' },
              ]}
            />
          ),
          primary: step.done
            ? { label: 'Continue', onClick: next }
            : { label: 'Verify now', onClick: () => away('/seller/verification', 'identity') },
        };
      case 'business':
        return {
          art: 'business',
          title: 'How do you sell?',
          text: 'On your own, or as a registered business. Most sellers here sell on their own.',
          body: (
            <>
              <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="How you sell">
                {[
                  { value: 'INDIVIDUAL', label: 'On my own', text: 'Under your own name' },
                  { value: 'REGISTERED', label: 'Registered business', text: 'DTI, SEC or a business permit' },
                ].map((o) => (
                  <WelcomeChoice key={o.value} on={form.businessType === o.value} label={o.label} text={o.text} onPress={() => set({ businessType: o.value })} />
                ))}
              </View>
              {form.businessType === 'REGISTERED' && (
                <View style={styles.fields}>
                  <WelcomeField label="Permit or registration number">
                    <WelcomeInput value={form.permit} onChangeText={(v) => set({ permit: v })} placeholder="e.g. 0123456" maxLength={60} />
                  </WelcomeField>
                  <WelcomeField label="BIR TIN" optional>
                    <WelcomeInput value={form.tin} onChangeText={(v) => set({ tin: v })} placeholder="000-000-000-000" maxLength={30} />
                  </WelcomeField>
                </View>
              )}
            </>
          ),
          primary: {
            label: 'Save and continue',
            onClick: () => {
              if (form.businessType === 'REGISTERED' && !form.permit.trim()) return toast.error('Enter your permit or registration number');
              return save(() => apiClient.patch('/auth/seller-application/details', {
                sellerBusinessType: form.businessType, sellerPermitNumber: form.permit, sellerBirTin: form.tin,
              }));
            },
          },
        };
      case 'branding':
        return {
          art: 'branding',
          title: 'Give your shop a face',
          text: 'A logo and a cover photo make buyers trust a shop at a glance.',
          body: (
            <View style={styles.photos}>
              <WelcomePhoto label="Logo" hint="Square works best" value={form.logo} onChange={(url) => set({ logo: url })} />
              <WelcomePhoto wide label="Cover photo" hint="Your stall, your farm, your products" value={form.banner} onChange={(url) => set({ banner: url })} />
            </View>
          ),
          primary: {
            label: 'Save and continue',
            disabled: !form.logo && !form.banner,
            onClick: () => save(() => putStore({ logo: form.logo || null, bannerImage: form.banner || null })),
          },
        };
      case 'about':
        return {
          art: 'about',
          title: 'Tell buyers about your shop',
          text: 'What you sell, where it comes from, what makes it good. Two or three lines are enough.',
          body: (
            <WelcomeField label="Shop description" counter={`${form.description.length}/1000`}>
              <WelcomeInput
                rows={4}
                maxLength={1000}
                value={form.description}
                onChangeText={(v) => set({ description: v })}
                placeholder="e.g. Fresh calamansi and vegetables from our farm in Bansud, picked every morning."
              />
            </WelcomeField>
          ),
          primary: {
            label: 'Save and continue',
            disabled: !form.description.trim(),
            onClick: () => save(() => putStore({ description: form.description.trim() })),
          },
        };
      case 'mode':
        return {
          art: 'delivery',
          title: 'How do buyers get their orders?',
          text: 'You can change this any time.',
          body: (
            <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="How buyers get orders">
              {MODES.map(({ value, label, text, Icon }) => (
                <WelcomeChoice key={value} on={form.mode === value} label={label} text={text} Icon={Icon} onPress={() => set({ mode: value })} />
              ))}
            </View>
          ),
          primary: { label: 'Continue', onClick: () => save(() => putStore({ fulfillmentMode: form.mode })) },
        };
      case 'pickup':
        return {
          art: 'pickup',
          title: 'Where do buyers pick up?',
          text: 'Buyers see this after they order.',
          body: (
            <View style={styles.fields}>
              <WelcomeField label="Pickup address">
                <WelcomeInput rows={2} value={form.pickupAddress} onChangeText={(v) => set({ pickupAddress: v })} placeholder="e.g. Stall 12, Public Market, Poblacion" />
              </WelcomeField>
              <WelcomeField label="Directions" optional>
                <WelcomeInput value={form.pickupInstructions} onChangeText={(v) => set({ pickupInstructions: v })} placeholder="e.g. Beside the fish section. Open 6 AM to 5 PM." />
              </WelcomeField>
            </View>
          ),
          primary: {
            label: 'Save and continue',
            disabled: !form.pickupAddress.trim(),
            onClick: () => save(() => putStore({ pickupAddress: form.pickupAddress, pickupInstructions: form.pickupInstructions.trim() || null })),
          },
        };
      case 'delivery': {
        const homeId = store.municipalityId;
        const openSettings = () => away('/seller/fulfillment/delivery', 'delivery');
        const { plan } = form;
        // Places and fees are both set (buyers can order): nothing to ask.
        const allSet = plan.places.length > 0 && stepDone(setup, 'delivery-areas') && stepDone(setup, 'delivery-fee');
        const nameOf = (id) => municipalities.find((m) => m.id === id)?.name
          || (id === homeId ? store.municipality?.name : '') || 'Town';
        const lines = summaryLines(plan, nameOf, homeId, platformRate, municipalities.map((m) => m.id));
        const places = sortPlaces(plan.places, homeId, nameOf);
        const choose = (where) => {
          set({ deliverWhere: where });
          // "Choose places" with none yet: straight to Add a place.
          if (where === 'PLACES' && !plan.places.length) openPlace({ kind: 'add' }, 'add');
        };
        return {
          art: 'delivery',
          title: 'Where do you deliver?',
          text: 'And how much buyers pay for delivery there.',
          body: allSet ? (
            <>
              <WelcomeDone>Your delivery places and fees are set.</WelcomeDone>
              <PlacesSummary lines={lines} />
              <WelcomeLink label="Change them in Delivery settings" onPress={openSettings} />
            </>
          ) : (
            <>
              <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Where you deliver">
                <WelcomeChoice on={form.deliverWhere === 'HOME'} label={`Only ${town}`} text={`Every barangay in ${town}`} Icon={MapPinIcon} onPress={() => choose('HOME')} />
                <WelcomeChoice on={form.deliverWhere === 'PLACES'} label="Choose places" text="Other towns, or only some barangays" Icon={PlusIcon} onPress={() => choose('PLACES')} />
              </View>
              {form.deliverWhere === 'HOME' ? (
                <>
                  <WelcomeSub>How much is delivery?</WelcomeSub>
                  <FeeChoice value={form.homeFee} onChange={(fee) => set({ homeFee: fee })} label={`Delivery fee in ${town}`} />
                </>
              ) : (
                <>
                  <PlaceList
                    places={places}
                    plan={plan}
                    nameOf={nameOf}
                    homeId={homeId}
                    municipalities={municipalities}
                    panel={placePanel}
                    onOpen={openPlace}
                    onClose={closePlace}
                    onSave={(nextPlan) => {
                      set({ plan: nextPlan });
                      closePlace();
                    }}
                    onFee={(place, fee) => setForm((f) => ({ ...f, plan: putPlace(f.plan, { ...place, fee }, place.key) }))}
                    onRemove={(place) => set({ plan: removePlace(plan, place.key) })}
                    reg={regPlace}
                  />
                </>
              )}
              <WelcomeNote>
                A fee by distance, or couriers?{' '}
                <WelcomeInlineLink label="Set it up in Delivery settings" onPress={openSettings} />
              </WelcomeNote>
            </>
          ),
          primary: allSet ? { label: 'Continue', onClick: next } : {
            label: 'Save and continue',
            onClick: () => {
              let request;
              if (form.deliverWhere === 'HOME') {
                if (form.homeFee == null) return toast.error('Choose how much delivery costs');
                request = planRequest({
                  ...plan,
                  distance: false,
                  free: false,
                  places: [{
                    key: 'home', municipalityId: homeId, barangays: [], fee: form.homeFee,
                  }],
                });
              } else {
                const problems = planProblems(plan, nameOf);
                if (problems.length) return toast.error(problems[0].message);
                request = planRequest(plan);
              }
              return save(() => apiClient.put('/stores/my/delivery', request));
            },
          },
        };
      }
      case 'payment':
        return {
          art: 'payment',
          title: 'How do buyers pay you?',
          text: 'Cash is easiest to start with. Add a GCash or QR Ph code so buyers can also pay online.',
          body: (
            <>
              <WelcomeSwitch
                on={form.acceptsCod}
                label="Cash on delivery or pickup"
                text="Buyers pay you when they get the order"
                onPress={() => set({ acceptsCod: !form.acceptsCod })}
              />
              <WelcomeRowLink
                label={store.paymentQrImage ? 'Your payment QR is added' : 'Add a GCash or QR Ph code'}
                text={store.paymentQrImage ? 'Change it in Payment options' : 'Upload the QR from your e-wallet app'}
                onPress={() => away('/seller/fulfillment/payment', 'payment')}
              />
              {!form.acceptsCod && !store.paymentQrImage && <WelcomeNote warn>With cash off, buyers need your QR to pay you.</WelcomeNote>}
            </>
          ),
          primary: {
            label: 'Save and continue',
            // Buyers need a way to pay: cash, or the shop's QR.
            disabled: !form.acceptsCod && !store.paymentQrImage,
            onClick: () => save(() => putStore({ acceptsCod: form.acceptsCod })),
          },
        };
      case 'product':
        return {
          art: 'product',
          title: step.done ? 'Your first product is up' : 'Add your first product',
          text: step.done
            ? 'Nice. Add more any time from My products.'
            : 'A few photos, a price and how many you have. It takes about two minutes.',
          body: null,
          primary: step.done
            ? { label: 'Continue', onClick: next }
            : { label: 'Add a product', onClick: () => away('/seller/products/new', 'done') },
        };
      default:
        return null;
    }
  };

  /* ── Frame ─────────────────────────────────────────────────────── */
  const topBar = {
    onBack: step ? back : null,
    progress: step ? PARTS.map((p, i) => {
      const inPart = steps.filter((s) => s.part === i);
      const at = inPart.findIndex((s) => s.key === step.key);
      return i < step.part ? 1 : i > step.part ? 0 : (at + 1) / inPart.length;
    }) : null,
    progressLabel: step ? `Part ${step.part + 1} of 3: ${PARTS[step.part].title}` : undefined,
    onSkip: step && REQUIRED.has(step.key) ? null : leave,
  };

  if (failed) {
    return (
      <WelcomeFrame
        screenKey="failed"
        still={still}
        top={topBar}
        footer={(
          <>
            <WelcomeButton label="Try again" onPress={() => { setFailed(false); load(); }} />
            <WelcomeButton kind="ghost" label="Seller Center" onPress={() => router.navigate('/seller')} />
          </>
        )}
      >
        <View style={styles.center}>
          <Text style={[styles.title, styles.centerText]}>We couldn&apos;t load your setup</Text>
          <Text style={[styles.text, styles.centerText]}>Check your connection and try again, or go straight to your Seller Center.</Text>
        </View>
      </WelcomeFrame>
    );
  }

  if (!form) {
    return (
      <WelcomeFrame screenKey="loading" still={still} top={null}>
        <View style={styles.center} accessibilityState={{ busy: true }}>
          <WelcomeSpinner still={still} />
        </View>
      </WelcomeFrame>
    );
  }

  // Welcome: what just happened and what comes next.
  if (current === 'intro' || (!step && current !== 'done')) {
    return (
      <WelcomeFrame
        screenKey="intro"
        still={still}
        top={topBar}
        footer={(
          <>
            <WelcomeButton label="Let's start" arrow onPress={() => go(steps[0].key)} />
            <WelcomeButton kind="text" label="Skip for now" onPress={leave} />
          </>
        )}
      >
        {art('welcome')}
        <Text style={[styles.title, styles.centerText]}>{store.name} is open for setup!</Text>
        <Text style={[styles.text, styles.centerText]}>
          The {town} admin is reviewing your shop. Meanwhile, let&apos;s get it ready to sell: about 10 minutes, one small step at a time.
        </Text>
        <View style={styles.parts}>
          {PARTS.map((p, i) => (
            <View key={p.title} style={styles.part}>
              <View style={styles.partNum}><Text style={styles.partNumText}>{i + 1}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.strong}>{p.title}</Text>
                <Text style={styles.small}>{p.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </WelcomeFrame>
    );
  }

  // All through: what is done, what waits.
  if (current === 'done') {
    const later = steps.filter((s) => skipped.has(s.key) && !s.done);
    return (
      <WelcomeFrame
        screenKey="done"
        still={still}
        top={topBar}
        footer={<WelcomeButton label="Go to my Seller Center" arrow onPress={() => router.replace('/seller')} />}
      >
        {art('ready')}
        <Text style={[styles.title, styles.centerText]}>You&apos;re ready to go!</Text>
        <Text style={[styles.text, styles.centerText]}>
          {setup?.readyToSell
            ? `Buyers can order as soon as the ${town} admin approves your shop. We'll let you know.`
            : 'A few things are still needed before buyers can order. Home lists them under "Complete your shop".'}
        </Text>
        {later.length > 0 && (
          <View style={styles.later}>
            <Text style={styles.laterTitle}>Left for later</Text>
            <View style={styles.laterItems}>
              {later.map((s) => (
                <WelcomeLaterItem key={s.key} label={LATER_LABELS[s.key] || s.key} onPress={() => go(s.key)} />
              ))}
            </View>
          </View>
        )}
      </WelcomeFrame>
    );
  }

  const s = screen();
  return (
    <WelcomeFrame
      screenKey={current}
      still={still}
      top={topBar}
      footer={(
        <>
          <WelcomeButton
            label={saving ? 'Saving…' : s.primary.label}
            arrow={!saving}
            disabled={saving || s.primary.disabled}
            onPress={s.primary.onClick}
          />
          {!step.done && !REQUIRED.has(step.key) && <WelcomeButton kind="text" label="Skip for now" onPress={skip} disabled={saving} />}
        </>
      )}
    >
      {art(s.art, true)}
      {step.done && <WelcomeBadge />}
      <Text style={styles.title}>{s.title}</Text>
      <Text style={styles.text}>{s.text}</Text>
      {REQUIRED.has(step.key) && !step.done && (
        <View style={styles.required}><Text style={styles.requiredText}>Needed before buyers can order</Text></View>
      )}
      {s.body && <View style={styles.form}>{s.body}</View>}
    </WelcomeFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  art: { alignSelf: 'center', marginBottom: 16 },

  center: { flexGrow: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },

  title: { fontSize: 23, lineHeight: 28.75, color: t.neutral[900], ...font(500) },
  text: { marginTop: 8, fontSize: 15, lineHeight: 23.25, color: t.neutral[600], ...font(400) },
  // A step buyers' orders depend on: it can't be skipped.
  required: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#fef3c7' },
  requiredText: { fontSize: 12.5, color: '#92400e', ...font(600) },
  form: { gap: 14, marginTop: 22 },

  parts: { gap: 10, marginTop: 22 },
  part: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: t.neutral[50],
  },
  partNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  partNumText: { fontSize: 14, lineHeight: 22.4, color: '#fff', ...font(600) },
  strong: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  small: { marginTop: 1, fontSize: 13, lineHeight: 18.2, color: t.neutral[500], ...font(400) },

  choices: { gap: 10 },
  fields: { gap: 12 },
  photos: { gap: 14 },

  later: {
    marginTop: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: t.neutral[50],
  },
  laterTitle: { marginBottom: 8, fontSize: 14, lineHeight: 22.4, color: t.neutral[800], ...font(500) },
  laterItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
