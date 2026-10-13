import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CaretRight, User, PaintBrush, QrCode, AirplaneTilt, Clock, Truck, Storefront, MapPin, Moped, Money,
  IdentificationCard, Globe, Trash, ArrowCounterClockwise as RotateCcw,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import EmptyArt from '../components/ui/EmptyArt';
import Skeleton from '../components/ui/Skeleton';
import Select from '../components/ui/Select';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SellerPageHead from '../components/seller/SellerPageHead';
import { AwayForm, HoursForm } from '../components/seller/ShopHoursCards';
import PushSetting from '../components/account/PushSetting';
import '../components/account/PushSetting.css';
import { awayUntil, shortDate, weekLines } from '../lib/shopHours';
import { qrMethod } from '../lib/qrPayment';
import { useMoormove } from '../lib/moormove';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import './SellerDashboard.css';
import './SellerSettings.css';

/**
 * Shop Settings: everything about how the shop runs, in one list.
 *   Shop        profile, look, Shop QR, Away mode (on / off here)
 *   Selling     opening hours (edited here), delivery & pickup, MoorMove
 *               riders and cash on delivery (on / off here), payment options
 *   Account     identity check, notifications on this device, language
 *   Danger zone deleting the shop (15 days to change your mind)
 * Rows with their own page link to it; on / off settings save at once.
 */

const MODE_HINTS = { DELIVERY: 'Delivery', PICKUP: 'Pickup', BOTH: 'Both' };

/** A row that opens its own page (as on the Me page). */
function LinkRow({ to, icon: Icon, label, hint, warn = false }) {
  return (
    <Link to={to} className="sme-row">
      <span className="sme-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="sme-row-label">{label}</span>
      {hint != null && <span className={`sme-row-hint${warn ? ' is-warn' : ''}`}>{hint}</span>}
      <CaretRight size={16} className="sh-chev" />
    </Link>
  );
}

/** A row with a switch: saves as soon as it is flipped. */
function ToggleRow({ icon: Icon, label, sub, warn = false, checked, disabled = false, onChange }) {
  return (
    <label className={`sme-row sst-toggle${disabled ? ' is-busy' : ''}`}>
      <span className="sme-row-icon"><Icon size={19} weight="fill" /></span>
      <span className="sst-row-text">
        <span className="sme-row-label">{label}</span>
        {sub && <small className={warn ? 'is-warn' : undefined}>{sub}</small>}
      </span>
      <span className="push-switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
        <span />
      </span>
    </label>
  );
}

export default function SellerSettings() {
  const layoutCtx = useOutletContext() || {};
  const { setup } = layoutCtx;
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // On / off settings being saved, so a second tap waits for the first.
  const [saving, setSaving] = useState({});
  const [awayOpen, setAwayOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [language, setLanguageState] = useState(() => getCurrentLanguage());
  const { enabled: ridersOn } = useMoormove();
  const dangerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    axios.get('/stores/my/store')
      .then((res) => { if (!cancelled) setStore(res.data); })
      .catch(() => { if (!cancelled) setStore(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // The saved shop, here and in the Seller Center's copy (Me, Home, setup).
  const applySaved = (next) => {
    if (!next) return;
    setStore((s) => ({ ...s, ...next }));
    layoutCtx.setStore?.((prev) => (prev ? { ...prev, ...next } : prev));
  };

  // Flip an on / off setting at once, and put it back if saving fails.
  const flip = async (changes, failMessage) => {
    const key = Object.keys(changes).join(',');
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, store[k]]));
    setSaving((s) => ({ ...s, [key]: true }));
    setStore((s) => ({ ...s, ...changes }));
    try {
      const res = await axios.put(`/stores/${store.id}`, changes);
      applySaved(res.data);
      layoutCtx.refreshSetup?.();
    } catch (err) {
      setStore((s) => ({ ...s, ...before }));
      toast.error(err.message || failMessage);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const confirmRequestDeletion = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.delete(`/stores/${store.id}`);
      applySaved(res.data);
      toast.success('Shop deletion scheduled. It is now hidden from buyers.');
    } catch (err) {
      toast.error(err.message || 'Could not schedule deletion');
    } finally {
      setIsSubmitting(false);
      setDeleteConfirm(false);
    }
  };

  const confirmCancelDeletion = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.post(`/stores/${store.id}/cancel-deletion`);
      applySaved(res.data);
      toast.success('Deletion cancelled. Your shop is active again.');
    } catch (err) {
      toast.error(err.message || 'Could not cancel deletion');
    } finally {
      setIsSubmitting(false);
      setCancelConfirm(false);
    }
  };

  const head = (
    <SellerPageHead title="Shop Settings" subtitle="Everything about how your shop runs" />
  );

  if (isLoading || !store) {
    return (
      <div className="seller-dashboard sme sst">
        <div className="seller-container">
          {head}
          {isLoading ? (
            <div className="seller-card" style={{ padding: 20 }}>
              <Skeleton.Text lines={3} height={14} />
            </div>
          ) : (
            <div className="seller-card" style={{ padding: 20 }}>
              <EmptyArt name="launch" size={88} />
              <p style={{ textAlign: 'center' }}>You don&apos;t have a shop yet. Create one from Shop Profile first.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pendingDeletion = !!store.deletionRequestedAt;
  const deletionDate = pendingDeletion
    ? new Date(store.deletionScheduledAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const canShare = Boolean(store.slug && store.isApproved !== false);

  // Away: no new orders until the date the shop is back.
  const away = awayUntil(store);
  const awaySub = away
    ? `Away until ${shortDate(away)}${store.vacationNote ? ` · “${store.vacationNote}”` : ''}`
    : awayOpen ? 'Pick the day you are back' : 'Off: taking orders';
  const onAway = (on) => {
    if (away && !on) {
      setAwayOpen(false);
      flip({ vacationUntil: null, vacationNote: null }, 'Could not turn off away mode');
    } else {
      setAwayOpen(on);
    }
  };

  const hours = weekLines(store);

  // Delivery & payment: what is set now, and the parts still missing.
  const mode = store.fulfillmentMode || 'DELIVERY';
  const delivers = mode !== 'PICKUP';
  const picksUp = mode !== 'DELIVERY';
  const pickupSet = Boolean(String(store.pickupAddress || '').trim());
  const stepDone = (key) => setup?.steps?.find((step) => step.key === key)?.done;
  const deliverySet = !setup || (stepDone('delivery-areas') !== false && stepDone('delivery-fee') !== false);
  const fee = store.deliveryFee == null ? null : Number(store.deliveryFee);
  const feeHint = fee === null ? 'Per place' : fee === 0 ? 'Free' : `₱${fee.toLocaleString('en-PH')}`;
  const cod = store.acceptsCod !== false;
  const qr = Boolean(store.paymentQrImage);
  const ways = [cod && 'Cash', qr && qrMethod(store.paymentQrType).label].filter(Boolean);
  const onCod = (on) => {
    if (!on && !qr) {
      toast.error('Add a QR code in Payment options first, so buyers can still pay.');
      return;
    }
    flip({ acceptsCod: on }, 'Could not change cash on delivery');
  };

  // MoorMove riders: only while the site has them on, for a shop that delivers.
  const riders = store.moormoveEnabled !== false;
  const pinned = store.latitude != null && store.longitude != null;
  const ridersSub = !riders ? 'Off' : pinned ? 'Buyers can pick a rider at checkout' : 'Pin your shop in Delivery so riders can find it';

  const identity = setup?.steps?.find((step) => step.key === 'identity');
  const identityHint = identity?.done ? 'Verified' : identity?.status === 'FAILED' ? 'Try again' : 'Not yet';

  return (
    <div className="seller-dashboard sme sst">
      <div className="seller-container">
        {head}

        <div className="sh-body sst-body">
          {pendingDeletion && (
            <button
              type="button"
              className="sst-pending-line"
              onClick={() => dangerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              Your shop is hidden and will be deleted on {deletionDate}. <span>Cancel below</span>
            </button>
          )}

          <section className="sh-card sme-list sst-group">
            <h2>Shop</h2>
            <LinkRow to="/seller/store" icon={User} label="Shop profile" hint="Name, logo, location" />
            <LinkRow to="/seller/decorate" icon={PaintBrush} label="Decorate my shop" />
            {canShare && <LinkRow to="/seller/shop-qr" icon={QrCode} label="Shop QR" hint="Print for your stall" />}
            <ToggleRow
              icon={AirplaneTilt}
              label="Away mode"
              sub={awaySub}
              warn={Boolean(away)}
              checked={Boolean(away) || awayOpen}
              disabled={Boolean(saving['vacationUntil,vacationNote'])}
              onChange={onAway}
            />
            {awayOpen && !away && (
              <div className="sst-panel">
                <AwayForm store={store} onSaved={applySaved} onDone={() => setAwayOpen(false)} />
              </div>
            )}
          </section>

          <section className="sh-card sme-list sst-group">
            <h2>Selling</h2>
            <button
              type="button"
              className="sme-row sst-expand"
              aria-expanded={hoursOpen}
              onClick={() => setHoursOpen((o) => !o)}
            >
              <span className="sme-row-icon"><Clock size={19} weight="fill" /></span>
              <span className="sst-row-text">
                <span className="sme-row-label">Opening hours</span>
                <small className={hours.length ? undefined : 'is-warn'}>{hours.length ? hours.join(', ') : 'Not set'}</small>
              </span>
              <CaretRight size={16} className="sh-chev" />
            </button>
            {hoursOpen && (
              <div className="sst-panel">
                <HoursForm store={store} onSaved={applySaved} />
              </div>
            )}
            <LinkRow to="/seller/fulfillment/method" icon={Truck} label="Delivery & pickup" hint={MODE_HINTS[mode] || 'Delivery'} />
            {picksUp && (
              <LinkRow
                to="/seller/fulfillment/pickup"
                icon={Storefront}
                label="Pickup spot"
                hint={pickupSet ? null : 'Not set'}
                warn={!pickupSet}
              />
            )}
            {delivers && (
              <LinkRow
                to="/seller/fulfillment/delivery"
                icon={MapPin}
                label="Delivery: couriers, areas & fees"
                hint={deliverySet ? feeHint : 'Not set'}
                warn={!deliverySet}
              />
            )}
            {ridersOn && delivers && (
              <ToggleRow
                icon={Moped}
                label="MoorMove riders"
                sub={ridersSub}
                warn={riders && !pinned}
                checked={riders}
                disabled={Boolean(saving.moormoveEnabled)}
                onChange={(on) => flip({ moormoveEnabled: on }, 'Could not change MoorMove riders')}
              />
            )}
            <LinkRow
              to="/seller/fulfillment/payment"
              icon={QrCode}
              label="Payment options"
              hint={ways.length ? ways.join(' · ') : 'Not set'}
              warn={!ways.length}
            />
            <ToggleRow
              icon={Money}
              label="Cash on delivery"
              sub={cod ? 'Buyers pay when the order arrives' : 'Off: buyers pay by QR'}
              checked={cod}
              disabled={Boolean(saving.acceptsCod)}
              onChange={onCod}
            />
          </section>

          <section className="sh-card sme-list sst-group">
            <h2>Account &amp; safety</h2>
            {identity && <LinkRow to="/seller/verification" icon={IdentificationCard} label="Verify identity" hint={identityHint} />}
            <PushSetting />
            <label className="sme-row sm-lang notranslate" translate="no">
              <span className="sme-row-icon"><Globe size={19} weight="fill" /></span>
              <span className="sme-row-label">Language</span>
              <Select
                value={language}
                onChange={(e) => {
                  setLanguageState(e.target.value);
                  setLanguage(e.target.value);
                }}
                aria-label="Language"
              >
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </Select>
              <CaretRight size={16} className="sh-chev" />
            </label>
          </section>

          <section
            ref={dangerRef}
            className={`sh-card sme-list sst-group sst-danger${pendingDeletion ? ' settings-deletion-pending' : ''}`}
          >
            <h2>{pendingDeletion ? 'Shop deletion scheduled' : 'Danger zone'}</h2>
            {pendingDeletion ? (
              <div className="settings-deletion-body">
                <p>
                  Your shop <strong>{store.name}</strong> is hidden from buyers and scheduled for
                  permanent deletion on <strong>{deletionDate}</strong>{' '}
                  ({store.deletionDaysRemaining} day{store.deletionDaysRemaining === 1 ? '' : 's'} remaining).
                </p>
                <p className="settings-deletion-hint">
                  Cancel anytime before then to keep your shop and make it visible to buyers again.
                </p>
                <button type="button" className="btn-seller-primary" onClick={() => setCancelConfirm(true)}>
                  <RotateCcw size={15} /> Cancel Deletion
                </button>
              </div>
            ) : (
              <button type="button" className="sme-row sst-delete" onClick={() => setDeleteConfirm(true)}>
                <span className="sme-row-icon"><Trash size={19} weight="fill" /></span>
                <span className="sst-row-text">
                  <span className="sme-row-label">Delete shop</span>
                  <small>Hidden from buyers at once, deleted after 15 days. You can cancel in that time.</small>
                </span>
                <CaretRight size={16} className="sh-chev" />
              </button>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        title={`Delete "${store.name}"?`}
        message="Your shop will be hidden from buyers right away. It will be permanently deleted in 15 days unless you cancel before then."
        confirmLabel="Delete Shop"
        danger
        loading={isSubmitting}
        onConfirm={confirmRequestDeletion}
        onCancel={() => setDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={cancelConfirm}
        title="Cancel shop deletion?"
        message="Your shop will immediately become active and visible to buyers again."
        confirmLabel="Cancel Deletion"
        loading={isSubmitting}
        onConfirm={confirmCancelDeletion}
        onCancel={() => setCancelConfirm(false)}
      />
    </div>
  );
}
