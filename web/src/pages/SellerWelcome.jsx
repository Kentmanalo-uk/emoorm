import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle, Clock, UploadSimple, Truck, Storefront, HandCoins,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import useAuthStore from '../store/authStore';
import { useMunicipalities } from '../hooks/useReferenceData';
import AppLogo from '../components/AppLogo';
import SellerGuideArt from '../components/seller/SellerGuideArt';
import { setSetupReturn, clearSetupReturn } from '../lib/setupReturn';
import './SellerWelcome.css';

/*
 * The guided setup a new seller sees right after applying: one small thing
 * per screen, in three parts (finish the application, set up the shop, add a
 * product). Every screen can be skipped, and "Skip setup" leaves at any time:
 * whatever is left stays on Home's "Complete your shop" list. Things done
 * on other pages (the ID check, couriers, the payment QR, a product) open
 * that page with a "Back to setup" pill to come back.
 */

const PARTS = [
  { title: 'Your application', text: 'What helps the admin approve you' },
  { title: 'Your shop', text: 'How buyers see, get and pay for your orders' },
  { title: 'Start selling', text: 'Your first product' },
];

const PAYOUTS = [
  { value: 'GCASH', label: 'GCash' },
  { value: 'MAYA', label: 'Maya' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'COD_ONLY', label: 'Cash only' },
];

const MODES = [
  { value: 'DELIVERY', label: 'I deliver', text: 'You bring orders to buyers.', Icon: Truck },
  { value: 'PICKUP', label: 'Buyers pick up', text: 'Buyers collect at your shop or stall.', Icon: Storefront },
  { value: 'BOTH', label: 'Both', text: 'Buyers choose at checkout.', Icon: HandCoins },
];

// Steps skipped this visit, kept for the tab so a trip to another page
// (Add product, the ID check) does not forget them.
const SKIPPED_KEY = 'emoorm.setupSkipped';
const readSkipped = () => {
  try { return new Set(JSON.parse(sessionStorage.getItem(SKIPPED_KEY) || '[]')); } catch { return new Set(); }
};
const keepSkipped = (set) => {
  try { sessionStorage.setItem(SKIPPED_KEY, JSON.stringify([...set])); } catch { /* storage off */ }
  return set;
};

const stepDone = (setup, key) => Boolean(setup?.steps?.find((s) => s.key === key)?.done);

/** A small photo picker: the picture, or a dashed box to choose one. */
function PhotoPick({ label, hint, value, onChange, wide = false }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadImage(file);
      onChange(res.url);
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`sw-photo${wide ? ' is-wide' : ''}`}>
      <button type="button" className="sw-photo-box" onClick={() => ref.current?.click()} disabled={busy} aria-label={value ? `Change ${label}` : `Add ${label}`}>
        {value ? <img src={resolveImg(value)} alt="" /> : (
          <span className="sw-photo-empty">
            <UploadSimple size={22} />
            {busy ? 'Uploading…' : 'Add photo'}
          </span>
        )}
      </button>
      <span className="sw-photo-label">
        <strong>{label}</strong>
        <small>{value ? <button type="button" className="sw-link" onClick={() => ref.current?.click()}>Change</button> : hint}</small>
      </span>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
    </div>
  );
}

export default function SellerWelcome() {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { municipalities } = useMunicipalities();

  const [store, setStore] = useState(null);
  const [setup, setSetup] = useState(null);
  const [app, setApp] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipped, setSkipped] = useState(readSkipped);
  const [form, setForm] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Back from a page the setup sent the seller to: no pill needed any more.
  useEffect(() => { clearSetupReturn(); }, []);

  const load = useCallback(async () => {
    try {
      const [s, st, a, areas] = await Promise.all([
        axios.get('/stores/my/store'),
        axios.get('/stores/my/setup'),
        axios.get('/auth/seller-application'),
        axios.get('/stores/my/service-areas').catch(() => ({ data: [] })),
      ]);
      const shop = s.data;
      const details = a.data?.details || {};
      setStore(shop);
      setSetup(st.data);
      setApp(a.data);
      setForm((f) => f || {
        businessType: details.sellerBusinessType || 'INDIVIDUAL',
        permit: details.sellerPermitNumber || '',
        tin: details.sellerBirTin || '',
        payout: details.payoutMethod || '',
        payoutName: details.payoutAccountName || user?.fullName || '',
        payoutNumber: details.payoutAccountNumber || user?.contactNumber || '',
        logo: shop.logo || '',
        banner: shop.bannerImage || shop.coverImage || '',
        description: shop.description || '',
        mode: shop.fulfillmentMode || 'DELIVERY',
        pickupAddress: shop.pickupAddress || '',
        pickupInstructions: shop.pickupInstructions || '',
        hasAreas: (areas.data || []).length > 0,
        reach: 'HOME',
        towns: [],
        feeKind: shop.deliveryFee != null && Number(shop.deliveryFee) > 0 ? 'SAME' : 'FREE',
        fee: shop.deliveryFee != null && Number(shop.deliveryFee) > 0 ? String(Number(shop.deliveryFee)) : '',
        acceptsCod: shop.acceptsCod !== false,
      });
    } catch {
      setFailed(true);
    }
  }, [user?.fullName, user?.contactNumber]);
  useEffect(() => { load(); }, [load]);

  const town = store?.municipality?.name || setup?.municipality || 'your town';

  // The screens, in order; pickup and delivery only for the ways the shop uses.
  const steps = useMemo(() => {
    if (!form) return [];
    const mode = form.mode;
    return [
      { key: 'identity', part: 0, done: app?.identityVerified === true },
      { key: 'business', part: 0 },
      { key: 'payout', part: 0, done: Boolean(app?.details?.payoutMethod) },
      { key: 'branding', part: 1, done: stepDone(setup, 'branding') },
      { key: 'about', part: 1, done: Boolean(store?.description) },
      { key: 'mode', part: 1 },
      mode !== 'DELIVERY' && { key: 'pickup', part: 1, done: stepDone(setup, 'pickup') },
      mode !== 'PICKUP' && { key: 'delivery', part: 1, done: stepDone(setup, 'delivery-areas') && stepDone(setup, 'delivery-fee') },
      { key: 'payment', part: 1 },
      { key: 'product', part: 2, done: stepDone(setup, 'product') },
    ].filter(Boolean);
  }, [form, app, setup, store]);

  const current = params.get('step') || 'intro';
  const index = steps.findIndex((s) => s.key === current);
  const step = index >= 0 ? steps[index] : null;
  const go = (key) => setParams(key === 'intro' ? {} : { step: key }, { replace: false });
  const next = () => go(index + 1 < steps.length ? steps[index + 1].key : 'done');
  const back = () => (index > 0 ? go(steps[index - 1].key) : go('intro'));
  const skip = () => { setSkipped((s) => keepSkipped(new Set(s).add(step.key))); next(); };
  const leave = () => {
    toast('Finish the rest any time from Home: "Complete your shop".', { icon: '👍' });
    navigate('/seller', { replace: true });
  };
  // Off to another page; the pill there brings the seller back to `key`.
  const away = (to, key) => { setSetupReturn(key); navigate(to); };

  const save = async (run) => {
    setSaving(true);
    try {
      await run();
      setSkipped((s) => { const n = new Set(s); n.delete(step.key); return keepSkipped(n); });
      await load();
      next();
    } catch (err) {
      toast.error(err.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const putStore = (body) => axios.put(`/stores/${store.id}`, body);

  if (!isAuthenticated) return <Navigate to="/seller/login?redirect=/seller/welcome" replace />;
  if (user?.role !== 'SELLER') return <Navigate to="/seller/apply" replace />;

  /* ── Each screen: its picture, words, fields and main button ───── */
  const screen = () => {
    if (!step) return null;
    switch (step.key) {
      case 'identity':
        return {
          art: 'identity',
          title: 'Verify your identity',
          text: 'Scan a valid ID with your camera. Admins approve verified shops faster.',
          body: step.done ? <p className="sw-done"><CheckCircle size={20} weight="fill" /> Your ID is verified.</p> : (
            <ul className="sw-points">
              <li><Clock size={18} /> Takes about a minute</li>
              <li><Check size={18} /> We don&apos;t keep a copy of your ID photo</li>
            </ul>
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
              <div className="sw-choices" role="radiogroup" aria-label="How you sell">
                {[
                  { value: 'INDIVIDUAL', label: 'On my own', text: 'Under your own name' },
                  { value: 'REGISTERED', label: 'Registered business', text: 'DTI, SEC or a business permit' },
                ].map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={form.businessType === o.value} className={`sw-choice${form.businessType === o.value ? ' is-on' : ''}`} onClick={() => set({ businessType: o.value })}>
                    <span className="sw-radio" aria-hidden="true" />
                    <span><strong>{o.label}</strong><small>{o.text}</small></span>
                  </button>
                ))}
              </div>
              {form.businessType === 'REGISTERED' && (
                <div className="sw-fields">
                  <label className="sw-field">
                    <span>Permit or registration number</span>
                    <input value={form.permit} onChange={(e) => set({ permit: e.target.value })} placeholder="e.g. 0123456" maxLength={60} />
                  </label>
                  <label className="sw-field">
                    <span>BIR TIN <em>optional</em></span>
                    <input value={form.tin} onChange={(e) => set({ tin: e.target.value })} placeholder="000-000-000-000" maxLength={30} />
                  </label>
                </div>
              )}
            </>
          ),
          primary: {
            label: 'Save and continue',
            onClick: () => {
              if (form.businessType === 'REGISTERED' && !form.permit.trim()) return toast.error('Enter your permit or registration number');
              return save(() => axios.patch('/auth/seller-application/details', {
                sellerBusinessType: form.businessType, sellerPermitNumber: form.permit, sellerBirTin: form.tin,
              }));
            },
          },
        };
      case 'payout':
        return {
          art: 'payout',
          title: 'How do you get paid?',
          text: 'Where your earnings from online payments go.',
          body: (
            <>
              <div className="sw-pills" role="radiogroup" aria-label="Payout">
                {PAYOUTS.map((p) => (
                  <button key={p.value} type="button" role="radio" aria-checked={form.payout === p.value} className={`sw-pill${form.payout === p.value ? ' is-on' : ''}`} onClick={() => set({ payout: p.value })}>
                    {form.payout === p.value && <Check size={14} weight="bold" />} {p.label}
                  </button>
                ))}
              </div>
              {form.payout && form.payout !== 'COD_ONLY' && (
                <div className="sw-fields">
                  <label className="sw-field">
                    <span>Account name</span>
                    <input value={form.payoutName} onChange={(e) => set({ payoutName: e.target.value })} maxLength={100} />
                  </label>
                  <label className="sw-field">
                    <span>{form.payout === 'BANK' ? 'Account number' : 'Mobile number'}</span>
                    <input value={form.payoutNumber} onChange={(e) => set({ payoutNumber: e.target.value })} inputMode="numeric" maxLength={40} />
                  </label>
                </div>
              )}
              {form.payout === 'COD_ONLY' && <p className="sw-note">Buyers pay you in cash when they get their order.</p>}
            </>
          ),
          primary: {
            label: 'Save and continue',
            disabled: !form.payout,
            onClick: () => {
              if (form.payout !== 'COD_ONLY' && (!form.payoutName.trim() || !form.payoutNumber.trim())) return toast.error('Add the account name and number');
              return save(() => axios.patch('/auth/seller-application/details', {
                payoutMethod: form.payout, payoutAccountName: form.payoutName, payoutAccountNumber: form.payoutNumber,
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
            <div className="sw-photos">
              <PhotoPick label="Logo" hint="Square works best" value={form.logo} onChange={(url) => set({ logo: url })} />
              <PhotoPick wide label="Cover photo" hint="Your stall, your farm, your products" value={form.banner} onChange={(url) => set({ banner: url })} />
            </div>
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
            <label className="sw-field">
              <span>Shop description</span>
              <textarea rows={4} maxLength={1000} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Fresh calamansi and vegetables from our farm in Bansud, picked every morning." />
              <small>{form.description.length}/1000</small>
            </label>
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
            <div className="sw-choices" role="radiogroup" aria-label="How buyers get orders">
              {MODES.map(({ value, label, text, Icon }) => (
                <button key={value} type="button" role="radio" aria-checked={form.mode === value} className={`sw-choice${form.mode === value ? ' is-on' : ''}`} onClick={() => set({ mode: value })}>
                  <Icon size={22} className="sw-choice-icon" />
                  <span><strong>{label}</strong><small>{text}</small></span>
                </button>
              ))}
            </div>
          ),
          primary: { label: 'Continue', onClick: () => save(() => putStore({ fulfillmentMode: form.mode })) },
        };
      case 'pickup':
        return {
          art: 'pickup',
          title: 'Where do buyers pick up?',
          text: 'Buyers see this after they order.',
          body: (
            <div className="sw-fields">
              <label className="sw-field">
                <span>Pickup address</span>
                <textarea rows={2} value={form.pickupAddress} onChange={(e) => set({ pickupAddress: e.target.value })} placeholder="e.g. Stall 12, Public Market, Poblacion" />
              </label>
              <label className="sw-field">
                <span>Directions <em>optional</em></span>
                <input value={form.pickupInstructions} onChange={(e) => set({ pickupInstructions: e.target.value })} placeholder="e.g. Beside the fish section. Open 6 AM to 5 PM." />
              </label>
            </div>
          ),
          primary: {
            label: 'Save and continue',
            disabled: !form.pickupAddress.trim(),
            onClick: () => save(() => putStore({ pickupAddress: form.pickupAddress, pickupInstructions: form.pickupInstructions.trim() || null })),
          },
        };
      case 'delivery': {
        const homeId = store.municipalityId;
        const pickTowns = form.reach === 'TOWNS';
        return {
          art: 'delivery',
          title: 'Where do you deliver?',
          text: 'And what buyers pay for it.',
          body: form.hasAreas ? (
            <>
              <p className="sw-done"><CheckCircle size={20} weight="fill" /> Your delivery places are set.</p>
              <button type="button" className="sw-link" onClick={() => away('/seller/fulfillment/delivery', 'delivery')}>Change them in Delivery settings</button>
            </>
          ) : (
            <>
              <div className="sw-pills" role="radiogroup" aria-label="Where">
                {[['HOME', `Only ${town}`], ['ALL', 'All of Mindoro'], ['TOWNS', 'Choose towns']].map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.reach === value} className={`sw-pill${form.reach === value ? ' is-on' : ''}`} onClick={() => set({ reach: value })}>
                    {form.reach === value && <Check size={14} weight="bold" />} {label}
                  </button>
                ))}
              </div>
              {pickTowns && (
                <div className="sw-towns">
                  {municipalities.map((m) => {
                    const on = form.towns.includes(m.id);
                    return (
                      <button key={m.id} type="button" aria-pressed={on} className={`sw-town${on ? ' is-on' : ''}`} onClick={() => set({ towns: on ? form.towns.filter((t) => t !== m.id) : [...form.towns, m.id] })}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <span className="sw-sub">Delivery fee</span>
              <div className="sw-pills" role="radiogroup" aria-label="Delivery fee">
                {[['FREE', 'Free'], ['SAME', 'Same fee everywhere']].map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.feeKind === value} className={`sw-pill${form.feeKind === value ? ' is-on' : ''}`} onClick={() => set({ feeKind: value })}>
                    {form.feeKind === value && <Check size={14} weight="bold" />} {label}
                  </button>
                ))}
              </div>
              {form.feeKind === 'SAME' && (
                <label className="sw-field sw-money">
                  <span>Fee per order</span>
                  <div><em>₱</em><input type="number" inputMode="decimal" min="1" step="1" value={form.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="50" /></div>
                </label>
              )}
              <p className="sw-note">
                Barangay by barangay, a fee per place, or couriers?{' '}
                <button type="button" className="sw-link" onClick={() => away('/seller/fulfillment/delivery', 'delivery')}>Open Delivery settings</button>
              </p>
            </>
          ),
          primary: form.hasAreas ? { label: 'Continue', onClick: next } : {
            label: 'Save and continue',
            onClick: () => {
              const ids = form.reach === 'HOME' ? [homeId] : form.reach === 'ALL' ? municipalities.map((m) => m.id) : form.towns;
              if (!ids.length) return toast.error('Choose at least one town');
              if (form.feeKind === 'SAME' && !(Number(form.fee) > 0)) return toast.error('Enter the delivery fee');
              return save(async () => {
                await axios.put('/stores/my/service-areas', { areas: ids.map((id) => ({ municipalityId: id })) });
                await putStore({ deliveryFee: form.feeKind === 'SAME' ? Number(form.fee) : 0 });
              });
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
              <button type="button" role="switch" aria-checked={form.acceptsCod} className={`sw-switch${form.acceptsCod ? ' is-on' : ''}`} onClick={() => set({ acceptsCod: !form.acceptsCod })}>
                <span><strong>Cash on delivery or pickup</strong><small>Buyers pay you when they get the order</small></span>
                <span className="sw-switch-track" aria-hidden="true"><span /></span>
              </button>
              <button type="button" className="sw-row-link" onClick={() => away('/seller/fulfillment/payment', 'payment')}>
                <span><strong>{store.paymentQrImage ? 'Your payment QR is added' : 'Add a GCash or QR Ph code'}</strong><small>{store.paymentQrImage ? 'Change it in Payment options' : 'Upload the QR from your e-wallet app'}</small></span>
                <ArrowRight size={18} />
              </button>
              {!form.acceptsCod && !store.paymentQrImage && <p className="sw-note is-warn">With cash off, buyers need your QR to pay you.</p>}
            </>
          ),
          primary: { label: 'Save and continue', onClick: () => save(() => putStore({ acceptsCod: form.acceptsCod })) },
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
  const frame = (content, { footer, top = true } = {}) => (
    <div className="sw">
      <div className="sw-card">
        {top && (
          <header className="sw-top">
            {step ? (
              <button type="button" className="sw-icon-btn" onClick={back} aria-label="Back"><ArrowLeft size={20} /></button>
            ) : <AppLogo className="sw-logo" alt="Emoorm" />}
            {step && (
              <div className="sw-progress" aria-label={`Part ${step.part + 1} of 3: ${PARTS[step.part].title}`}>
                {PARTS.map((p, i) => {
                  const inPart = steps.filter((s) => s.part === i);
                  const at = inPart.findIndex((s) => s.key === step.key);
                  const fill = i < step.part ? 1 : i > step.part ? 0 : (at + 1) / inPart.length;
                  return <span key={p.title} className="sw-bar"><span style={{ width: `${fill * 100}%` }} /></span>;
                })}
              </div>
            )}
            <button type="button" className="sw-skip-all" onClick={leave}>Skip setup</button>
          </header>
        )}
        <div className="sw-body" key={current}>{content}</div>
        {footer && <footer className="sw-foot">{footer}</footer>}
      </div>
    </div>
  );

  if (failed) {
    return frame(
      <div className="sw-center">
        <h1 className="sw-title">We couldn&apos;t load your setup</h1>
        <p className="sw-text">Check your connection and try again, or go straight to your Seller Center.</p>
      </div>,
      { footer: <><button type="button" className="sw-btn" onClick={() => { setFailed(false); load(); }}>Try again</button><Link to="/seller" className="sw-btn is-ghost">Seller Center</Link></> },
    );
  }

  if (!form) {
    return frame(<div className="sw-center" aria-busy="true"><span className="sw-spinner" /></div>, { top: false });
  }

  // Welcome: what just happened and what comes next.
  if (current === 'intro' || (!step && current !== 'done')) {
    return frame(
      <div className="sw-intro">
        <SellerGuideArt name="welcome" className="sw-art" />
        <p className="sw-kicker">Application sent</p>
        <h1 className="sw-title">{store.name} is open for setup!</h1>
        <p className="sw-text">The {town} admin is reviewing your shop. Meanwhile, let&apos;s get it ready to sell: about 10 minutes, one small step at a time.</p>
        <ol className="sw-parts">
          {PARTS.map((p, i) => (
            <li key={p.title}>
              <span className="sw-part-num">{i + 1}</span>
              <span><strong>{p.title}</strong><small>{p.text}</small></span>
            </li>
          ))}
        </ol>
      </div>,
      {
        footer: (
          <>
            <button type="button" className="sw-btn" onClick={() => go(steps[0].key)}>Let&apos;s start <ArrowRight size={18} /></button>
            <button type="button" className="sw-btn is-text" onClick={leave}>Skip for now</button>
          </>
        ),
      },
    );
  }

  // All through: what is done, what waits.
  if (current === 'done') {
    const later = steps.filter((s) => skipped.has(s.key) && !s.done);
    return frame(
      <div className="sw-intro">
        <SellerGuideArt name="ready" className="sw-art" />
        <p className="sw-kicker">All set up</p>
        <h1 className="sw-title">You&apos;re ready to go!</h1>
        <p className="sw-text">
          {setup?.readyToSell
            ? `Buyers can order as soon as the ${town} admin approves your shop. We'll let you know.`
            : 'A few things are still needed before buyers can order. Home lists them under "Complete your shop".'}
        </p>
        {later.length > 0 && (
          <div className="sw-later">
            <strong>Left for later</strong>
            <div>
              {later.map((s) => (
                <button key={s.key} type="button" className="sw-later-item" onClick={() => go(s.key)}>
                  {LATER_LABELS[s.key] || s.key} <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>,
      { footer: <button type="button" className="sw-btn" onClick={() => navigate('/seller', { replace: true })}>Go to my Seller Center <ArrowRight size={18} /></button> },
    );
  }

  const s = screen();
  return frame(
    <div className="sw-step">
      <SellerGuideArt name={s.art} className="sw-art is-small" />
      <p className="sw-kicker">{PARTS[step.part].title}{step.done && <span className="sw-badge"><Check size={12} weight="bold" /> Done</span>}</p>
      <h1 className="sw-title">{s.title}</h1>
      <p className="sw-text">{s.text}</p>
      {s.body && <div className="sw-form">{s.body}</div>}
    </div>,
    {
      footer: (
        <>
          <button type="button" className="sw-btn" onClick={s.primary.onClick} disabled={saving || s.primary.disabled}>
            {saving ? 'Saving…' : s.primary.label} {!saving && <ArrowRight size={18} />}
          </button>
          {!step.done && <button type="button" className="sw-btn is-text" onClick={skip} disabled={saving}>Skip for now</button>}
        </>
      ),
    },
  );
}

const LATER_LABELS = {
  identity: 'Verify your identity',
  business: 'How you sell',
  payout: 'How you get paid',
  branding: 'Logo and cover photo',
  about: 'Shop description',
  mode: 'How buyers get orders',
  pickup: 'Pickup spot',
  delivery: 'Where you deliver',
  payment: 'How buyers pay',
  product: 'Your first product',
};

