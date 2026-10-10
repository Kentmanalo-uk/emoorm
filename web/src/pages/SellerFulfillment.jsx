import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Link, Navigate, useLocation, useNavigate, useOutletContext, useParams,
} from 'react-router-dom';
import {
  Truck,
  MapPin,
  QrCode,
  FloppyDisk as Save,
  UploadSimple as Upload,
  Trash as Trash2,
  X,
  Plus,
  Storefront as StoreIcon,
  Check,
  CheckCircle,
  Money,
  Warning,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import { QR_METHODS, qrMethod, checkAccountNumber } from '../lib/qrPayment';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerFulfillment.css';
import { useMunicipalities } from '../hooks/useReferenceData';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSaveBar from '../components/seller/PhoneSaveBar';
import PickupAddressField from '../components/seller/PickupAddressField';
import { pickupGap } from '../lib/pickupAddress';
import StoreLocationMap from '../components/maps/StoreLocationMap';
import { validPin } from '../components/maps/PickupRoute';
import { CourierMark } from '../components/orders/CourierTracking';
import ChoiceCard from '../components/ui/ChoiceCard';
import { MOORMOVE_COURIER, promosForTown, useMoormove } from '../lib/moormove';
import useAppSettings, { DEFAULT_APP_SETTINGS } from '../hooks/useAppSettings';

// "from ₱85": a courier's cheapest fee, for the seller to compare.
const courierFrom = (c) => {
  const b = c?.rates?.brackets;
  if (!Array.isArray(b) || b.length === 0) return null;
  return Math.min(...b.map((x) => Math.min(Number(x.sameTown), Number(x.otherTown))));
};
import { SettingsList, SettingsRow } from '../components/seller/SettingsList';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { BusyLabel } from '../components/ui/Spinner';
import Select from '../components/ui/Select';

/**
 * Phones: each part of this page on a page of its own
 * (/seller/fulfillment/<part>), with the card it shows on computers.
 */
const PARTS = {
  method: { anchor: 'method' },
  pickup: { anchor: 'pickup' },
  delivery: { anchor: 'delivery-areas' },
  payment: { anchor: 'payment' },
};
// Links written for the one-page layout (/seller/fulfillment#payment).
const PART_OF_ANCHOR = {
  method: 'method',
  pickup: 'pickup',
  'delivery-areas': 'delivery',
  'delivery-fee': 'delivery',
  payment: 'payment',
};
const partPath = (part, hash = '') => `/seller/fulfillment/${part}${hash}`;

const MODE_LABELS = {
  DELIVERY: 'Delivery only',
  PICKUP: 'Pickup only',
  BOTH: 'Delivery and pickup',
};

const MODES = [
  {
    key: 'DELIVERY',
    label: 'Delivery only',
    desc: 'Buyers get orders delivered to their address.',
  },
  {
    key: 'PICKUP',
    label: 'Pickup only',
    desc: 'Buyers collect orders at your store.',
  },
  {
    key: 'BOTH',
    label: 'Both',
    desc: 'Buyers can choose delivery or pickup.',
  },
];

// PSGC (Philippine Standard Geographic Code) — free public API for Philippine locations
const PSGC_BASE = 'https://psgc.gitlab.io/api';
const ORIENTAL_MINDORO_CODE = '175200000';

/** A fee as the form holds it: '' (none set) or the amount as text. */
const feeText = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value)));

/** A form fee for the API: null (none set), a number, or undefined if invalid. */
const parseFee = (text, max = 10000) => {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return Math.round(n * 100) / 100;
};

/** A form distance for the API: null (none set), km to 0.1, or undefined if invalid. */
const parseKm = (text) => {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 10) / 10;
};

const kmLabel = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;

/** What a delivery of `km` costs at a rate: base + each km past included × perKm, to the whole peso. */
const feeAt = (rate, km) => Math.round(Math.round((rate.base + Math.max(0, km - rate.included) * rate.perKm) * 100) / 100);

// The distances the seller's preview prices.
const PREVIEW_KM = [2, 5, 10];

const pesos = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A town's delivery details: all its barangays or some. Each place keeps the
 * fee it had before delivery by distance (it still prices a shop with no pin).
 */
const emptyTown = () => ({ whole: true, fee: '', barangays: [] });

/** One answer to a question: a card with a title, a short line and a tick when chosen. */
function Choice({ name, value, checked, onPick, title, desc }) {
  return (
    <label className={`sf-mode-card ${checked ? 'is-active' : ''}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onPick(value)} />
      <span className="sf-mode-text">
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
      {checked && (
        <span className="sf-mode-check">
          <Check size={14} />
        </span>
      )}
    </label>
  );
}

const normalizeName = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/\bcity of\b/g, '')
    .replace(/\bcity\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * /seller/fulfillment, and on phones /seller/fulfillment/<part>. Each part
 * starts from the saved settings: nothing unsaved carries over between them.
 */
export default function SellerFulfillmentPage() {
  const { part } = useParams();
  return <SellerFulfillment key={part || 'all'} part={part || null} />;
}

/**
 * Computers: every part on one page, as before. Phones: the parts as a list
 * (Delivery & pickup, Pickup spot, Delivery, Payment options),
 * each on its own page with Cancel and Save changes at the bottom.
 */
function SellerFulfillment({ part }) {
  const navigate = useNavigate();
  const location = useLocation();
  const layoutCtx = useOutletContext();
  const isPhone = usePhoneLayout();
  const [store, setStore] = useState(null);
  const { municipalities } = useMunicipalities();
  // Delivery is two questions: where (coverage) and how much (feeMode).
  //   coverage: 'TOWN' (only the shop's town) | 'SOME' (towns it picks) | 'ALL' (all around Mindoro)
  //   feeMode:  'FREE' | 'PER_KM' (by distance: a starting fee covering the
  //             first km by road, then a fee for each extra km)
  // `towns` keeps each town's details ({ [municipalityId]: emptyTown() }) and
  // survives switching answers, so nothing typed is lost.
  const [coverage, setCoverage] = useState('');
  const [feeMode, setFeeMode] = useState('');
  const [towns, setTowns] = useState({});
  const [someTowns, setSomeTowns] = useState([]);
  // The saved areas, until the town list is loaded to tell which answer they match.
  const [savedAreas, setSavedAreas] = useState(null);
  // Phones: the pickup address as picked (town, barangay, street), once changed.
  const [pickupDraft, setPickupDraft] = useState(null);
  // Phones switch QR payment on and off; computers take it while a QR is up.
  const [qrOn, setQrOn] = useState(false);
  // Who delivers: the seller themselves, and/or couriers from the list the
  // super admin keeps (J&T, LBC…).
  const [courierList, setCourierList] = useState([]);
  const [shipping, setShipping] = useState({ selfDelivery: true, courierIds: [] });
  const [shippingLoaded, setShippingLoaded] = useState(false);
  // Products a courier can't price yet (no weight), and how many in all.
  const [unweighed, setUnweighed] = useState({ list: [], count: 0 });
  const loadUnweighed = useCallback(() => axios.get('/couriers/my-store')
    .then((res) => setUnweighed({ list: res.data?.unweighed || [], count: res.data?.unweighedCount || 0 }))
    .catch(() => {}), []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([axios.get('/couriers'), axios.get('/couriers/my-store')])
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
  // MoorMove riders (on by default): offered at checkout while the site has
  // them on. Kept on the shop (moormoveEnabled).
  const { enabled: ridersOn, promos: riderPromos } = useMoormove();
  const [riders, setRiders] = useState(true);
  // Why riders can't come to this shop right now (e.g. not open in its town),
  // asked once the shop has a pin: a quote from the shop to itself.
  const [riderBlock, setRiderBlock] = useState(null);
  const toggleCourier = (id) => setShipping((prev) => ({
    ...prev,
    courierIds: prev.courierIds.includes(id) ? prev.courierIds.filter((x) => x !== id) : [...prev.courierIds, id],
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // PSGC barangay cache: { [municipalityId]: { loading, error, list: [{code, name}] } }
  const [barangayCatalog, setBarangayCatalog] = useState({});
  // PSGC municipality code lookup, keyed by normalized municipality name
  const [psgcMuniIndex, setPsgcMuniIndex] = useState({});
  // 'loading' | 'ready' | 'failed': barangay lists wait for the town codes.
  const [psgcStatus, setPsgcStatus] = useState('loading');

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
    // By distance: blank km settings use the platform's.
    deliveryBaseFee: '',
    deliveryIncludedKm: '',
    deliveryPerKm: '',
    deliveryMaxKm: '',
  });
  // The platform's defaults, for blank settings and the preview.
  const { settings: appSettings } = useAppSettings();
  const platformRate = {
    base: Number(appSettings?.deliveryFee ?? DEFAULT_APP_SETTINGS.deliveryFee),
    included: Number(appSettings?.deliveryIncludedKm ?? DEFAULT_APP_SETTINGS.deliveryIncludedKm),
    perKm: Number(appSettings?.deliveryPerKm ?? DEFAULT_APP_SETTINGS.deliveryPerKm),
  };

  useEffect(() => {
    (async () => {
      try {
        const [storeRes, areasRes] = await Promise.all([
          axios.get('/stores/my/store'),
          axios.get('/stores/my/service-areas').catch(() => ({ data: [] })),
        ]);
        const s = storeRes.data;
        const saved = areasRes.data || [];
        setStore(s);

        const byTown = {};
        for (const a of saved) {
          if (!byTown[a.municipalityId]) byTown[a.municipalityId] = { whole: false, fee: '', barangays: [] };
          const t = byTown[a.municipalityId];
          if (a.barangay) t.barangays.push({ name: a.barangay, fee: feeText(a.fee) });
          else {
            t.whole = true;
            t.fee = feeText(a.fee);
          }
        }

        // How much: free, or by distance (the shop's own settings; blank
        // ones use the platform's).
        const mode = s.deliveryFeeMode === 'FREE' ? 'FREE' : 'PER_KM';

        setTowns(byTown);
        setSomeTowns(Object.keys(byTown));
        setFeeMode(mode);
        setSavedAreas(saved);
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
          deliveryBaseFee: feeText(s.deliveryBaseFee),
          deliveryIncludedKm: feeText(s.deliveryIncludedKm),
          deliveryPerKm: feeText(s.deliveryPerKm),
          deliveryMaxKm: feeText(s.deliveryMaxKm),
        });
        setRiders(s.moormoveEnabled !== false);
        setQrOn(Boolean(s.paymentQrImage));
      } catch (err) {
        toast.error(err.message || 'Failed to load store');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Where: which answer the saved areas match, once the towns are known.
  useEffect(() => {
    if (!savedAreas || !store || !municipalities.length) return;
    setSavedAreas(null);
    const ids = Object.keys(towns);
    if (!ids.length) return;
    if (municipalities.every((m) => towns[m.id]?.whole)) setCoverage('ALL');
    else if (ids.length === 1 && ids[0] === store.municipalityId) setCoverage('TOWN');
    else setCoverage('SOME');
  }, [savedAreas, store, municipalities, towns]);

  // Fetch Oriental Mindoro municipalities from PSGC once (for barangay lookups)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${PSGC_BASE}/provinces/${ORIENTAL_MINDORO_CODE}/municipalities/`
        );
        if (!res.ok) {
          setPsgcStatus('failed');
          return;
        }
        const list = await res.json();
        const cities = await fetch(
          `${PSGC_BASE}/provinces/${ORIENTAL_MINDORO_CODE}/cities/`
        ).then((r) => (r.ok ? r.json() : []));
        const index = {};
        for (const m of [...(list || []), ...(cities || [])]) {
          index[normalizeName(m.name)] = m.code;
        }
        setPsgcMuniIndex(index);
        setPsgcStatus('ready');
      } catch {
        // The page still works: barangays can be typed.
        setPsgcStatus('failed');
      }
    })();
  }, []);

  const loadBarangays = useCallback(
    async (municipalityId, municipalityName) => {
      // The town codes are still loading: the picker asks again once they arrive.
      if (!Object.keys(psgcMuniIndex).length) return;
      setBarangayCatalog((prev) => {
        if (prev[municipalityId]?.list || prev[municipalityId]?.loading) return prev;
        return { ...prev, [municipalityId]: { loading: true } };
      });
      try {
        const code = psgcMuniIndex[normalizeName(municipalityName)];
        if (!code) {
          setBarangayCatalog((prev) => ({
            ...prev,
            [municipalityId]: { error: 'Barangay list unavailable for this municipality.', list: [] },
          }));
          return;
        }
        // Try both /municipalities and /cities endpoints (PSGC splits them)
        let res = await fetch(`${PSGC_BASE}/municipalities/${code}/barangays/`);
        if (!res.ok) res = await fetch(`${PSGC_BASE}/cities/${code}/barangays/`);
        if (!res.ok) throw new Error('PSGC lookup failed');
        const data = await res.json();
        const list = (data || [])
          .map((b) => ({ code: b.code, name: b.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setBarangayCatalog((prev) => ({
          ...prev,
          [municipalityId]: { list },
        }));
      } catch {
        setBarangayCatalog((prev) => ({
          ...prev,
          [municipalityId]: { error: 'Could not load barangays.', list: [] },
        }));
      }
    },
    [psgcMuniIndex]
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadImage(file);
      setForm((p) => ({ ...p, paymentQrImage: res.url }));
      toast.success('QR image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const homeId = store?.municipalityId || '';
  const nameOf = useCallback(
    (id) => municipalities.find((m) => m.id === id)?.name || '',
    [municipalities]
  );
  const homeName = nameOf(homeId) || store?.municipality?.name || 'your town';
  const townOf = (id) => towns[id] || emptyTown();

  // The towns delivered to, in the town list's order.
  const coveredIds = useMemo(() => {
    if (coverage === 'TOWN') return homeId ? [homeId] : [];
    if (coverage === 'ALL') return municipalities.map((m) => m.id);
    if (coverage !== 'SOME') return [];
    const order = new Map(municipalities.map((m, i) => [m.id, i]));
    return [...someTowns].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  }, [coverage, homeId, municipalities, someTowns]);

  // Every place buyers can order delivery to: a whole town, or one barangay.
  const places = useMemo(() => coveredIds.flatMap((id) => {
    const t = towns[id] || emptyTown();
    if (coverage === 'ALL' || t.whole) {
      return [{ key: id, municipalityId: id, barangay: null, name: nameOf(id), sub: 'All barangays', fee: t.fee }];
    }
    return t.barangays.map((b) => ({
      key: `${id}|${b.name}`, municipalityId: id, barangay: b.name, name: b.name, sub: nameOf(id), fee: b.fee,
    }));
  }), [coveredIds, towns, coverage, nameOf]);

  const updateTown = (id, change) => setTowns((prev) => ({ ...prev, [id]: change(prev[id] || emptyTown()) }));

  const setWhole = (id, whole) => {
    updateTown(id, (t) => ({ ...t, whole }));
    if (!whole) loadBarangays(id, nameOf(id));
  };

  const addBarangay = (id, name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    updateTown(id, (t) => (t.barangays.some((b) => b.name.toLowerCase() === clean.toLowerCase())
      ? t
      : { ...t, barangays: [...t.barangays, { name: clean, fee: '' }] }));
  };

  const removeBarangay = (id, name) => updateTown(id, (t) => ({
    ...t,
    barangays: t.barangays.filter((b) => b.name.toLowerCase() !== name.toLowerCase()),
  }));

  const pickCoverage = (value) => {
    setCoverage(value);
    // "Some towns" starts from the shop's own town.
    if (value === 'SOME' && someTowns.length === 0 && homeId) setSomeTowns([homeId]);
  };

  const savedPinned = validPin(store?.latitude, store?.longitude);
  useEffect(() => {
    // Only for a shop that has riders on (saved), so the answer is about its town.
    if (!ridersOn || !store?.id || !savedPinned || store.moormoveEnabled === false) return undefined;
    let cancelled = false;
    axios.post('/moormove/quote', {
      storeId: store.id,
      lat: Number(store.latitude),
      lng: Number(store.longitude),
      items: [],
    }, { quiet: true })
      .then((res) => { if (!cancelled) setRiderBlock(res.data && res.data.available === false ? (res.data.reason || null) : null); })
      .catch(() => { if (!cancelled) setRiderBlock(null); });
    return () => { cancelled = true; };
  }, [ridersOn, store?.id, store?.latitude, store?.longitude, store?.moormoveEnabled, savedPinned]);

  const toggleTown = (id) => setSomeTowns((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const showDeliveryAreas = form.fulfillmentMode === 'DELIVERY' || form.fulfillmentMode === 'BOTH';
  const showPickup = form.fulfillmentMode === 'PICKUP' || form.fulfillmentMode === 'BOTH';
  const pickupPinned = validPin(form.latitude, form.longitude);
  const [pinError, setPinError] = useState('');

  // A part's own settings, to tell whether its page changed anything.
  const partState = (p) => JSON.stringify(
    p === 'method' ? [form.fulfillmentMode]
      : p === 'pickup' ? [form.pickupAddress.trim(), form.pickupInstructions.trim(), form.latitude, form.longitude]
        : p === 'payment' ? [form.acceptsCod, qrOn, ...(qrOn ? [
          form.paymentQrImage, form.paymentQrType, form.paymentAccountName.trim(),
          form.paymentAccountNumber.replace(/[\s-]/g, ''), form.paymentInstructions.trim(),
        ] : [])]
          : [coverage, feeMode, feeMode === 'PER_KM'
            ? [form.deliveryBaseFee, form.deliveryIncludedKm, form.deliveryPerKm, form.deliveryMaxKm].map((v) => String(v).trim())
            : null,
            places.map((pl) => [pl.municipalityId, pl.barangay]),
            shipping.selfDelivery, [...shipping.courierIds].sort(), ridersOn ? riders : null,
            !showPickup ? [form.latitude, form.longitude] : null],
  );
  const partReady = !loading && (part !== 'delivery' || (!savedAreas && shippingLoaded));
  const [baseline, setBaseline] = useState(null);
  useEffect(() => {
    if (part && partReady && baseline === null) setBaseline(partState(part));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, partReady, baseline]);
  const dirty = baseline !== null && partState(part) !== baseline;

  // Back to where the part was opened from (the list, Me, Shop setup…).
  const leave = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/seller/fulfillment', { replace: true });
  };

  /**
   * @param {String} [scope] - 'all' (the one-page layout) or the part being
   *   saved: only its settings are checked and sent.
   */
  const saveSettings = async (scope = 'all') => {
    if (!store) return;
    const has = (p) => scope === 'all' || scope === p;
    // Saving before the saved areas are matched to an answer would clear them.
    if (has('delivery') && savedAreas) {
      toast.error('Your delivery areas are still loading. Try again in a moment.');
      return;
    }
    // Validation
    if (has('pickup') && showPickup && !form.pickupAddress.trim()) {
      toast.error('Please provide a pickup address.');
      return;
    }
    // Phones pick the address: the barangay and a street or landmark as well.
    const pickupProblem = has('pickup') && showPickup && pickupDraft ? pickupGap(pickupDraft) : null;
    if (pickupProblem) {
      toast.error(pickupProblem);
      return;
    }
    // Buyers who pick up see the way from where they are to this pin.
    if (has('pickup') && showPickup && !pickupPinned) {
      setPinError('Pin your pickup spot on the map.');
      toast.error('Pin your pickup spot on the map so buyers can find it.');
      document.getElementById('pickup-pin')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Delivery answers are checked while delivery is on; with pickup only they are kept as they are.
    if (has('delivery') && showDeliveryAreas && shipping.selfDelivery) {
      if (coverage === 'SOME' && coveredIds.length === 0) {
        toast.error('Tap at least one town you deliver to.');
        return;
      }
      const noBarangay = coverage && coverage !== 'ALL'
        ? coveredIds.find((id) => !townOf(id).whole && townOf(id).barangays.length === 0)
        : null;
      if (noBarangay) {
        toast.error(`Pick the barangays you deliver to in ${nameOf(noBarangay)}, or choose All barangays.`);
        return;
      }
      if (!feeMode) {
        toast.error('Choose free delivery or a fee by distance.');
        return;
      }
      if (feeMode === 'PER_KM') {
        const max = parseKm(form.deliveryMaxKm);
        const problem = parseFee(form.deliveryBaseFee, 5000) == null ? 'Enter your starting fee (₱0 to ₱5,000).'
          : parseKm(form.deliveryIncludedKm) === undefined ? 'The km included must be 0 to 100.'
            : parseFee(form.deliveryPerKm, 5000) === undefined ? 'Each extra km must cost ₱0 to ₱5,000.'
              : max === undefined || (max !== null && max < 0.5) ? 'The farthest distance must be 0.5 to 100 km, or left blank.'
                : null;
        if (problem) {
          toast.error(problem);
          document.getElementById('delivery-fee')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    }
    // QR payment needs the QR, and the account buyers pay to.
    const qr = scope === 'payment' ? qrOn : Boolean(form.paymentQrImage);
    if (has('payment')) {
      const method = qrMethod(form.paymentQrType);
      let problem = null;
      if (!form.acceptsCod && !qr) problem = 'Accept cash on delivery or add a QR code so buyers can pay.';
      else if (qr && !form.paymentQrImage) problem = `Upload your ${method.label} QR code so buyers can scan it.`;
      else if (qr && !form.paymentAccountName.trim()) problem = `Enter the name on your ${method.label} account.`;
      else if (qr && !form.paymentAccountNumber.trim()) {
        problem = method.key === 'GCASH' ? 'Enter your GCash number.' : 'Enter your account number.';
      } else if (qr || scope === 'all') {
        // Computers send the account even with no QR up: a typed number is checked either way.
        problem = checkAccountNumber(form.paymentAccountNumber, form.paymentQrType).error;
      }
      if (problem) {
        toast.error(problem);
        return;
      }
    }

    // The fee by distance lives on the shop; blank km settings are the platform's.
    const deliveryRate = feeMode === 'FREE'
      ? { deliveryFeeMode: 'FREE' }
      : feeMode === 'PER_KM'
        ? {
          deliveryFeeMode: 'PER_KM',
          deliveryBaseFee: parseFee(form.deliveryBaseFee, 5000) ?? null,
          deliveryIncludedKm: parseKm(form.deliveryIncludedKm) ?? null,
          deliveryPerKm: parseFee(form.deliveryPerKm, 5000) ?? null,
          deliveryMaxKm: parseKm(form.deliveryMaxKm) ?? null,
        }
        : {};
    // Places keep the fee they had (it only prices a shop with no pin yet).
    const areas = places.map((p) => ({
      municipalityId: p.municipalityId,
      barangay: p.barangay,
      fee: parseFee(p.fee) ?? null,
    }));
    // The form's text boxes go as numbers (deliveryRate), never as typed.
    const formFields = { ...form };
    for (const key of ['deliveryBaseFee', 'deliveryIncludedKm', 'deliveryPerKm', 'deliveryMaxKm']) delete formFields[key];
    // A part's page sends only its own settings, so it never touches the others.
    const changes = {
      all: { ...formFields, ...deliveryRate, ...(ridersOn ? { moormoveEnabled: riders } : {}) },
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
      delivery: {
        ...deliveryRate,
        ...(ridersOn ? { moormoveEnabled: riders } : {}),
        // The shop pin (riders and fees by distance start there).
        ...(!showPickup && pickupPinned ? { latitude: form.latitude, longitude: form.longitude } : {}),
      },
    }[scope];

    if (has('delivery') && showDeliveryAreas && !shipping.selfDelivery && shipping.courierIds.length === 0) {
      toast.error('Choose a courier, or deliver orders yourself.');
      return;
    }

    setSaving(true);
    try {
      const res = await axios.put(`/stores/${store.id}`, changes);
      if (has('delivery')) {
        await axios.put('/stores/my/service-areas', { areas });
        if (shippingLoaded) await axios.put('/couriers/my-store', shipping);
      }
      // Me and Home show what is saved now (and so does the riders check here).
      setStore((prev) => (prev && res.data ? { ...prev, ...res.data } : prev));
      layoutCtx?.setStore?.((prev) => (prev ? { ...prev, ...res.data } : prev));
      layoutCtx?.refreshSetup?.();
      // "Some towns" starts from what is saved now, as it would after a reload.
      if (coverage) setSomeTowns(coveredIds);
      if (scope === 'all') {
        toast.success('Settings saved');
        return;
      }
      // A new way to hand orders over may need its part set up next.
      const next = scope !== 'method' ? null
        : showPickup && (!form.pickupAddress.trim() || !pickupPinned) ? 'pickup'
          : showDeliveryAreas && !places.length ? 'delivery' : null;
      if (next) {
        toast.success(next === 'pickup' ? 'Saved. Now add your pickup spot.' : 'Saved. Now choose where you deliver.');
        navigate(partPath(next), { replace: true });
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

  // By distance as the seller has it now, blanks filled in from the
  // platform's: { base, included, perKm, max }, or null while a box is wrong.
  const effectiveRate = (() => {
    if (feeMode !== 'PER_KM') return null;
    const base = parseFee(form.deliveryBaseFee, 5000);
    const included = parseKm(form.deliveryIncludedKm);
    const perKm = parseFee(form.deliveryPerKm, 5000);
    const max = parseKm(form.deliveryMaxKm);
    if (base === undefined || included === undefined || perKm === undefined || max === undefined) return null;
    return {
      base: base ?? platformRate.base,
      included: included ?? platformRate.included,
      perKm: perKm ?? platformRate.perKm,
      max: max || null,
    };
  })();

  // The answers in one sentence, so the seller can check them.
  const summary = (() => {
    if (!coverage || !feeMode || !places.length) return null;
    const home = townOf(homeId);
    const where = coverage === 'ALL'
      ? 'anywhere in Oriental Mindoro'
      : coverage === 'TOWN'
        ? (home.whole ? `anywhere in ${homeName}` : `in ${plural(places.length, 'barangay')} of ${homeName}`)
        : `in ${plural(coveredIds.length, 'town')}`;
    const rate = effectiveRate;
    const cost = feeMode === 'FREE'
      ? 'get free delivery'
      : rate
        ? `pay ${pesos(rate.base)} for the first ${kmLabel(rate.included)} by road, then ${pesos(rate.perKm)} for each extra km${
          rate.max != null ? ` (up to ${kmLabel(rate.max)})` : ''}`
        : null;
    if (!cost) return null;
    return `Buyers ${where} ${cost}.${showPickup ? ' Pickup is always free.' : ''}`;
  })();

  const townPanel = (id) => {
    const t = townOf(id);
    const name = nameOf(id);
    return (
      <div key={id} className="sf-area-card sf-town">
        <div className="sf-area-title">
          <MapPin size={15} weight="fill" />
          <strong>{name}</strong>
        </div>
        <div className="sf-area-toggle" role="radiogroup" aria-label={`Barangays in ${name}`}>
          <label className="sf-radio">
            <input type="radio" name={`brgy-${id}`} checked={t.whole} onChange={() => setWhole(id, true)} />
            <span>All barangays</span>
          </label>
          <label className="sf-radio">
            <input type="radio" name={`brgy-${id}`} checked={!t.whole} onChange={() => setWhole(id, false)} />
            <span>Only some barangays</span>
          </label>
        </div>
        {!t.whole && (
          <BarangayPicker
            townName={name}
            psgcStatus={psgcStatus}
            catalog={barangayCatalog[id]}
            selected={t.barangays}
            onLoad={() => loadBarangays(id, name)}
            onAdd={(b) => addBarangay(id, b)}
            onRemove={(b) => removeBarangay(id, b)}
          />
        )}
      </div>
    );
  };

  // Parts have their own pages on phones only: computers show every part on
  // one page (scrolled to the part), and phones turn one-page links
  // (/seller/fulfillment#payment) into the part's page.
  if (part && !PARTS[part]) return <Navigate to="/seller/fulfillment" replace />;
  if (part && !isPhone) {
    return <Navigate to={`/seller/fulfillment${location.hash || `#${PARTS[part].anchor}`}`} replace />;
  }
  const anchorPart = PART_OF_ANCHOR[location.hash.slice(1)];
  if (!part && isPhone && anchorPart) {
    return <Navigate to={partPath(anchorPart, location.hash === '#delivery-fee' ? '#delivery-fee' : '')} replace />;
  }

  if (loading) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
            className="sf-head"
            title="Fulfillment & Payment"
            subtitle="Configure how buyers receive and pay for their orders."
          />
          <div className="seller-card">
            <div className="sf-body sf-loading">Loading store settings…</div>
          </div>
        </div>
      </div>
    );
  }

  // The parts, as cards: all on one page on computers, one per page on phones.
  const methodCard = (
        <div className="seller-card" id="method">
          <div className="seller-card-header">
            <h2>
              <Truck size={16} /> Fulfillment Method
            </h2>
          </div>
          <div className="sf-body">
            <div className="sf-mode-grid">
              {MODES.map((m) => {
                const active = form.fulfillmentMode === m.key;
                return (
                  <label
                    key={m.key}
                    className={`sf-mode-card ${active ? 'is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="fulfillmentMode"
                      value={m.key}
                      checked={active}
                      onChange={handleChange}
                    />
                    <span className="sf-mode-text">
                      <strong>{m.label}</strong>
                      <small>{m.desc}</small>
                    </span>
                    {active && (
                      <span className="sf-mode-check">
                        <Check size={14} />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
  );

  const pickupCard = (
          <div className="seller-card" id="pickup">
            <div className="seller-card-header">
              <h2>
                <StoreIcon size={16} /> Pickup Location
              </h2>
            </div>
            <div className="sf-body">
              <div className="form-group">
                <label>
                  Pickup address <span className="required">*</span>
                </label>
                {isPhone ? (
                  <PickupAddressField
                    value={form.pickupAddress}
                    shopTown={store?.municipality?.name}
                    municipalities={municipalities}
                    onChange={(text, parts) => {
                      setForm((p) => ({ ...p, pickupAddress: text }));
                      setPickupDraft(parts);
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    name="pickupAddress"
                    value={form.pickupAddress}
                    onChange={handleChange}
                    placeholder="e.g. 123 Rizal St., Brgy. Poblacion, Calapan City"
                    className="form-input"
                  />
                )}
              </div>
              <div className={`form-group sf-pin${pinError ? ' has-error' : ''}`} id="pickup-pin">
                <label>
                  Pin your pickup spot <span className="required">*</span>
                </label>
                <p className="sf-pin-help">
                  {pickupPinned
                    ? 'Buyers who pick up see the way here from where they are. Drag the pin if the spot moves.'
                    : 'Tap the map where buyers collect their orders, or use your location.'}
                </p>
                <StoreLocationMap
                  value={{ latitude: form.latitude, longitude: form.longitude }}
                  onChange={({ latitude, longitude }) => {
                    setForm((p) => ({ ...p, latitude, longitude }));
                    setPinError('');
                  }}
                  height={isPhone ? 240 : 300}
                  lockToPhilippines
                  hint="Tap the map where buyers collect their orders."
                />
                {pinError && <span className="form-error">{pinError}</span>}
              </div>
              <div className="form-group">
                <label>Pickup instructions (optional)</label>
                <textarea
                  name="pickupInstructions"
                  value={form.pickupInstructions}
                  onChange={handleChange}
                  rows={3}
                  className="form-input form-textarea"
                  placeholder="Opening hours, landmarks, contact person…"
                />
              </div>
            </div>
          </div>
  );

  const deliveryCard = (
          <div className="seller-card" id="delivery-areas">
            <div className="seller-card-header">
              <h2>
                <Truck size={16} /> Delivery
              </h2>
            </div>
            <div className="sf-body">
              <section className="sf-q" id="delivery-couriers" aria-labelledby="sf-q-who">
                <h3 className="sf-q-title" id="sf-q-who">
                  <span className="sf-q-num" aria-hidden="true">1</span> Who delivers your orders?
                </h3>
                <p className="sf-hint sf-hint-lead">
                  Tick all that apply. Buyers choose at checkout and see each courier's fee for their parcel's weight.
                </p>
                <div className="sf-couriers">
                  <ChoiceCard
                    type="checkbox"
                    name="self-delivery"
                    value="SELF"
                    checked={shipping.selfDelivery}
                    onChange={() => setShipping((prev) => ({ ...prev, selfDelivery: !prev.selfDelivery }))}
                    media={<span className="sf-courier-self"><Truck size={18} weight="fill" /></span>}
                    title="I deliver myself"
                    desc="Your own delivery fee · cash on delivery allowed"
                  />
                  {ridersOn && (
                    <ChoiceCard
                      type="checkbox"
                      name="moormove"
                      value="MOORMOVE"
                      checked={riders}
                      onChange={() => setRiders((v) => !v)}
                      media={<CourierMark courier={MOORMOVE_COURIER} size={30} />}
                      title="MoorMove"
                      desc={`Local riders pick up at your shop · fee by distance, paid by the buyer · cash on delivery OK${
                        promosForTown(riderPromos, store?.municipalityId).length ? ' · Free delivery promo running now' : ''}`}
                    />
                  )}
                  {courierList.map((c) => {
                    const from = courierFrom(c);
                    return (
                      <ChoiceCard
                        key={c.id}
                        type="checkbox"
                        name="couriers"
                        value={c.id}
                        checked={shipping.courierIds.includes(c.id)}
                        disabled={!shipping.courierIds.includes(c.id) && (from == null || unweighed.count > 0)}
                        onChange={() => toggleCourier(c.id)}
                        media={<CourierMark courier={c} size={30} />}
                        title={c.name}
                        desc={from == null ? 'Rates not set yet' : `From ₱${from} · paid online by the buyer`}
                      />
                    );
                  })}
                </div>
                {ridersOn && (
                  <div className="sf-riders">
                    {riders && (
                      <p className="sf-hint sf-rider-help">
                        Buyers can choose a MoorMove rider at checkout. When an order is packed, tap Call a rider: a rider picks it up at your shop pin.
                        The buyer pays the delivery fee, worked out by distance. With cash on delivery, the rider collects from the buyer and brings the item money back to you.
                      </p>
                    )}
                    {riders && !pickupPinned && (
                      <p className="sf-courier-warn sf-rider-warn" role="status">
                        <Warning size={15} weight="fill" />
                        <span>
                          Riders pick up at your shop pin, and your shop has none yet.{' '}
                          {showPickup
                            ? (isPhone
                              ? <Link to={partPath('pickup')}>Pin your shop in Pickup Location</Link>
                              : <a href="#pickup-pin">Pin your shop in Pickup Location</a>)
                            : 'Pin it on the map below.'}
                        </span>
                      </p>
                    )}
                    {riders && !showPickup && (
                      <div className="form-group sf-pin sf-rider-pin">
                        <label>Your shop pin</label>
                        <p className="sf-pin-help">Where riders pick up your orders. Drag the pin if the spot moves.</p>
                        <StoreLocationMap
                          value={{ latitude: form.latitude, longitude: form.longitude }}
                          onChange={({ latitude, longitude }) => setForm((prev) => ({ ...prev, latitude, longitude }))}
                          height={isPhone ? 220 : 260}
                          lockToPhilippines
                          hint="Tap the map where riders pick up your orders."
                        />
                      </div>
                    )}
                    {riders && pickupPinned && riderBlock && (
                      <p className="sf-courier-warn sf-rider-warn" role="status">
                        <Warning size={15} weight="fill" />
                        <span>{riderBlock}. Buyers can choose a rider once it is.</span>
                      </p>
                    )}
                  </div>
                )}
                {unweighed.count > 0 && (
                  <WeightFixer products={unweighed.list} total={unweighed.count} onSaved={loadUnweighed} />
                )}
                {shipping.courierIds.length > 0 && !form.paymentQrImage && (
                  <p className="sf-courier-warn" role="status">
                    Courier orders are paid online, so buyers can only choose a courier once you add your GCash or QR Ph in Payment options.
                  </p>
                )}
              </section>

              {shipping.selfDelivery ? (
                <>
              <section className="sf-q" aria-labelledby="sf-q-where">
                <h3 className="sf-q-title" id="sf-q-where">
                  <span className="sf-q-num" aria-hidden="true">2</span> Where do you deliver?
                </h3>
                <div className="sf-mode-grid" role="radiogroup" aria-labelledby="sf-q-where">
                  <Choice
                    name="coverage"
                    value="TOWN"
                    checked={coverage === 'TOWN'}
                    onPick={pickCoverage}
                    title={`Only in ${homeName}`}
                    desc="Anywhere in your town, or just some barangays."
                  />
                  <Choice
                    name="coverage"
                    value="SOME"
                    checked={coverage === 'SOME'}
                    onPick={pickCoverage}
                    title="Some towns"
                    desc="Choose the towns you deliver to."
                  />
                  <Choice
                    name="coverage"
                    value="ALL"
                    checked={coverage === 'ALL'}
                    onPick={pickCoverage}
                    title="All around Mindoro"
                    desc={`All ${municipalities.length || 15} towns of Oriental Mindoro.`}
                  />
                </div>

                {coverage === 'TOWN' && homeId && townPanel(homeId)}

                {coverage === 'SOME' && (
                  <>
                    <p className="sf-hint sf-hint-lead">Tap the towns you deliver to.</p>
                    <div className="sf-town-chips">
                      {municipalities.map((m) => {
                        const on = someTowns.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`sf-town-chip${on ? ' is-on' : ''}`}
                            aria-pressed={on}
                            onClick={() => toggleTown(m.id)}
                          >
                            {on ? <Check size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                    {coveredIds.map(townPanel)}
                  </>
                )}

                {coverage === 'ALL' && (
                  <p className="sf-all">
                    <CheckCircle size={18} weight="fill" /> Buyers in every town of Oriental Mindoro can order delivery.
                  </p>
                )}
              </section>

              <section className="sf-q" id="delivery-fee" aria-labelledby="sf-q-fee">
                <h3 className="sf-q-title" id="sf-q-fee">
                  <span className="sf-q-num" aria-hidden="true">3</span> How much is your delivery fee?
                </h3>
                <div className="sf-mode-grid sf-fee-modes" role="radiogroup" aria-labelledby="sf-q-fee">
                  <Choice
                    name="feeMode"
                    value="FREE"
                    checked={feeMode === 'FREE'}
                    onPick={setFeeMode}
                    title="Free delivery"
                    desc="Buyers pay nothing for delivery."
                  />
                  <Choice
                    name="feeMode"
                    value="PER_KM"
                    checked={feeMode === 'PER_KM'}
                    onPick={(value) => {
                      setFeeMode(value);
                      // Start from the platform's starting fee, ready to change.
                      setForm((p) => (String(p.deliveryBaseFee).trim() === '' ? { ...p, deliveryBaseFee: String(platformRate.base) } : p));
                    }}
                    title="By distance"
                    desc="A starting fee, then a fee for each extra km by road."
                  />
                </div>

                {feeMode === 'PER_KM' && (
                  <div className="sf-perkm">
                    <div className="sf-perkm-grid">
                      <label className="sf-perkm-field" htmlFor="sf-base-fee">
                        <span className="sf-perkm-label">Starting fee</span>
                        <span className="sf-fee-box">
                          <span className="sf-fee-peso" aria-hidden="true">₱</span>
                          <input
                            id="sf-base-fee"
                            type="number"
                            min="0"
                            max="5000"
                            step="1"
                            inputMode="decimal"
                            placeholder={String(platformRate.base)}
                            value={form.deliveryBaseFee}
                            onChange={(e) => setForm((p) => ({ ...p, deliveryBaseFee: e.target.value }))}
                          />
                        </span>
                        <small>Covers the first {kmLabel(effectiveRate?.included ?? platformRate.included)}</small>
                      </label>
                      <label className="sf-perkm-field" htmlFor="sf-included-km">
                        <span className="sf-perkm-label">First km included</span>
                        <span className="sf-fee-box sf-km-box">
                          <input
                            id="sf-included-km"
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            inputMode="decimal"
                            placeholder={String(platformRate.included)}
                            value={form.deliveryIncludedKm}
                            onChange={(e) => setForm((p) => ({ ...p, deliveryIncludedKm: e.target.value }))}
                          />
                          <span className="sf-fee-unit" aria-hidden="true">km</span>
                        </span>
                        <small>Blank: {kmLabel(platformRate.included)}</small>
                      </label>
                      <label className="sf-perkm-field" htmlFor="sf-per-km">
                        <span className="sf-perkm-label">Each extra km</span>
                        <span className="sf-fee-box">
                          <span className="sf-fee-peso" aria-hidden="true">₱</span>
                          <input
                            id="sf-per-km"
                            type="number"
                            min="0"
                            max="5000"
                            step="0.5"
                            inputMode="decimal"
                            placeholder={String(platformRate.perKm)}
                            value={form.deliveryPerKm}
                            onChange={(e) => setForm((p) => ({ ...p, deliveryPerKm: e.target.value }))}
                          />
                        </span>
                        <small>Blank: {pesos(platformRate.perKm)}</small>
                      </label>
                      <label className="sf-perkm-field" htmlFor="sf-max-km">
                        <span className="sf-perkm-label">Farthest distance <em>(optional)</em></span>
                        <span className="sf-fee-box sf-km-box">
                          <input
                            id="sf-max-km"
                            type="number"
                            min="0.5"
                            max="100"
                            step="0.5"
                            inputMode="decimal"
                            placeholder="No limit"
                            value={form.deliveryMaxKm}
                            onChange={(e) => setForm((p) => ({ ...p, deliveryMaxKm: e.target.value }))}
                          />
                          <span className="sf-fee-unit" aria-hidden="true">km</span>
                        </span>
                        <small>Farther buyers can&apos;t choose your delivery</small>
                      </label>
                    </div>
                    {effectiveRate && (
                      <p className="sf-perkm-preview" role="status">
                        <span>What buyers pay:</span>{' '}
                        {PREVIEW_KM.map((km, i) => (
                          <span key={km} className="sf-perkm-step">
                            {i > 0 && <span aria-hidden="true"> · </span>}
                            {kmLabel(km)}{' '}
                            <strong>
                              {effectiveRate.max != null && km > effectiveRate.max ? 'too far' : pesos(feeAt(effectiveRate, km))}
                            </strong>
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="sf-hint">
                      Worked out by road, from your shop pin to the buyer&apos;s pin. Buyers see the km and the fee at checkout.
                    </p>
                  </div>
                )}

                {feeMode === 'PER_KM' && !pickupPinned && (
                  <p className="sf-courier-warn sf-rider-warn sf-perkm-pin" role="status">
                    <Warning size={15} weight="fill" />
                    <span>
                      Pin your shop on the map so the fee can be worked out by distance. Until then, buyers pay a flat fee.{' '}
                      {showPickup
                        ? (isPhone
                          ? <Link to={partPath('pickup')}>Pin your shop in Pickup Location</Link>
                          : <a href="#pickup-pin">Pin your shop in Pickup Location</a>)
                        : (ridersOn && riders ? 'Pin it on the map above.' : 'Pin it on the map below.')}
                    </span>
                  </p>
                )}
                {feeMode === 'PER_KM' && !showPickup && !(ridersOn && riders) && (
                  <div className="form-group sf-pin sf-rider-pin">
                    <label>Your shop pin</label>
                    <p className="sf-pin-help">Delivery distances start here. Drag the pin if the spot moves.</p>
                    <StoreLocationMap
                      value={{ latitude: form.latitude, longitude: form.longitude }}
                      onChange={({ latitude, longitude }) => setForm((prev) => ({ ...prev, latitude, longitude }))}
                      height={isPhone ? 220 : 260}
                      lockToPhilippines
                      hint="Tap the map where your deliveries start."
                    />
                  </div>
                )}
              </section>

                </>
              ) : (
                <p className="sf-courier-auto" role="status">
                  <CheckCircle size={18} weight="fill" />
                  <span>
                    <strong>No delivery fee to type.</strong> Couriers deliver all around Oriental Mindoro, and the
                    shipping fee is worked out from each product&apos;s weight and the courier&apos;s rates. Buyers pay it
                    online with the order.
                  </span>
                </p>
              )}

              {summary && shipping.selfDelivery && (
                <p className="sf-summary" role="status">
                  <CheckCircle size={18} weight="fill" /> {summary}
                </p>
              )}
            </div>
          </div>
  );

  // Payment: the QR buyers scan, and the account it pays into.
  const qrKind = qrMethod(form.paymentQrType);
  const qrFile = (
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onChange={handleQrUpload}
      disabled={uploading}
      hidden
    />
  );

  // Phones: each way to pay is a card to switch on; QR payment opens up to
  // pick GCash or QR Ph and fill in its account.
  const cashLabel = form.fulfillmentMode === 'PICKUP' ? 'Cash on pickup' : 'Cash on delivery';
  const phonePaymentCard = (
    <div className="seller-card" id="payment">
      <div className="seller-card-header">
        <h2>
          <QrCode size={16} /> Payment Options
        </h2>
      </div>
      <div className="sf-body sf-pay">
        <p className="sf-pay-lead">Choose how buyers can pay you.</p>

        <section className={`sf-pay-way${form.acceptsCod ? ' is-on' : ''}`}>
          <label className="sf-pay-head">
            <Money size={28} weight="fill" className="sf-pay-icon is-cash" />
            <span className="sf-pay-text">
              <strong>{cashLabel}</strong>
              <small>Buyers pay in cash when they get their order.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              name="acceptsCod"
              aria-label={cashLabel}
              checked={form.acceptsCod}
              onChange={handleChange}
            />
            <span className="sf-switch" aria-hidden="true"><span /></span>
          </label>
        </section>

        <section className={`sf-pay-way${qrOn ? ' is-on' : ''}`}>
          <label className="sf-pay-head">
            <QrCode size={28} weight="fill" className="sf-pay-icon is-qr" />
            <span className="sf-pay-text">
              <strong>QR payment</strong>
              <small>Buyers scan your GCash or QR Ph code to pay.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="QR payment"
              checked={qrOn}
              onChange={(e) => setQrOn(e.target.checked)}
            />
            <span className="sf-switch" aria-hidden="true"><span /></span>
          </label>

          {qrOn && (
            <div className="sf-pay-body">
              <div className="sf-pay-field">
                <span className="sf-pay-label" id="sf-qr-kind">Which QR do you have?</span>
                <div className="sf-qr-kinds" role="radiogroup" aria-labelledby="sf-qr-kind">
                  {QR_METHODS.map((m) => {
                    const active = form.paymentQrType === m.key;
                    return (
                      <label key={m.key} className={`sf-qr-kind${active ? ' is-active' : ''}`}>
                        <input
                          type="radio"
                          name="paymentQrType"
                          value={m.key}
                          aria-label={m.label}
                          checked={active}
                          onChange={handleChange}
                        />
                        <img src={m.logo} alt="" />
                        {active && (
                          <span className="sf-qr-kind-check" aria-hidden="true">
                            <Check size={12} weight="bold" />
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="sf-pay-field">
                <label className="sf-pay-label" htmlFor="sf-pay-name">Account name</label>
                <input
                  id="sf-pay-name"
                  type="text"
                  name="paymentAccountName"
                  value={form.paymentAccountName}
                  onChange={handleChange}
                  maxLength={120}
                  autoComplete="name"
                  placeholder={`Name on your ${qrKind.label} account`}
                  className="form-input"
                />
              </div>
              <div className="sf-pay-field">
                <label className="sf-pay-label" htmlFor="sf-pay-number">{qrKind.numberLabel}</label>
                <input
                  id="sf-pay-number"
                  type="text"
                  name="paymentAccountNumber"
                  value={form.paymentAccountNumber}
                  onChange={handleChange}
                  maxLength={24}
                  inputMode={qrKind.key === 'GCASH' ? 'tel' : 'numeric'}
                  autoComplete={qrKind.key === 'GCASH' ? 'tel' : 'off'}
                  placeholder={qrKind.numberPlaceholder}
                  className="form-input"
                />
                <small className="sf-pay-help">Buyers see this name and number beside your QR, so they know they are paying you.</small>
              </div>

              <div className="sf-pay-field">
                <span className="sf-pay-label">Your {qrKind.label} QR code</span>
                {form.paymentQrImage ? (
                  <div className="sf-qr-card">
                    <img src={resolveImg(form.paymentQrImage)} alt={`${qrKind.label} QR code`} />
                    <div className="sf-qr-card-actions">
                      <label className="sf-qr-action">
                        <Upload size={16} /> {uploading ? 'Uploading…' : 'Change'}
                        {qrFile}
                      </label>
                      <button
                        type="button"
                        className="sf-qr-action is-remove"
                        onClick={() => setForm((p) => ({ ...p, paymentQrImage: '' }))}
                      >
                        <Trash2 size={16} /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="sf-qr-drop">
                    <Upload size={24} />
                    <strong>{uploading ? 'Uploading…' : `Upload your ${qrKind.label} QR`}</strong>
                    <small>
                      {qrKind.key === 'GCASH'
                        ? 'Save your QR from the GCash app, then add it here.'
                        : 'Save your QR Ph code from your bank or e-wallet app, then add it here.'}
                    </small>
                    {qrFile}
                  </label>
                )}
              </div>

              <div className="sf-pay-field">
                <label className="sf-pay-label" htmlFor="sf-pay-note">
                  Note to buyers <span className="sf-pay-optional">(optional)</span>
                </label>
                <textarea
                  id="sf-pay-note"
                  name="paymentInstructions"
                  value={form.paymentInstructions}
                  onChange={handleChange}
                  rows={3}
                  className="form-input form-textarea"
                  placeholder="e.g. Include your order number as the payment reference."
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  const desktopPaymentCard = (
        <div className="seller-card" id="payment">
          <div className="seller-card-header">
            <h2>
              <QrCode size={16} /> Payment Options
            </h2>
          </div>
          <div className="sf-body">
            <div className="form-group form-toggle">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  name="acceptsCod"
                  checked={form.acceptsCod}
                  onChange={handleChange}
                />
                <span className="toggle-text">
                  <strong>Accept Cash on Delivery / Pickup</strong>
                  <small>Buyers pay in cash when they receive the order.</small>
                </span>
              </label>
            </div>

            <div className="sf-divider" />

            <div className="sf-payment-grid">
              <div className="form-group">
                <label>QR type</label>
                <Select
                  aria-label="QR type"
                  name="paymentQrType"
                  value={form.paymentQrType}
                  onChange={handleChange}
                  className="form-input"
                >
                  {QR_METHODS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="form-group">
                <label>QR code image</label>
                {form.paymentQrImage ? (
                  <div className="sf-qr-preview">
                    <img
                      src={resolveImg(form.paymentQrImage)}
                      alt="Payment QR"
                    />
                    <button
                      type="button"
                      className="btn-seller-outline"
                      onClick={() =>
                        setForm((p) => ({ ...p, paymentQrImage: '' }))
                      }
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                ) : (
                  <label className="sf-qr-uploader">
                    <Upload size={16} />
                    <span>{uploading ? 'Uploading…' : 'Upload QR image'}</span>
                    {qrFile}
                  </label>
                )}
              </div>
            </div>

            <div className="sf-account-grid">
              <div className="form-group">
                <label htmlFor="sf-account-name">Account name</label>
                <input
                  id="sf-account-name"
                  type="text"
                  name="paymentAccountName"
                  value={form.paymentAccountName}
                  onChange={handleChange}
                  maxLength={120}
                  placeholder={`Name on your ${qrKind.label} account`}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="sf-account-number">{qrKind.numberLabel}</label>
                <input
                  id="sf-account-number"
                  type="text"
                  name="paymentAccountNumber"
                  value={form.paymentAccountNumber}
                  onChange={handleChange}
                  maxLength={24}
                  inputMode={qrKind.key === 'GCASH' ? 'tel' : 'numeric'}
                  placeholder={qrKind.numberPlaceholder}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Payment instructions (optional)</label>
              <textarea
                name="paymentInstructions"
                value={form.paymentInstructions}
                onChange={handleChange}
                rows={3}
                className="form-input form-textarea"
                placeholder="e.g. Include your order number as the payment reference."
              />
            </div>
          </div>
        </div>
  );

  const paymentCard = isPhone ? phonePaymentCard : desktopPaymentCard;

  // Phones, the list: each part with what is set now; the parts buyers need
  // before the shop can sell say so while they are missing.
  if (isPhone && !part) {
    const where = coverage === 'ALL'
      ? 'All around Mindoro'
      : coverage === 'TOWN'
        ? (townOf(homeId).whole ? `Only in ${homeName}` : `${plural(places.length, 'barangay')} in ${homeName}`)
        : coverage === 'SOME' ? plural(coveredIds.length, 'town') : '';
    const cost = feeMode === 'FREE'
      ? 'Free delivery'
      : feeMode === 'PER_KM' && parseFee(form.deliveryBaseFee, 5000) != null && effectiveRate
        ? `${pesos(effectiveRate.base)} + ${pesos(effectiveRate.perKm)}/km`
        : '';
    const deliveryMissing = !where || !places.length || !cost;
    const ways = [form.acceptsCod && 'Cash on delivery', form.paymentQrImage && `${qrKind.label} QR`].filter(Boolean);
    const pickupSet = Boolean(form.pickupAddress.trim());
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SettingsList label="Delivery & payment">
            <SettingsRow
              to={partPath('method')}
              icon={Truck}
              label="Delivery & pickup"
              value={MODE_LABELS[form.fulfillmentMode] || 'Delivery only'}
            />
            {showPickup && (
              <SettingsRow
                to={partPath('pickup')}
                icon={StoreIcon}
                label="Pickup spot"
                value={!pickupSet ? 'Not set yet' : pickupPinned ? form.pickupAddress.trim() : 'Pin it on the map'}
                missing={!pickupSet || !pickupPinned}
                tag={pickupSet ? null : 'Needed to sell'}
              />
            )}
            {showDeliveryAreas && (
              <SettingsRow
                to={partPath('delivery')}
                icon={MapPin}
                label="Delivery: couriers, areas &amp; fees"
                value={deliveryMissing
                  ? (!where || !places.length ? 'Choose where you deliver' : 'Set your delivery fee')
                  : `${where} · ${cost}`}
                missing={deliveryMissing}
                tag={deliveryMissing ? 'Needed to sell' : null}
              />
            )}
            <SettingsRow
              to={partPath('payment')}
              icon={QrCode}
              label="Payment options"
              value={ways.length ? ways.join(' · ') : 'No way to pay yet'}
              missing={!ways.length}
              tag={ways.length ? null : 'Needed to sell'}
            />
          </SettingsList>
        </div>
      </div>
    );
  }

  // Phones, one part: its card only, and Cancel / Save changes at the bottom.
  if (isPhone) {
    const off = (part === 'pickup' && !showPickup) || (part === 'delivery' && !showDeliveryAreas);
    const card = {
      method: methodCard, pickup: pickupCard, delivery: deliveryCard, payment: paymentCard,
    }[part];
    return (
      <div className="seller-dashboard scm-part">
        <div className="seller-container">
          {off ? (
            <div className="scm-part-note">
              <span>
                {part === 'pickup'
                  ? 'Pickup is off: buyers get their orders delivered.'
                  : 'Delivery is off: buyers pick up their orders.'}
              </span>
              <Link to={partPath('method')} replace>Change how buyers get their orders</Link>
            </div>
          ) : card}
        </div>
        {!off && (
          <PhoneSaveBar
            onCancel={leave}
            onSave={() => saveSettings(part)}
            saving={saving}
            canSave={dirty}
          />
        )}
      </div>
    );
  }

  // Computers: every part on one page, as before.
  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          className="sf-head"
          title="Fulfillment & Payment"
          subtitle="Configure how buyers receive and pay for their orders."
          actions={(
            <button
              className="btn-seller-primary"
              onClick={() => saveSettings()}
              disabled={saving}
            >
              {saving ? <BusyLabel>Saving…</BusyLabel> : <><Save size={16} /> Save Changes</>}
            </button>
          )}
        />

        {methodCard}
        {showPickup && pickupCard}
        {showDeliveryAreas && deliveryCard}
        {paymentCard}

        <div className="sf-footer-actions">
          <button
            className="btn-seller-primary"
            onClick={() => saveSettings()}
            disabled={saving}
          >
            {saving ? <BusyLabel>Saving…</BusyLabel> : <><Save size={16} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The barangays chosen in a town (tap × to remove), and a search to add more. */
/**
 * Products without a weight, each with a kilogram box: a courier can't
 * price them, so couriers wait until every product has one.
 */
function WeightFixer({ products, total, onSaved }) {
  const [kg, setKg] = useState({});
  const [busy, setBusy] = useState(false);
  const filled = products.filter((p) => Number(kg[p.id]) > 0 && Number(kg[p.id]) <= 100);

  const save = async () => {
    if (!filled.length || busy) return;
    setBusy(true);
    let saved = 0;
    for (const p of filled) {
      try {
        await axios.put(`/products/${p.id}`, { weightGrams: Math.round(Number(kg[p.id]) * 1000) });
        saved += 1;
      } catch (err) {
        toast.error(`${p.name}: ${err.message || 'could not save'}`);
      }
    }
    setBusy(false);
    if (saved) {
      toast.success(`Saved ${saved} weight${saved === 1 ? '' : 's'}`);
      setKg({});
      onSaved?.();
    }
  };

  return (
    <div className="sf-weigh" role="region" aria-label="Products that need a weight">
      <p className="sf-weigh-head">
        <strong>Add a weight to {total === 1 ? 'your product' : `your ${total} products`} to ship with couriers.</strong>
        <span>Couriers charge by weight with the packaging, so the fee is worked out for each order.</span>
      </p>
      <ul className="sf-weigh-list">
        {products.map((p) => (
          <li key={p.id}>
            {p.image ? <img src={resolveImg(p.image)} alt="" /> : <span className="sf-weigh-noimg" aria-hidden="true" />}
            <span className="sf-weigh-name">{p.name}</span>
            <label className="sf-weigh-input">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.5"
                value={kg[p.id] ?? ''}
                onChange={(e) => setKg((prev) => ({ ...prev, [p.id]: e.target.value }))}
                aria-label={`Weight of ${p.name} in kilograms`}
              />
              <span>kg</span>
            </label>
          </li>
        ))}
      </ul>
      {total > products.length && <p className="sf-hint">Showing {products.length} of {total}. Save these to see the rest.</p>}
      <button type="button" className="sf-weigh-save" onClick={save} disabled={!filled.length || busy}>
        {busy ? 'Saving…' : filled.length ? `Save ${filled.length} weight${filled.length === 1 ? '' : 's'}` : 'Save weights'}
      </button>
    </div>
  );
}

function BarangayPicker({
  townName,
  psgcStatus,
  catalog,
  selected,
  onLoad,
  onAdd,
  onRemove,
}) {
  const [query, setQuery] = useState('');

  // Load the list once the town codes are in (they may still be on the way).
  useEffect(() => {
    if (psgcStatus === 'ready' && !catalog) onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psgcStatus]);

  const list = catalog?.list || [];
  const isLoading = catalog?.loading || (psgcStatus === 'loading' && !catalog);
  const error = catalog?.error || (psgcStatus === 'failed' ? 'Barangay list unavailable right now.' : null);
  const selectedLower = useMemo(
    () => new Set(selected.map((s) => s.name.toLowerCase())),
    [selected]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((b) => !selectedLower.has(b.name.toLowerCase()))
      .filter((b) => (q ? b.name.toLowerCase().includes(q) : true))
      .slice(0, 200);
  }, [list, query, selectedLower]);

  const allSelected = list.length > 0 && filtered.length === 0 && !query;

  const addAll = () => {
    for (const b of list) {
      if (!selectedLower.has(b.name.toLowerCase())) onAdd(b.name);
    }
  };

  return (
    <div className="sf-area-brgy">
      {selected.length > 0 ? (
        <ul className="sf-chip-list" aria-label={`Barangays in ${townName}`}>
          {selected.map((b) => (
            <li key={b.name} className="sf-chip">
              {b.name}
              <button
                type="button"
                className="sf-chip-x"
                onClick={() => onRemove(b.name)}
                aria-label={`Remove ${b.name}`}
              >
                <X size={12} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-hint">Tap the barangays you deliver to.</p>
      )}

      {isLoading && (
        <p className="sf-hint">Loading barangays for {townName}…</p>
      )}
      {error && (
        <p className="sf-hint sf-hint-error">
          {error} You can still type the name.
        </p>
      )}

      {list.length > 0 && (
        <>
          <div className="sf-brgy-toolbar">
            <input
              type="search"
              className="form-input"
              placeholder={`Search ${list.length} barangays…`}
              aria-label={`Search barangays in ${townName}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="btn-seller-outline"
              onClick={addAll}
              disabled={allSelected}
            >
              Add all
            </button>
          </div>
          <div className="sf-brgy-options">
            {allSelected ? (
              <p className="sf-hint">All barangays selected.</p>
            ) : filtered.length === 0 ? (
              <p className="sf-hint">No matches for “{query}”.</p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.code}
                  type="button"
                  className="sf-brgy-option"
                  onClick={() => onAdd(b.name)}
                >
                  + {b.name}
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/* Manual fallback if PSGC list unavailable */}
      {list.length === 0 && !isLoading && (
        <ManualBrgyInput onAdd={onAdd} />
      )}
    </div>
  );
}

function ManualBrgyInput({ onAdd }) {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue('');
  };
  return (
    <div className="sf-brgy-toolbar">
      <input
        type="text"
        className="form-input"
        placeholder="Type barangay name and press Enter"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="btn-seller-outline" onClick={submit}>
        Add
      </button>
    </div>
  );
}
