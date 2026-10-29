import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CircleNotch, FloppyDisk, Image as ImageIcon } from '../../lib/icons';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import { confirmAction } from '../../lib/confirm';
import useAppSettings, { APP_SETTINGS_QUERY_KEY, DEFAULT_APP_SETTINGS } from '../../hooks/useAppSettings';
import CategoryIcon from '../CategoryIcon';
import './PlatformSettings.css';

/*
 * The super admin's platform-wide settings, each on the page of the part of
 * E-MOORM it changes rather than all under Settings › App branding:
 *
 *   Couriers          shop delivery fees (the defaults)
 *   Municipal admins  admins per municipality
 *   Buyers            buyer ID verification before checkout
 *   Products          Available Today, 3D views
 *   Categories        how the homepage shows categories
 *
 * A switch saves as it is flipped; numbers save with their card's button.
 * Settings › App branding links to each card (#its-id).
 */

function useSaveSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const save = async (changes, done) => {
    setSaving(true);
    try {
      const res = await axios.put('/app-settings', changes);
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, { ...DEFAULT_APP_SETTINGS, ...(res.data || {}) });
      queryClient.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not save the setting');
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

/** A card of platform settings; opened by its link (#id), it scrolls into view. */
function SettingsCard({ id, title, hint, children, footer }) {
  const { hash } = useLocation();
  const ref = useRef(null);
  useEffect(() => {
    if (hash !== `#${id}`) return undefined;
    // Again once the list above it has loaded and pushed it down.
    const go = () => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    go();
    const later = [setTimeout(go, 700), setTimeout(go, 1600)];
    return () => later.forEach(clearTimeout);
  }, [hash, id]);
  return (
    <section id={id} ref={ref} className={`admin-card ps-card${hash === `#${id}` ? ' is-target' : ''}`} aria-labelledby={`${id}-title`}>
      <header className="ps-head">
        <h2 id={`${id}-title`}>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      {children}
      {footer && <footer className="ps-foot">{footer}</footer>}
    </section>
  );
}

function SettingRow({ label, help, children }) {
  const id = useId();
  return (
    <div className="ps-row" role="group" aria-labelledby={id}>
      <div className="ps-label">
        <strong id={id}>{label}</strong>
        {help && <span>{help}</span>}
      </div>
      <div className="ps-control">{children}</div>
    </div>
  );
}

/**
 * An on/off switch for a setting every shop or buyer feels. Flipping it asks
 * first when `confirm(next)` gives a question ({ title, message }).
 */
function SwitchRow({ label, help, checked, onChange, disabled, text, confirm }) {
  const flip = async (next) => {
    const ask = confirm?.(next);
    if (ask && !(await confirmAction({ confirmLabel: next ? 'Turn on' : 'Turn off', danger: !next, ...ask }))) return;
    onChange(next);
  };
  return (
    <SettingRow label={label} help={help}>
      <label className="ps-switch">
        <input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled} onChange={(e) => flip(e.target.checked)} />
        <span className="ps-switch-track" aria-hidden="true"><span className="ps-switch-thumb" /></span>
        <span>{text}</span>
        <strong className={`ps-switch-state${checked ? ' is-on' : ''}`}>{checked ? 'On' : 'Off'}</strong>
      </label>
    </SettingRow>
  );
}

const SaveButton = ({ saving, onClick }) => (
  <button type="button" className="admin-btn admin-btn-primary" onClick={onClick} disabled={saving}>
    {saving ? <CircleNotch size={14} className="spin" /> : <FloppyDisk size={14} weight="fill" />}
    {saving ? 'Saving…' : 'Save'}
  </button>
);

/* ── Couriers: shop delivery fees ─────────────────────────── */

const deliveryOf = (s) => ({
  deliveryFee: String(s.deliveryFee ?? DEFAULT_APP_SETTINGS.deliveryFee),
  deliveryPerKm: String(Number(s.deliveryPerKm ?? DEFAULT_APP_SETTINGS.deliveryPerKm)),
  deliveryIncludedKm: String(Number(s.deliveryIncludedKm ?? DEFAULT_APP_SETTINGS.deliveryIncludedKm)),
});

/** "The starting fee covers the first 3 km. A 5 km delivery costs ₱70." */
function deliveryExample(form) {
  const base = Number(form.deliveryFee);
  const perKm = Number(form.deliveryPerKm);
  const included = Number(form.deliveryIncludedKm);
  const lead = 'The starting fee covers this many km by road.';
  if (![base, perKm, included].every((n) => Number.isFinite(n) && n >= 0)) return lead;
  const km = Math.max(5, Math.ceil(included) + 2);
  const cost = Math.round(base + Math.max(0, km - included) * perKm);
  return `${lead} A ${km} km delivery costs ₱${cost.toLocaleString('en-PH')}.`;
}

function DeliveryForm({ initial }) {
  const [form, setForm] = useState(initial);
  const { save, saving } = useSaveSettings();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = () => {
    const fee = Number(form.deliveryFee);
    const perKm = Number(form.deliveryPerKm);
    const included = Number(form.deliveryIncludedKm);
    if (form.deliveryFee.trim() === '' || !Number.isFinite(fee) || fee < 0) return toast.error('The starting fee must be ₱0 or more');
    if (form.deliveryPerKm.trim() === '' || !Number.isFinite(perKm) || perKm < 0 || perKm > 1000) return toast.error('Each extra km must cost ₱0 to ₱1,000');
    if (form.deliveryIncludedKm.trim() === '' || !Number.isFinite(included) || included < 0 || included > 100) return toast.error('The km included must be 0 to 100');
    const changes = {};
    if (fee !== Number(initial.deliveryFee)) changes.deliveryFee = fee;
    if (perKm !== Number(initial.deliveryPerKm)) changes.deliveryPerKm = perKm;
    if (included !== Number(initial.deliveryIncludedKm)) changes.deliveryIncludedKm = included;
    if (!Object.keys(changes).length) return toast.success('No changes to save');
    return save(changes, 'Delivery fees saved');
  };
  return (
    <SettingsCard
      id="delivery-fees"
      title="Shop delivery fees"
      hint="What a shop's own delivery costs when the shop has not set its fees. Sellers set theirs in Fulfillment & Payment; pickup is never charged. Courier and MoorMove fees are their own."
      footer={<SaveButton saving={saving} onClick={submit} />}
    >
      <SettingRow label="Starting fee (₱)" help="Charged for every delivery, and covers the first km below.">
        <input className="admin-input ps-number" type="number" min="0" step="0.01" inputMode="decimal" value={form.deliveryFee} onChange={set('deliveryFee')} />
      </SettingRow>
      <SettingRow label="First km included" help={deliveryExample(form)}>
        <input className="admin-input ps-number" type="number" min="0" max="100" step="0.5" inputMode="decimal" value={form.deliveryIncludedKm} onChange={set('deliveryIncludedKm')} />
      </SettingRow>
      <SettingRow label="Each extra km (₱)" help="Added for every km by road past the km included.">
        <input className="admin-input ps-number" type="number" min="0" max="1000" step="0.5" inputMode="decimal" value={form.deliveryPerKm} onChange={set('deliveryPerKm')} />
      </SettingRow>
    </SettingsCard>
  );
}

export function DeliveryFeesSettings() {
  const { settings } = useAppSettings();
  const initial = deliveryOf(settings);
  // A fresh form whenever the saved values change (loaded, or just saved).
  return <DeliveryForm key={JSON.stringify(initial)} initial={initial} />;
}

/* ── Municipal admins: team size ──────────────────────────── */

function TeamSizeForm({ initial }) {
  const [value, setValue] = useState(initial);
  const { save, saving } = useSaveSettings();
  const submit = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 20) return toast.error('Admins per municipality must be a whole number from 1 to 20');
    if (n === Number(initial)) return toast.success('No changes to save');
    return save({ adminTeamMax: n }, 'Team size saved');
  };
  return (
    <SettingsCard
      id="team-size"
      title="Admin teams"
      hint="Each municipality's admins add and remove their own team members in Admin team."
      footer={<SaveButton saving={saving} onClick={submit} />}
    >
      <SettingRow label="Admins per municipality" help="The most admins one municipality's team may have, its primary admin included.">
        <input className="admin-input ps-number" type="number" min="1" max="20" step="1" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      </SettingRow>
    </SettingsCard>
  );
}

export function TeamSizeSettings() {
  const { settings } = useAppSettings();
  const initial = String(settings.adminTeamMax ?? 5);
  return <TeamSizeForm key={initial} initial={initial} />;
}

/* ── Buyers: ID verification ──────────────────────────────── */

export function BuyerVerificationSettings() {
  const { settings } = useAppSettings();
  const { save, saving } = useSaveSettings();
  const on = settings.requireBuyerVerification !== false;
  return (
    <SettingsCard id="buyer-verification" title="Buyer verification">
      <SwitchRow
        label="ID before checkout"
        help={on
          ? 'On: buyers must verify a government ID before they can check out.'
          : 'Off: anyone with an account can check out. Verification stays available and records are kept.'}
        checked={on}
        disabled={saving}
        text="Require verification before checkout"
        confirm={(v) => ({
          title: v ? 'Require an ID before checkout?' : 'Let buyers check out without an ID?',
          message: v ? 'Buyers who have not verified a government ID will be stopped at checkout until they do.' : 'Anyone with an account can check out again. Verification stays available.',
        })}
        onChange={(v) => save({ requireBuyerVerification: v }, v ? 'Buyers now verify their ID before checkout' : 'Buyers can check out without an ID check')}
      />
    </SettingsCard>
  );
}

/* ── Products: features ───────────────────────────────────── */

export function ProductFeatureSettings() {
  const { settings } = useAppSettings();
  const { save, saving } = useSaveSettings();
  const today = settings.availableTodayEnabled !== false;
  const threeD = settings.product3dEnabled === true;
  return (
    <SettingsCard id="product-features" title="Product features" hint="Turn parts of selling on or off for every shop.">
      <SwitchRow
        label="Available Today"
        help={today
          ? 'On: shops can post fresh food and produce for a limited time, and buyers see them on Home and in Available Today.'
          : 'Off: Available Today is hidden and shops cannot post. Their posts are kept for when it is back on.'}
        checked={today}
        disabled={saving}
        text="Turn on Available Today"
        confirm={(v) => (v ? null : {
          title: 'Turn off Available Today?',
          message: 'It disappears from Home for buyers, and shops can no longer post. Their posts are kept for when it is back on.',
        })}
        onChange={(v) => save({ availableTodayEnabled: v }, v ? 'Available Today is on' : 'Available Today is off')}
      />
      <SwitchRow
        label="3D views of products"
        help={threeD
          ? 'On: sellers can add 3D views; buyers can turn them and see them in AR.'
          : 'Off: 3D views are hidden; saved ones are kept.'}
        checked={threeD}
        disabled={saving}
        text="Turn on 3D views"
        confirm={(v) => (v ? null : {
          title: 'Turn off 3D views?',
          message: 'Buyers stop seeing 3D views and sellers cannot add new ones. Saved 3D views are kept.',
        })}
        onChange={(v) => save({ product3dEnabled: v }, v ? '3D views are on' : '3D views are off')}
      />
    </SettingsCard>
  );
}

/* ── Categories: the homepage's look ──────────────────────── */

export function CategoryStyleSettings() {
  const { settings } = useAppSettings();
  const { save, saving } = useSaveSettings();
  const style = settings.categoryStyle === 'ICON' ? 'ICON' : 'IMAGE';
  return (
    <SettingsCard id="category-style" title="Homepage categories">
      <SettingRow
        label="Shop by Category"
        help="How the homepage shows categories. Each category's icon is chosen on its page; Auto picks one from the name."
      >
        <div className="ps-choices" role="radiogroup" aria-label="Homepage categories">
          {[
            { value: 'IMAGE', title: 'Pictures', text: "Each category's photo" },
            { value: 'ICON', title: 'Icons', text: 'Gradient icons, no photos' },
          ].map(({ value, title, text }) => (
            <label key={value} className={`ps-choice${style === value ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="categoryStyle"
                value={value}
                checked={style === value}
                disabled={saving}
                onChange={() => save({ categoryStyle: value }, value === 'ICON' ? 'The homepage shows category icons' : 'The homepage shows category pictures')}
              />
              <span className="ps-choice-preview" aria-hidden="true">
                {value === 'IMAGE'
                  ? [0, 1, 2].map((i) => <span key={i} className="ps-choice-photo"><ImageIcon size={16} /></span>)
                  : ['fruit', 'vegetable', 'seafood'].map((key) => (
                    <span key={key} className="ps-choice-icon"><CategoryIcon iconKey={key} size={22} /></span>
                  ))}
              </span>
              <span className="ps-choice-text">
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </label>
          ))}
        </div>
      </SettingRow>
    </SettingsCard>
  );
}
