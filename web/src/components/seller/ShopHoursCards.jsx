import { useState } from 'react';
import toast from 'react-hot-toast';
import { AirplaneTilt, Clock, CircleNotch as Loader2 } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { DAYS, awayUntil, shortDate } from '../../lib/shopHours';
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

/**
 * Shop Settings: going away for a while (no new orders, products stay on
 * show) and the week's opening hours with the days an order takes to get
 * ready. Saves straight to the shop (PUT /stores/:id).
 */
export default function ShopHoursCards({ store, onSaved }) {
  const away = awayUntil(store);
  const [backOn, setBackOn] = useState(tomorrowISO());
  const [note, setNote] = useState(store.vacationNote || '');
  const [savingAway, setSavingAway] = useState(false);

  const [week, setWeek] = useState(() => weekForm(store.openingHours));
  const [prepDays, setPrepDays] = useState(store.prepDays ?? '');
  const [savingHours, setSavingHours] = useState(false);

  const save = async (data, setBusy, message) => {
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

  const goAway = () => {
    // Back at the start of that day, Manila time.
    const until = new Date(`${backOn}T00:00:00+08:00`);
    save({ vacationUntil: until.toISOString(), vacationNote: note }, setSavingAway, `Away until ${shortDate(until)}`);
  };
  const comeBack = () => save({ vacationUntil: null, vacationNote: null }, setSavingAway, 'Your shop takes orders again');

  const setDay = (key, patch) => setWeek((w) => ({ ...w, [key]: { ...w[key], ...patch } }));
  const badRange = DAYS.some(([key]) => week[key].open && week[key].from >= week[key].to);
  const saveHours = () => save({
    openingHours: Object.fromEntries(DAYS.map(([key]) => [key, week[key].open ? [[week[key].from, week[key].to]] : []])),
    prepDays: prepDays === '' ? null : Number(prepDays),
  }, setSavingHours, 'Opening hours saved');
  const clearHours = async () => {
    if (await save({ openingHours: null }, setSavingHours, 'Opening hours removed')) setWeek(weekForm(null));
  };

  return (
    <>
      <div className={`seller-card shc-card${away ? ' is-away' : ''}`}>
        <div className="seller-card-header">
          <h2><AirplaneTilt size={16} /> Away mode</h2>
        </div>
        <div className="shc-body">
          {away ? (
            <>
              <p className="shc-status">
                Your shop is away until <strong>{shortDate(away)}</strong>. Buyers can see your products but can&apos;t order until then.
              </p>
              {store.vacationNote && <p className="shc-note">&ldquo;{store.vacationNote}&rdquo;</p>}
              <button type="button" className="btn-seller-primary" onClick={comeBack} disabled={savingAway}>
                {savingAway ? <Loader2 size={15} className="spin" /> : null} I&apos;m back, take orders
              </button>
            </>
          ) : (
            <>
              <p className="shc-help">
                Going on a trip or out of stock for a while? Buyers still see your products, with the date you are back, but can&apos;t order until then.
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
              <button type="button" className="btn-seller-outline" onClick={goAway} disabled={savingAway || !backOn}>
                {savingAway ? <Loader2 size={15} className="spin" /> : <AirplaneTilt size={15} />} Go away until then
              </button>
            </>
          )}
        </div>
      </div>

      <div className="seller-card shc-card">
        <div className="seller-card-header">
          <h2><Clock size={16} /> Opening hours</h2>
        </div>
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
              <button type="button" className="btn-seller-outline" onClick={clearHours} disabled={savingHours}>Remove hours</button>
            )}
            <button type="button" className="btn-seller-primary" onClick={saveHours} disabled={savingHours || badRange}>
              {savingHours ? <Loader2 size={15} className="spin" /> : null} Save hours
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
