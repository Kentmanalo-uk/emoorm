import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CaretRight, AirplaneTilt, Clock, Moped, Money, Globe, Trash, PauseCircle, PlayCircle,
  ArrowCounterClockwise as RotateCcw, Storefront, ImageSquare, MapPin, Palette, PaintBrush, QrCode,
  Truck, Package, Wallet, IdentificationCard, ArrowsLeftRight, GraduationCap, Copy, PencilSimple,
} from '../lib/icons';
import axios from '../lib/axios';
import EmptyArt from '../components/ui/EmptyArt';
import Skeleton from '../components/ui/Skeleton';
import Select from '../components/ui/Select';
import LoadFailed from '../components/ui/LoadFailed';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SellerPageHead from '../components/seller/SellerPageHead';
import { AwayForm, HoursForm } from '../components/seller/ShopHoursCards';
import PushSetting from '../components/account/PushSetting';
import '../components/account/PushSetting.css';
import { awayUntil, shortDate, weekLines } from '../lib/shopHours';
import { confirmAction } from '../lib/confirm';
import { useMoormove } from '../lib/moormove';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { resolveImg } from '../lib/media';
import { ShopLogoArt } from '../components/shop/ShopArt';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../lib/googleTranslate';
import './SellerDashboard.css';
import './SellerSettings.css';

/**
 * Shop Settings: the switches for how the shop runs. Pages of their own
 * (Shop profile, Decorate, Shop QR, Delivery & payment, Verify identity) are
 * tasks, linked from Me and the sidebar, not listed again here.
 *   Selling                opening hours (edited here), cash on delivery and
 *                          MoorMove riders (on / off here)
 *   Take a break or close  away for a few days, stop selling for now, and
 *                          deleting the shop (15 days to change your mind),
 *                          side by side so the seller can pick the right one
 *   This device            notifications, language
 * On / off settings save at once.
 */

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

/** One of the three ways to stop orders, as a card beside the others. */
function StatusOption({ icon: Icon, title, text, state, tone = '', children }) {
  return (
    <div className={`sst-option${tone ? ` is-${tone}` : ''}`}>
      <span className="sst-option-icon"><Icon size={22} weight="fill" /></span>
      <strong className="sst-option-title">{title}</strong>
      <p className="sst-option-text">{text}</p>
      {state && <p className="sst-option-state">{state}</p>}
      <div className="sst-option-action">{children}</div>
    </div>
  );
}

/**
 * Computers: the top of Shop Settings is a hub, the way Lazada's Seller
 * Center opens its settings. The shop itself first (logo, name, its link to
 * copy, its town, whether buyers can see it), then every setting the shop
 * has, in groups, each a tile that opens it: the Shop profile and Delivery
 * & payment ones at their own card on that page (the layout flashes it).
 * Phones reach these from Me, so they keep the plain list.
 */
const HUB = [
  {
    title: 'Shop profile',
    tiles: [
      { icon: Storefront, tone: 'green', label: 'Name & description', sub: 'What buyers read about your shop', to: '/seller/store#shop-info' },
      { icon: ImageSquare, tone: 'pink', label: 'Logo & banner', sub: 'Your shop’s pictures', to: '/seller/store#branding' },
      { icon: MapPin, tone: 'blue', label: 'Location', sub: 'Where your shop or stall is', to: '/seller/store#shop-location' },
      { icon: Palette, tone: 'violet', label: 'Shop colors', sub: 'The colours of your shop page', to: '/seller/store#theme' },
      { icon: PaintBrush, tone: 'amber', label: 'Decorate my shop', sub: 'Your shop’s home page', to: '/seller/decorate' },
      { icon: QrCode, tone: 'green', label: 'Shop QR', sub: 'A poster for your stall', to: '/seller/shop-qr', needsLink: true },
    ],
  },
  {
    title: 'Delivery & payment',
    tiles: [
      { icon: Truck, tone: 'blue', label: 'Delivery & pickup', sub: 'How buyers get their orders', to: '/seller/fulfillment#method' },
      { icon: Package, tone: 'amber', label: 'Pickup spot', sub: 'Where buyers collect', to: '/seller/fulfillment#pickup' },
      { icon: MapPin, tone: 'green', label: 'Delivery areas', sub: 'Barangays you deliver to, and fees', to: '/seller/fulfillment#delivery-areas' },
      { icon: Wallet, tone: 'pink', label: 'Payment options', sub: 'Cash on delivery, GCash or QR', to: '/seller/fulfillment#payment' },
    ],
  },
  {
    title: 'Account',
    tiles: [
      { icon: IdentificationCard, tone: 'violet', label: 'Verify identity', sub: 'Your valid ID, for buyers’ trust', to: '/seller/verification' },
      { icon: ArrowsLeftRight, tone: 'blue', label: 'Personal account', sub: 'Shop and chat as a buyer', action: 'personal' },
      { icon: GraduationCap, tone: 'green', label: 'Seller Academy', sub: 'Free lessons for selling', to: '/sell/academy' },
    ],
  },
];

function SettingsHub({ store, onPersonal }) {
  const link = store.slug ? `${window.location.origin}/store/${store.slug}` : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Shop link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it instead.');
    }
  };
  const status = store.deletionRequestedAt
    ? { tone: 'red', label: 'Hidden: deletion scheduled' }
    : store.isApproved === false
      ? { tone: 'amber', label: 'Private until approved' }
      : store.isActive === false
        ? { tone: 'amber', label: 'Not selling for now' }
        : { tone: 'green', label: 'Open to buyers' };
  return (
    <section className="sst-hub" aria-label="Your shop and its settings">
      <div className="sst-hub-id">
        <span className="sst-hub-logo">
          {store.logo ? <img src={resolveImg(store.logo)} alt="" /> : <ShopLogoArt name={store.name} />}
        </span>
        <div className="sst-hub-meta">
          <h2>
            {store.name}
            <Link to="/seller/store#shop-info" className="sst-hub-edit" aria-label="Edit the shop's name" title="Edit">
              <PencilSimple size={15} />
            </Link>
          </h2>
          <p><span className={`sst-hub-status is-${status.tone}`}>{status.label}</span>
            {store.municipality?.name && <span>{store.municipality.name}, Oriental Mindoro</span>}
          </p>
          {link && (
            <p className="sst-hub-link">
              Shop link: <a href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, '')}</a>
              <button type="button" onClick={copyLink} aria-label="Copy the shop link" title="Copy">
                <Copy size={15} />
              </button>
            </p>
          )}
        </div>
      </div>

      {HUB.map((group) => (
        <div className="sst-hub-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="sst-hub-tiles">
            {group.tiles.filter((t) => !t.needsLink || store.slug).map(({
              icon: Icon, tone, label, sub, to, action,
            }) => {
              const body = (
                <>
                  <span className={`sst-hub-icon is-${tone}`}><Icon size={20} weight="fill" /></span>
                  <span className="sst-hub-text">
                    <strong>{label}</strong>
                    <small>{sub}</small>
                  </span>
                </>
              );
              return action === 'personal' ? (
                <button key={label} type="button" className="sst-hub-tile" onClick={onPersonal}>{body}</button>
              ) : (
                <Link key={label} to={to} className="sst-hub-tile">{body}</Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function SellerSettings() {
  const layoutCtx = useOutletContext() || {};
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // On / off settings being saved, so a second tap waits for the first.
  const [saving, setSaving] = useState({});
  const [awayOpen, setAwayOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [language, setLanguageState] = useState(() => getCurrentLanguage());
  const [reloadKey, setReloadKey] = useState(0);
  const { enabled: ridersOn } = useMoormove();
  const isPhone = usePhoneLayout();
  const statusRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    axios.get('/stores/my/store')
      .then((res) => { if (!cancelled) { setStore(res.data); setLoadFailed(false); } })
      .catch((err) => {
        if (cancelled) return;
        setStore(null);
        // No shop is a 404; anything else is a failed load, not "no shop".
        setLoadFailed(err?.status !== 404);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // The saved shop, here and in the Seller Center's copy (Me, Home, setup).
  const applySaved = (next) => {
    if (!next) return;
    setStore((s) => ({ ...s, ...next }));
    layoutCtx.setStore?.((prev) => (prev ? { ...prev, ...next } : prev));
  };

  // Flip an on / off setting at once, and put it back if saving fails.
  const flip = async (changes, failMessage, doneMessage) => {
    const key = Object.keys(changes).join(',');
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, store[k]]));
    setSaving((s) => ({ ...s, [key]: true }));
    setStore((s) => ({ ...s, ...changes }));
    try {
      const res = await axios.put(`/stores/${store.id}`, changes);
      applySaved(res.data);
      layoutCtx.refreshSetup?.();
      if (doneMessage) toast.success(doneMessage);
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
    <SellerPageHead title="Shop Settings" subtitle="Switches for how your shop runs" />
  );

  if (isLoading || !store) {
    return (
      <div className="seller-dashboard sme sst">
        <div className="seller-container">
          {head}
          <div className="seller-card sst-state">
            {isLoading ? (
              <Skeleton.Text lines={3} height={14} />
            ) : loadFailed ? (
              <LoadFailed onRetry={() => { setIsLoading(true); setReloadKey((k) => k + 1); }} what="your settings" compact />
            ) : (
              <>
                <EmptyArt name="launch" size={88} />
                <p>You don&apos;t have a shop yet. Create one from Shop Profile first.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pendingDeletion = !!store.deletionRequestedAt;
  const deletionDate = pendingDeletion
    ? new Date(store.deletionScheduledAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // Away: no new orders until the date the shop is back.
  const away = awayUntil(store);
  const selling = store.isActive !== false;

  const endAway = () => {
    setAwayOpen(false);
    flip({ vacationUntil: null, vacationNote: null }, 'Could not end away mode', 'You are taking orders again');
  };

  const stopSelling = async () => {
    const ok = await confirmAction({
      title: 'Stop selling for now?',
      message: 'Your shop and all its products are hidden from buyers until you start selling again. Orders you already have stay open. For a short break, "Away for a few days" keeps your shop visible instead.',
      confirmLabel: 'Stop selling',
      danger: true,
    });
    if (ok) flip({ isActive: false }, 'Could not stop selling', 'Your shop is hidden from buyers');
  };

  const hours = weekLines(store);
  const mode = store.fulfillmentMode || 'DELIVERY';
  const delivers = mode !== 'PICKUP';
  const cod = store.acceptsCod !== false;
  const qr = Boolean(store.paymentQrImage);
  const onCod = (on) => {
    if (!on && !qr) {
      toast.error('Add a QR code in Delivery & payment first, so buyers can still pay.');
      return;
    }
    flip({ acceptsCod: on }, 'Could not change cash on delivery');
  };

  // MoorMove riders: only while the site has them on, for a shop that delivers.
  const riders = store.moormoveEnabled !== false;
  const pinned = store.latitude != null && store.longitude != null;
  const ridersSub = !riders ? 'Off' : pinned ? 'Buyers can pick a rider at checkout' : 'Pin your shop in Delivery so riders can find it';

  return (
    <div className="seller-dashboard sme sst">
      <div className="seller-container">
        {head}

        <div className="sh-body sst-body">
          {!isPhone && <SettingsHub store={store} onPersonal={layoutCtx.switchToPersonal} />}

          {pendingDeletion && (
            <button
              type="button"
              className="sst-pending-line"
              onClick={() => statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              Your shop is hidden and will be deleted on {deletionDate}. <span>Cancel below</span>
            </button>
          )}

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
            <ToggleRow
              icon={Money}
              label="Cash on delivery"
              sub={cod ? 'Buyers pay when the order arrives' : 'Off: buyers pay by QR'}
              checked={cod}
              disabled={Boolean(saving.acceptsCod)}
              onChange={onCod}
            />
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
            <p className="sst-more">
              Delivery areas, fees, pickup spot and payment QR are in{' '}
              <Link to="/seller/fulfillment">Delivery &amp; payment</Link>.
            </p>
          </section>

          {/* The three ways to stop orders, side by side, lightest first. */}
          <section
            id="shop-status"
            ref={statusRef}
            className={`sh-card sme-list sst-group sst-status${pendingDeletion ? ' settings-deletion-pending' : ''}`}
            aria-label="Take a break or close"
          >
            <h2>Take a break or close</h2>
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
                  <RotateCcw size={15} /> Cancel deletion
                </button>
              </div>
            ) : (
              <>
                <div className="sst-status-grid">
                  <StatusOption
                    icon={AirplaneTilt}
                    title="Away for a few days"
                    text="Buyers still see your shop and products, but can't order until the day you're back. It ends on its own."
                    state={away ? `On: away until ${shortDate(away)}${store.vacationNote ? ` · “${store.vacationNote}”` : ''}` : null}
                    tone={away ? 'on' : ''}
                  >
                    {away ? (
                      <button type="button" className="btn-seller-outline" onClick={endAway} disabled={Boolean(saving['vacationUntil,vacationNote'])}>
                        I&apos;m back: take orders
                      </button>
                    ) : (
                      <button type="button" className="btn-seller-outline" aria-expanded={awayOpen} onClick={() => setAwayOpen((o) => !o)}>
                        {awayOpen ? 'Close' : 'Set the day you are back'}
                      </button>
                    )}
                  </StatusOption>

                  <StatusOption
                    icon={selling ? PauseCircle : PlayCircle}
                    title="Stop selling for now"
                    text="Your shop and products are hidden from buyers until you turn selling back on. No end date."
                    state={selling ? null : 'On: your shop is hidden from buyers'}
                    tone={selling ? '' : 'on'}
                  >
                    {selling ? (
                      <button type="button" className="btn-seller-outline" onClick={stopSelling} disabled={Boolean(saving.isActive)}>
                        Stop selling
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-seller-primary"
                        onClick={() => flip({ isActive: true }, 'Could not start selling again', 'Your shop is visible again')}
                        disabled={Boolean(saving.isActive)}
                      >
                        Start selling again
                      </button>
                    )}
                  </StatusOption>

                  <StatusOption
                    icon={Trash}
                    title="Delete shop"
                    text="Hidden from buyers at once and deleted for good after 15 days. You can cancel in that time."
                    tone="danger"
                  >
                    <button type="button" className="btn-seller-outline btn-danger-outline" onClick={() => setDeleteConfirm(true)}>
                      Delete shop
                    </button>
                  </StatusOption>
                </div>
                {awayOpen && !away && (
                  <div className="sst-panel sst-away-panel">
                    <AwayForm store={store} onSaved={applySaved} onDone={() => setAwayOpen(false)} />
                  </div>
                )}
              </>
            )}
          </section>

          <section className="sh-card sme-list sst-group">
            <h2>This device</h2>
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
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        title={`Delete "${store.name}"?`}
        message="Your shop will be hidden from buyers right away. It will be permanently deleted in 15 days unless you cancel before then."
        confirmLabel="Delete shop"
        cancelLabel="Keep my shop"
        danger
        loading={isSubmitting}
        onConfirm={confirmRequestDeletion}
        onCancel={() => setDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={cancelConfirm}
        title="Cancel shop deletion?"
        message="Your shop will immediately become active and visible to buyers again."
        confirmLabel="Keep my shop"
        cancelLabel="Not now"
        loading={isSubmitting}
        onConfirm={confirmCancelDeletion}
        onCancel={() => setCancelConfirm(false)}
      />
    </div>
  );
}
