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
  Storefront as StoreIcon,
  Check,
  CheckCircle,
  Money,
  Warning,
  ArrowLeft,
  PencilSimple,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { IMAGE_ACCEPT } from '../lib/uploadableImage';
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
import DeliveryPlaces from '../components/seller/delivery/DeliveryPlaces';
import {
  costShort, emptyPlan, planFromSaved, planProblems, planRequest, whereShort,
} from '../lib/deliveryPlan';

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
  'delivery-couriers': 'delivery',
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

// Links to the delivery card of the one-page layout: Delivery has its own
// page (/seller/fulfillment/delivery) on computers too.
const DELIVERY_ANCHORS = ['delivery-areas', 'delivery-fee', 'delivery-couriers'];

/**
 * /seller/fulfillment, and /seller/fulfillment/<part>: on phones every part,
 * on computers Delivery. Each part starts from the saved settings: nothing
 * unsaved carries over between them.
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
  // The seller's own delivery: the places delivered to and each one's fee
  // (lib/deliveryPlan.js). Each change is saved at once (PUT
  // /stores/my/delivery); `savedDelivery` is what is saved now.
  const [plan, setPlan] = useState(emptyPlan);
  const [savedDelivery, setSavedDelivery] = useState(null);
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
        const [storeRes, deliveryRes] = await Promise.all([
          axios.get('/stores/my/store'),
          axios.get('/stores/my/delivery'),
        ]);
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
        setRiders(s.moormoveEnabled !== false);
        setQrOn(Boolean(s.paymentQrImage));
      } catch (err) {
        toast.error(err.message || 'Failed to load store');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
  const allTownIds = useMemo(() => municipalities.map((m) => m.id), [municipalities]);

  /**
   * Saves the places list at once (the Delivery page has no separate Save
   * for it): Me, Home and "Complete your shop" follow. Rejects (after the
   * toast) so the panel stays open. message false: no toast (a fee typed on
   * a line shows its own small "Saved").
   */
  const commitPlan = async (next, message) => {
    const blocking = planProblems(next, (id) => nameOf(id) || 'this town').filter((p) => p.key !== 'places');
    if (blocking.length) {
      toast.error(blocking[0].message);
      throw new Error(blocking[0].message);
    }
    try {
      const saved = await axios.put('/stores/my/delivery', planRequest(next));
      setPlan(next);
      setSavedDelivery(saved.data);
      const charged = { deliveryFeeMode: saved.data.mode, deliveryFee: saved.data.flatFee };
      setStore((prev) => (prev ? { ...prev, ...charged } : prev));
      layoutCtx?.setStore?.((prev) => (prev ? { ...prev, ...charged } : prev));
      layoutCtx?.refreshSetup?.();
      if (message !== false) toast.success(message || 'Saved');
    } catch (err) {
      toast.error(err.message || 'Could not save. Please try again.');
      throw err;
    }
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
          : [shipping.selfDelivery, [...shipping.courierIds].sort(), ridersOn ? riders : null,
            !showPickup ? [form.latitude, form.longitude] : null],
  );
  const partReady = !loading && (part !== 'delivery' || shippingLoaded);
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
   * @param {String} [scope] - 'all' (the one-page layout on computers: how
   *   buyers get orders, pickup and payment; Delivery has its own page) or
   *   the part being saved: only its settings are checked and sent.
   */
  const saveSettings = async (scope = 'all') => {
    if (!store) return;
    const has = (p) => scope === p || (scope === 'all' && p !== 'delivery');
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
    // Delivering yourself needs somewhere to deliver (the places save themselves).
    if (has('delivery') && showDeliveryAreas && shipping.selfDelivery && !plan.places.length) {
      toast.error('Add at least one place you deliver to.');
      document.getElementById('delivery-areas')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
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

    // A part's page sends only its own settings, so it never touches the others.
    const changes = {
      all: { ...form },
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
      if (has('delivery') && shippingLoaded) await axios.put('/couriers/my-store', shipping);
      // Me and Home show what is saved now (and so does the riders check here).
      setStore((prev) => (prev && res.data ? { ...prev, ...res.data } : prev));
      layoutCtx?.setStore?.((prev) => (prev ? { ...prev, ...res.data } : prev));
      layoutCtx?.refreshSetup?.();
      if (scope === 'all') {
        toast.success('Settings saved');
        return;
      }
      // A new way to hand orders over may need its part set up next.
      const next = scope !== 'method' ? null
        : showPickup && (!form.pickupAddress.trim() || !pickupPinned) ? 'pickup'
          : showDeliveryAreas && !savedDelivery?.areas?.length ? 'delivery' : null;
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

  // Phones: every part on a page of its own. Computers: Delivery on a page
  // of its own, the other parts as cards on one page (scrolled to the
  // part). One-page links (/seller/fulfillment#payment) open the part's page.
  if (part && !PARTS[part]) return <Navigate to="/seller/fulfillment" replace />;
  if (part && !isPhone && part !== 'delivery') {
    return <Navigate to={`/seller/fulfillment${location.hash || `#${PARTS[part].anchor}`}`} replace />;
  }
  const hashId = location.hash.slice(1);
  if (!part && !isPhone && DELIVERY_ANCHORS.includes(hashId)) {
    return <Navigate to={partPath('delivery', location.hash)} replace />;
  }
  const anchorPart = PART_OF_ANCHOR[hashId];
  if (!part && isPhone && anchorPart) {
    return <Navigate to={partPath(anchorPart, DELIVERY_ANCHORS.includes(hashId) ? location.hash : '')} replace />;
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

  // By distance: the shop pin the distances start at (the pickup spot's).
  const distanceExtras = (
    <>
      {!pickupPinned && (
        <p className="sf-courier-warn sf-rider-warn sf-perkm-pin" role="status">
          <Warning size={15} weight="fill" />
          <span>
            Pin your shop so the distance can be worked out.{' '}
            {showPickup
              ? <Link to={isPhone ? partPath('pickup') : '/seller/fulfillment#pickup-pin'}>Pin it in Pickup Location</Link>
              : (ridersOn && riders ? 'Use the map above.' : 'Use the map below.')}
          </span>
        </p>
      )}
      {!showPickup && !(ridersOn && riders) && (
        <div className="form-group sf-pin sf-rider-pin">
          <label>Your shop pin</label>
          <StoreLocationMap
            value={{ latitude: form.latitude, longitude: form.longitude }}
            onChange={({ latitude, longitude }) => setForm((prev) => ({ ...prev, latitude, longitude }))}
            height={isPhone ? 220 : 260}
            lockToPhilippines
            hint="Tap the map where your deliveries start."
          />
        </div>
      )}
    </>
  );

  const deliveryCard = (
          <div className="seller-card" id="delivery">
            <div className="seller-card-header">
              <h2>
                <Truck size={16} /> Delivery
              </h2>
            </div>
            <div className="sf-body">
              <section className="sf-q" id="delivery-couriers" aria-labelledby="sf-q-who">
                <h3 className="sf-q-title" id="sf-q-who">
                  <Truck size={22} weight="fill" className="dp-who-icon" aria-hidden="true" /> Who delivers your orders?
                </h3>
                <div className="sf-couriers">
                  <ChoiceCard
                    type="checkbox"
                    name="self-delivery"
                    value="SELF"
                    checked={shipping.selfDelivery}
                    onChange={() => setShipping((prev) => ({ ...prev, selfDelivery: !prev.selfDelivery }))}
                    media={<span className="sf-courier-self"><Truck size={18} weight="fill" /></span>}
                    title="I deliver myself"
                    desc="Your own fee · COD OK"
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
                      desc={`Local riders · fee by distance · COD OK${
                        promosForTown(riderPromos, store?.municipalityId).length ? ' · promo on' : ''}`}
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
                        desc={from == null ? 'Rates not set yet' : `From ₱${from} · paid online`}
                      />
                    );
                  })}
                </div>
                {ridersOn && (
                  <div className="sf-riders">
                    {riders && (
                      <p className="sf-hint sf-rider-help">
                        Tap Call a rider when an order is packed.
                      </p>
                    )}
                    {riders && !pickupPinned && (
                      <p className="sf-courier-warn sf-rider-warn" role="status">
                        <Warning size={15} weight="fill" />
                        <span>
                          Riders need your shop pin.{' '}
                          {showPickup
                            ? <Link to={isPhone ? partPath('pickup') : '/seller/fulfillment#pickup-pin'}>Pin it in Pickup Location</Link>
                            : 'Use the map below.'}
                        </span>
                      </p>
                    )}
                    {riders && !showPickup && (
                      <div className="form-group sf-pin sf-rider-pin">
                        <label>Your shop pin</label>
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
                        <span>{riderBlock}.</span>
                      </p>
                    )}
                  </div>
                )}
                {unweighed.count > 0 && (
                  <WeightFixer products={unweighed.list} total={unweighed.count} onSaved={loadUnweighed} />
                )}
                {shipping.courierIds.length > 0 && !form.paymentQrImage && (
                  <p className="sf-courier-warn" role="status">
                    Couriers need your GCash or QR Ph in Payment options.
                  </p>
                )}
              </section>

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
                <p className="sf-courier-auto" role="status">
                  <CheckCircle size={18} weight="fill" />
                  <span>Couriers set the shipping fee from each product&apos;s weight.</span>
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
      accept={IMAGE_ACCEPT}
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

  // Delivery as saved, in a few words: the list on phones, the card on computers.
  const savedPlan = savedDelivery ? planFromSaved(savedDelivery) : emptyPlan();
  const savedWhere = whereShort(savedPlan, (id) => nameOf(id) || 'Town', homeId, allTownIds);
  const savedCost = costShort(savedPlan, platformRate);
  const savedFeeMissing = !savedCost;
  const deliveryMissing = shipping.selfDelivery
    ? !savedWhere || savedFeeMissing
    : shipping.courierIds.length === 0;
  const deliveryValue = !shipping.selfDelivery
    ? (shipping.courierIds.length ? 'Couriers deliver your orders' : 'Choose who delivers')
    : !savedWhere ? 'Choose where you deliver'
      : savedFeeMissing ? `${savedWhere} · Set your delivery fee` : `${savedWhere} · ${savedCost}`;
  const whoDelivers = [
    shipping.selfDelivery && 'You',
    ridersOn && riders && 'MoorMove riders',
    ...courierList.filter((c) => shipping.courierIds.includes(c.id)).map((c) => c.name),
  ].filter(Boolean).join(' · ') || 'No one yet';

  // Phones, the list: each part with what is set now; the parts buyers need
  // before the shop can sell say so while they are missing.
  if (isPhone && !part) {
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
                label="Delivery: places &amp; fees"
                value={deliveryValue}
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

  // Computers, Delivery: its own page, centred, with Save pinned at the bottom.
  if (part === 'delivery') {
    return (
      <div className="seller-dashboard dp-page">
        <div className="seller-container dp-container">
          <Link to="/seller/fulfillment" className="dp-back"><ArrowLeft size={16} /> Fulfillment &amp; Payment</Link>
          <SellerPageHead
            className="sf-head"
            title="Delivery"
          />
          {showDeliveryAreas ? deliveryCard : (
            <div className="seller-card">
              <div className="sf-body">
                <p className="sf-hint sf-hint-lead">Delivery is off: buyers pick up their orders.</p>
                <Link to="/seller/fulfillment#method" className="btn-seller-outline dp-off-link">Change how buyers get their orders</Link>
              </div>
            </div>
          )}
          {showDeliveryAreas && (
            <div className="dp-savebar" role="group" aria-label="Save or cancel">
              <span className="dp-savebar-note">{dirty ? 'You have changes that are not saved yet.' : 'All changes saved.'}</span>
              <button type="button" className="btn-seller-outline" onClick={leave} disabled={saving}>Cancel</button>
              <button type="button" className="btn-seller-primary" onClick={() => saveSettings('delivery')} disabled={saving || !dirty}>
                {saving ? <BusyLabel>Saving…</BusyLabel> : <><Save size={16} /> Save delivery</>}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Computers, the rest: every part on one page; Delivery in short, with a
  // link to its page.
  const deliverySummaryCard = (
    <div className="seller-card" id="delivery-summary">
      <div className="seller-card-header">
        <h2>
          <Truck size={16} /> Delivery
        </h2>
        <Link to={partPath('delivery')} className="btn-seller-outline dp-edit">
          <PencilSimple size={14} /> Edit delivery
        </Link>
      </div>
      <div className="sf-body">
        <dl className="dp-summary">
          <div>
            <dt>Who delivers</dt>
            <dd>{whoDelivers}</dd>
          </div>
          {shipping.selfDelivery && (
            <>
              <div>
                <dt>Delivery places</dt>
                <dd>{savedWhere || 'Not set yet'}</dd>
              </div>
              <div>
                <dt>How much</dt>
                <dd>{savedFeeMissing ? 'Not set yet' : savedCost}</dd>
              </div>
            </>
          )}
        </dl>
        {deliveryMissing && (
          <p className="sf-courier-warn sf-rider-warn" role="status">
            <Warning size={15} weight="fill" />
            <span>
              Needed before buyers can order: {deliveryValue.toLowerCase()}.{' '}
              <Link to={partPath('delivery')}>Set up delivery</Link>
            </span>
          </p>
        )}
      </div>
    </div>
  );

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
        {showDeliveryAreas && deliverySummaryCard}
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
