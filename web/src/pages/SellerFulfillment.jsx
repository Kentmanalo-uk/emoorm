import { useEffect, useState, useMemo, useCallback } from 'react';
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
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerFulfillment.css';
import { useMunicipalities } from '../hooks/useReferenceData';
import SellerPageHead from '../components/seller/SellerPageHead';

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

const QR_TYPES = [
  { key: 'GCASH', label: 'GCash' },
  { key: 'QRPH', label: 'QR Ph' },
];

// PSGC (Philippine Standard Geographic Code) — free public API for Philippine locations
const PSGC_BASE = 'https://psgc.gitlab.io/api';
const ORIENTAL_MINDORO_CODE = '175200000';

/** A fee as the form holds it: '' (none set) or the amount as text. */
const feeText = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value)));

/** A form fee for the API: null (none set), a number, or undefined if invalid. */
const parseFee = (text) => {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return undefined;
  return Math.round(n * 100) / 100;
};

const pesos = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A town's delivery details: all its barangays or some, and the fees used when the fee depends on the place. */
const emptyTown = () => ({ whole: true, fee: '', barangays: [] });

/**
 * A delivery fee box: an amount in pesos, or Free (₱0).
 */
function FeeInput({ id, value, onChange, placeholder, label }) {
  const free = value !== '' && Number(value) === 0;
  return (
    <div className={`sf-fee${free ? ' is-free' : ''}`}>
      <span className="sf-fee-box">
        <span className="sf-fee-peso" aria-hidden="true">₱</span>
        <input
          id={id}
          type="number"
          min="0"
          max="10000"
          step="0.01"
          inputMode="decimal"
          value={free ? '' : value}
          placeholder={free ? 'Free' : placeholder}
          disabled={free}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
      <button
        type="button"
        className="sf-free"
        aria-pressed={free}
        onClick={() => onChange(free ? '' : '0')}
      >
        Free
      </button>
    </div>
  );
}

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

export default function SellerFulfillment() {
  const [store, setStore] = useState(null);
  const { municipalities } = useMunicipalities();
  // Delivery is two questions: where (coverage) and how much (feeMode).
  //   coverage: 'TOWN' (only the shop's town) | 'SOME' (towns it picks) | 'ALL' (all around Mindoro)
  //   feeMode:  'FREE' | 'SAME' (one fee, form.deliveryFee) | 'PLACE' (a fee per town or barangay)
  // `towns` keeps each town's details ({ [municipalityId]: emptyTown() }) and
  // survives switching answers, so nothing typed is lost.
  const [coverage, setCoverage] = useState('');
  const [feeMode, setFeeMode] = useState('');
  const [towns, setTowns] = useState({});
  const [someTowns, setSomeTowns] = useState([]);
  // The saved areas, until the town list is loaded to tell which answer they match.
  const [savedAreas, setSavedAreas] = useState(null);
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
    paymentQrImage: '',
    paymentQrType: 'GCASH',
    paymentInstructions: '',
    acceptsCod: true,
    // The fee when it is the same everywhere.
    deliveryFee: '',
  });

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

        // How much: what each place pays now tells which answer fits.
        const standard = s.deliveryFee == null ? null : Number(s.deliveryFee);
        let mode = '';
        let amount = standard === null ? '' : feeText(standard);
        if (saved.some((a) => a.fee != null)) {
          const paid = saved.map((a) => (a.fee == null ? standard : Number(a.fee)));
          if (paid.every((f) => f !== null && f === paid[0])) {
            mode = paid[0] === 0 ? 'FREE' : 'SAME';
            amount = feeText(paid[0]);
          } else {
            mode = 'PLACE';
            // Places that used the one fee keep it as their own.
            if (standard !== null) {
              for (const t of Object.values(byTown)) {
                if (t.whole && t.fee === '') t.fee = feeText(standard);
                t.barangays = t.barangays.map((b) => (b.fee === '' ? { ...b, fee: feeText(standard) } : b));
              }
            }
          }
        } else if (standard !== null) {
          mode = standard === 0 ? 'FREE' : 'SAME';
        }

        setTowns(byTown);
        setSomeTowns(Object.keys(byTown));
        setFeeMode(mode);
        setSavedAreas(saved);
        setForm({
          fulfillmentMode: s.fulfillmentMode || 'DELIVERY',
          pickupAddress: s.pickupAddress || '',
          pickupInstructions: s.pickupInstructions || '',
          paymentQrImage: s.paymentQrImage || '',
          paymentQrType: s.paymentQrType || 'GCASH',
          paymentInstructions: s.paymentInstructions || '',
          acceptsCod: s.acceptsCod ?? true,
          deliveryFee: mode === 'FREE' ? '' : amount,
        });
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

  const setPlaceFee = (place, fee) => updateTown(place.municipalityId, (t) => (place.barangay === null
    ? { ...t, fee }
    : { ...t, barangays: t.barangays.map((b) => (b.name === place.barangay ? { ...b, fee } : b)) }));

  const pickCoverage = (value) => {
    setCoverage(value);
    // "Some towns" starts from the shop's own town.
    if (value === 'SOME' && someTowns.length === 0 && homeId) setSomeTowns([homeId]);
  };

  const toggleTown = (id) => setSomeTowns((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const showDeliveryAreas = form.fulfillmentMode === 'DELIVERY' || form.fulfillmentMode === 'BOTH';
  const showPickup = form.fulfillmentMode === 'PICKUP' || form.fulfillmentMode === 'BOTH';

  const saveSettings = async () => {
    if (!store) return;
    // Saving before the saved areas are matched to an answer would clear them.
    if (savedAreas) {
      toast.error('Your delivery areas are still loading. Try again in a moment.');
      return;
    }
    // Validation
    if (showPickup && !form.pickupAddress.trim()) {
      toast.error('Please provide a pickup address.');
      return;
    }
    // Delivery answers are checked while delivery is on; with pickup only they are kept as they are.
    if (showDeliveryAreas) {
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
      if (feeMode === 'SAME' && parseFee(form.deliveryFee) == null) {
        toast.error('Enter your delivery fee (up to ₱10,000), or choose Free delivery.');
        return;
      }
      const unpriced = feeMode === 'PLACE' ? places.find((p) => parseFee(p.fee) == null) : null;
      if (unpriced) {
        toast.error(`Set the delivery fee for ${unpriced.barangay ? `${unpriced.name}, ${unpriced.sub}` : unpriced.name} (or tap Free).`);
        return;
      }
    }
    if (!form.acceptsCod && !form.paymentQrImage) {
      toast.error('Enable COD or upload a QR image so buyers can pay.');
      return;
    }

    // One fee (0 when free) lives on the shop; a fee per place lives on each place.
    const deliveryFee = feeMode === 'FREE' ? 0 : feeMode === 'SAME' ? parseFee(form.deliveryFee) ?? null : null;
    const areas = places.map((p) => ({
      municipalityId: p.municipalityId,
      barangay: p.barangay,
      fee: feeMode === 'PLACE' ? parseFee(p.fee) ?? null : null,
    }));

    setSaving(true);
    try {
      await axios.put(`/stores/${store.id}`, {
        ...form,
        deliveryFee,
      });
      await axios.put('/stores/my/service-areas', { areas });
      // "Some towns" starts from what is saved now, as it would after a reload.
      if (coverage) setSomeTowns(coveredIds);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // The answers in one sentence, so the seller can check them.
  const summary = (() => {
    if (!coverage || !feeMode || !places.length) return null;
    const home = townOf(homeId);
    const where = coverage === 'ALL'
      ? 'anywhere in Oriental Mindoro'
      : coverage === 'TOWN'
        ? (home.whole ? `anywhere in ${homeName}` : `in ${plural(places.length, 'barangay')} of ${homeName}`)
        : `in ${plural(coveredIds.length, 'town')}`;
    const amount = feeMode === 'SAME' ? parseFee(form.deliveryFee) : null;
    const cost = feeMode === 'FREE' || amount === 0
      ? 'get free delivery'
      : feeMode === 'SAME'
        ? (amount ? `can order delivery for ${pesos(amount)}` : null)
        : 'pay the delivery fee you set for their place';
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

  if (loading) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
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
              onClick={saveSettings}
              disabled={saving}
            >
              <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        />

        {/* Fulfillment Mode */}
        <div className="seller-card">
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

        {/* Pickup Info */}
        {showPickup && (
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
                <input
                  type="text"
                  name="pickupAddress"
                  value={form.pickupAddress}
                  onChange={handleChange}
                  placeholder="e.g. 123 Rizal St., Brgy. Poblacion, Calapan City"
                  className="form-input"
                />
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
        )}

        {/* Delivery: where, then how much */}
        {showDeliveryAreas && (
          <div className="seller-card" id="delivery-areas">
            <div className="seller-card-header">
              <h2>
                <Truck size={16} /> Delivery areas &amp; fees
              </h2>
            </div>
            <div className="sf-body">
              <section className="sf-q" aria-labelledby="sf-q-where">
                <h3 className="sf-q-title" id="sf-q-where">
                  <span className="sf-q-num" aria-hidden="true">1</span> Where do you deliver?
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
                  <span className="sf-q-num" aria-hidden="true">2</span> How much is delivery?
                </h3>
                <div className="sf-mode-grid" role="radiogroup" aria-labelledby="sf-q-fee">
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
                    value="SAME"
                    checked={feeMode === 'SAME'}
                    onPick={setFeeMode}
                    title="Same fee everywhere"
                    desc="One delivery fee for every place."
                  />
                  <Choice
                    name="feeMode"
                    value="PLACE"
                    checked={feeMode === 'PLACE'}
                    onPick={setFeeMode}
                    title="Depends on the place"
                    desc="A fee for each town or barangay."
                  />
                </div>

                {feeMode === 'SAME' && (
                  <div className="sf-same">
                    <label htmlFor="sf-delivery-fee">Delivery fee</label>
                    <span className="sf-fee-box">
                      <span className="sf-fee-peso" aria-hidden="true">₱</span>
                      <input
                        id="sf-delivery-fee"
                        type="number"
                        min="0"
                        max="10000"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="e.g. 50"
                        value={form.deliveryFee}
                        onChange={(e) => setForm((p) => ({ ...p, deliveryFee: e.target.value }))}
                      />
                    </span>
                  </div>
                )}

                {feeMode === 'PLACE' && (places.length > 0 ? (
                  <ul className="sf-brgy-fees sf-place-fees" aria-label="Delivery fee for each place">
                    {places.map((p) => (
                      <li key={p.key} className="sf-fee-row">
                        <span className="sf-fee-row-name">
                          {p.name}
                          <small>{p.sub}</small>
                        </span>
                        <FeeInput
                          value={p.fee}
                          onChange={(fee) => setPlaceFee(p, fee)}
                          placeholder="Fee"
                          label={`Delivery fee for ${p.barangay ? `${p.name}, ${p.sub}` : p.name}`}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sf-hint">Answer “Where do you deliver?” first, then set a fee for each place.</p>
                ))}
              </section>

              {summary && (
                <p className="sf-summary" role="status">
                  <CheckCircle size={18} weight="fill" /> {summary}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Payment */}
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
                <select
                  name="paymentQrType"
                  value={form.paymentQrType}
                  onChange={handleChange}
                  className="form-input"
                >
                  {QR_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
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
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleQrUpload}
                      disabled={uploading}
                      hidden
                    />
                  </label>
                )}
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

        <div className="sf-footer-actions">
          <button
            className="btn-seller-primary"
            onClick={saveSettings}
            disabled={saving}
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The barangays chosen in a town (tap × to remove), and a search to add more. */
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
