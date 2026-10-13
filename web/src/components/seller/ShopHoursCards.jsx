import { useState } from 'react';
import toast from 'react-hot-toast';
import { AirplaneTilt, CircleNotch as Loader2 } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { DAYS, shortDate } from '../../lib/shopHours';
import './ShopHoursCards.css';
import Select from '../ui/Select';

const DEFAULT_RANGE = ['08:00', '17:00'];

// The form's week: every day, open with one range or closed.
const weekForm = (hours) => Object.fromEntries(DAYS.map(([key]) => {
  const ranges = hours?.[key];
  return [key, ranges === undefined
    // Nothing set yet: Monday to Saturday as a start. A set week without
    // this day: closed.
    ? { open: hours ? false : key !== 'sun', from: DEFAULT_RANGE[0], to: DEFAULT_RANGE[1] }
    : { open: ranges.length > 0, from: ranges[0]?.[0] || DEFAULT_RANGE[0], to: ranges[0]?.[1] || DEFAULT_RANGE[1] }];
}));

const tomorrowISO = () => {
  const d = new Date(Date.now() + 86400e3);
  return d.toISOString().slice(0, 10);
};

// Saves straight to the shop (PUT /stores/:id) and hands the saved shop on.
const useShopSave = (store, onSaved) => {
  const [busy, setBusy] = useState(false);
  const save = async (data, message) => {
    setBusy(true);
    try {
      const res = await axios.put(`/stores/${store.id}`, data);
      onSaved?.(res.data);
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [save, busy];
};

/**
 * Shop Settings, Away mode: the date the shop is back and a note for buyers.
 * Buyers still see the products but can't order until then. `onDone` runs
 * after it is saved, and on Cancel.
 */
export function AwayForm({ store, onSaved, onDone }) {
  const [backOn, setBackOn] = useState(tomorrowISO());
  const [note, setNote] = useState(store.vacationNote || '');
  const [save, saving] = useShopSave(store, onSaved);

  const goAway = async () => {
    // Back at the start of that day, Manila time.
    const until = new Date(`${backOn}T00:00:00+08:00`);
    if (await save({ vacationUntil: until.toISOString(), vacationNote: note }, `Away until ${shortDate(until)}`)) onDone?.();
  };

  return (
    <div className="shc-body">
      <p className="shc-help">
        Buyers still see your products, with the date you are back, but can&apos;t order until then.
      </p>
      <div className="shc-row">
        <label className="shc-field">
          <span>Back on</span>
          <input type="date" value={backOn} min={tomorrowISO()} onChange={(e) => setBackOn(e.target.value)} />
        </label>
        <label className="shc-field shc-grow">
          <span>Note for buyers (optional)</span>
          <input
            type="text"
            maxLength={200}
            value={note}
            placeholder="e.g. Harvest season, back next week!"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <div className="shc-actions">
        {onDone && <button type="button" className="btn-seller-outline" onClick={onDone} disabled={saving}>Cancel</button>}
        <button type="button" className="btn-seller-primary" onClick={goAway} disabled={saving || !backOn}>
          {saving ? <Loader2 size={15} className="spin" /> : <AirplaneTilt size={15} />} Go away
        </button>
      </div>
    </div>
  );
}

/**
 * Shop Settings, Opening hours: the week's hours (shown on the shop page
 * with "Open now" or "Closed now") and the days an order takes to get ready.
 */
export function HoursForm({ store, onSaved }) {
  const [week, setWeek] = useState(() => weekForm(store.openingHours));
  const [prepDays, setPrepDays] = useState(store.prepDays ?? '');
  const [save, saving] = useShopSave(store, onSaved);

  const setDay = (key, patch) => setWeek((w) => ({ ...w, [key]: { ...w[key], ...patch } }));
  const badRange = DAYS.some(([key]) => week[key].open && week[key].from >= week[key].to);
  const saveHours = () => save({
    openingHours: Object.fromEntries(DAYS.map(([key]) => [key, week[key].open ? [[week[key].from, week[key].to]] : []])),
    prepDays: prepDays === '' ? null : Number(prepDays),
  }, 'Opening hours saved');
  const clearHours = async () => {
    if (await save({ openingHours: null }, 'Opening hours removed')) setWeek(weekForm(null));
  };

  return (
    <div className="shc-body">
      <p className="shc-help">Shown on your shop page with &ldquo;Open now&rdquo; or &ldquo;Closed now&rdquo;. Buyers can still order when you are closed.</p>
      <div className="shc-week">
        {DAYS.map(([key, label]) => (
          <div className={`shc-day${week[key].open ? '' : ' is-closed'}`} key={key}>
            <label className="shc-day-toggle">
              <input type="checkbox" checked={week[key].open} onChange={(e) => setDay(key, { open: e.target.checked })} />
              <span>{label}</span>
            </label>
            {week[key].open ? (
              <div className="shc-times">
                <input type="time" aria-label={`${label} opens`} value={week[key].from} onChange={(e) => setDay(key, { from: e.target.value })} />
                <span>to</span>
                <input type="time" aria-label={`${label} closes`} value={week[key].to} onChange={(e) => setDay(key, { to: e.target.value })} />
              </div>
            ) : (
              <span className="shc-closed">Closed</span>
            )}
          </div>
        ))}
      </div>
      {badRange && <p className="shc-error">A day closes before it opens. Check the times.</p>}

      <label className="shc-field shc-prep">
        <span>Days to get an order ready</span>
        <Select value={prepDays} onChange={(e) => setPrepDays(e.target.value)}>
          <option value="">Not set (1 day)</option>
          <option value="0">Same day</option>
          {[1, 2, 3, 4, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'}</option>)}
        </Select>
        <small>Buyers see when to expect their order from this.</small>
      </label>

      <div className="shc-actions">
        {store.openingHours && (
          <button type="button" className="btn-seller-outline" onClick={clearHours} disabled={saving}>Remove hours</button>
        )}
        <button type="button" className="btn-seller-primary" onClick={saveHours} disabled={saving || badRange}>
          {saving ? <Loader2 size={15} className="spin" /> : null} Save hours
        </button>
      </div>
    </div>
  );
}
