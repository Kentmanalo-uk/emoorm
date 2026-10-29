import {
  useEffect, useId, useMemo, useRef, useState,
} from 'react';
import {
  Check, DotsThree, Gift, MagnifyingGlass, MapPin, Path, Plus, Tag, Warning,
} from '../../../lib/icons';
import {
  MAX_FEE, QUICK_FEES, brgyKey, brgyLabel, distanceFeeAt, distanceProblems, distanceRate, feeLabel,
  fillMissingFees, isWhole, parseFee, pesos, placeTitle, plural, putAllTowns, putPlace, removePlace, setAllFees,
  sortPlaces, unpricedPlaces, wholeTown,
} from '../../../lib/deliveryPlan';
import { SERVICE_MUNICIPALITIES, listBarangaysByMunicipality, normalizeName } from '../../../lib/phAddress';
import useInlinePanel from './useInlinePanel';
import './DeliveryPlaces.css';

/**
 * "Delivery places and fees", on the page itself (no sheets, no steps):
 * at the top the way to charge, [Free delivery], [Fee per place] or [By
 * distance] (its numbers show right under it); fees typed per place are kept
 * while delivery is free or by distance. Then one line per place with its fee right
 * next to it, typed in place (saved on Enter, when the box is left, or a
 * moment after typing stops) or set Free with one tap; the ⋯ on a line holds
 * "Change barangays" and "Remove". "+ Add a place" opens one small form:
 * town, all of it or some barangays, the fee, [Add]. One panel is open at a
 * time; focus moves into it and back to what opened it.
 *
 * Every change goes to onCommit(nextPlan, message): the Delivery page saves
 * it at once (message false: no toast, the line shows a small "Saved"), the
 * guided setup keeps it until "Save and continue". lib/deliveryPlan.js turns
 * the list into the request.
 *
 * @param {Object} props
 * @param {Object} props.plan - lib/deliveryPlan.js
 * @param {Function} props.onCommit - (nextPlan, message|false) => Promise|void
 * @param {Array<{id, name}>} props.municipalities
 * @param {String} props.homeId - The shop's own town
 * @param {{base, included, perKm}} props.platformRate - The platform's by-distance numbers
 * @param {React.ReactNode} [props.distanceExtras] - With "By distance": the shop pin note / map
 * @param {String} [props.distanceNote] - With "By distance", when there are no extras: why the shop pin matters
 * @param {Boolean} [props.allowDistance] - Offer "By distance"
 * @param {Boolean} [props.showHead] - The title
 */
export default function DeliveryPlaces({
  plan, onCommit, municipalities, homeId, platformRate, distanceExtras = null, distanceNote = null,
  allowDistance = true, showHead = true,
}) {
  const nameOf = (id) => municipalities.find((m) => m.id === id)?.name || '';
  const homeName = nameOf(homeId) || 'your town';
  const { panel, open, close } = useInlinePanel();
  const [busy, setBusy] = useState(false);
  // "By distance" picked but not saved yet (its numbers still to fill in).
  const [wantDistance, setWantDistance] = useState(false);
  const charging = plan.distance ? 'distance' : plan.free ? 'free' : 'places';

  // Saves one after another, each from the list as the last one left it (a
  // fee typed on one line and then another must not undo the first).
  const latest = useRef(plan);
  const queue = useRef(Promise.resolve());
  useEffect(() => { latest.current = plan; }, [plan]);
  const commitFrom = (build, message) => {
    const run = queue.current.then(async () => {
      const next = build(latest.current);
      if (!next) return true;
      setBusy(true);
      try {
        await onCommit(next, message);
        latest.current = next;
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    });
    queue.current = run.catch(() => {});
    return run;
  };
  const save = async (next, message) => {
    const ok = await commitFrom(() => next, message);
    if (ok) close();
    return ok;
  };
  const saveFee = (place, fee) => commitFrom((cur) => {
    const p = cur.places.find((x) => x.key === place.key);
    if (!p || (p.fee != null && Number(p.fee) === fee)) return null;
    return putPlace(cur, { ...p, fee }, p.key);
  }, false);

  const places = sortPlaces(plan.places, homeId, nameOf);
  const asksFees = panel?.kind === 'missing';
  const view = asksFees ? 'places' : (allowDistance && (plan.distance || wantDistance)) ? 'distance' : charging;
  const adding = panel?.kind === 'add' || panel?.kind === 'home';

  // The three ways to charge. Free saves at once; by distance once its
  // numbers are in. Back to fees per place: places added while delivery was
  // free or by distance need a fee first (asked right under the switch).
  const choose = (mode) => {
    if (busy || mode === view) return;
    close();
    if (mode === 'distance') {
      setWantDistance(true);
      return;
    }
    setWantDistance(false);
    if (mode === 'free') {
      if (!plan.free) commitFrom((cur) => ({ ...cur, free: true, distance: false }), 'Free delivery is on');
      return;
    }
    if (charging === 'places') return;
    if (unpricedPlaces(plan).length) {
      open({ kind: 'missing' }, `mode-${charging}`);
      return;
    }
    commitFrom((cur) => ({ ...cur, free: false, distance: false }), 'Fees per place are on again');
  };

  return (
    <section className="dpl" id="delivery-areas" aria-labelledby={showHead ? 'dpl-title' : undefined}>
      {showHead && <h3 className="dpl-title" id="dpl-title" tabIndex={-1}>Delivery places and fees</h3>}

      <FeeMode value={view} onChange={choose} allowDistance={allowDistance} />

      {asksFees && (
        <MissingFees
          count={unpricedPlaces(plan).length}
          onClose={close}
          onSave={(fee) => save({ ...fillMissingFees(plan, fee), distance: false, free: false }, 'Fees per place are on again')}
        />
      )}

      {view === 'distance' && (
        <DistanceFields
          key={`${plan.distance}:${JSON.stringify(plan.perKm)}`}
          plan={plan}
          platformRate={platformRate}
          extras={distanceExtras}
          note={distanceNote}
          busy={busy}
          onSave={(perKm) => commitFrom((cur) => ({
            ...cur, distance: true, free: false, perKm,
          }), plan.distance ? 'Distance fee saved' : 'Now charging by distance')}
        />
      )}

      {!places.length && !adding ? (
        <div className="dpl-empty" id="delivery-fee">
          <strong>No places yet</strong>
          <button type="button" className="dpl-btn is-primary is-big" data-dpl-focus="home" onClick={() => open({ kind: 'home' }, 'home')}>
            <MapPin size={18} weight="fill" /> Deliver only in {homeName}
          </button>
          <button type="button" className="dpl-btn is-big" data-dpl-focus="choose" onClick={() => open({ kind: 'add' }, 'choose')}>
            <Plus size={18} weight="bold" /> Choose places
          </button>
        </div>
      ) : (
        <>
          {view === 'places' && charging === 'places' && places.length > 1 && (
            <SameFee busy={busy} onApply={(fee) => commitFrom((cur) => setAllFees(cur, fee), `Every place: ${fee === 0 ? 'free delivery' : pesos(fee)}`)} />
          )}
          {view !== 'places' && places.length > 0 && <h4 className="dpl-sub-title">Places you deliver to</h4>}
          <PlaceList
            places={places}
            plan={plan}
            nameOf={nameOf}
            homeId={homeId}
            municipalities={municipalities}
            busy={busy}
            feeMode={view === 'distance' ? 'hidden' : view === 'free' ? 'free' : 'edit'}
            panel={panel}
            onOpen={open}
            onClose={close}
            onSave={save}
            onFee={saveFee}
            onRemove={(place) => commitFrom((cur) => removePlace(cur, place.key), `Removed ${placeTitle(place, nameOf).title}`)}
            addId="delivery-fee"
          />
        </>
      )}
    </section>
  );
}

/** [Free delivery] [Fee per place] [By distance]: big, the one in use filled green. */
function FeeMode({ value, onChange, allowDistance = true }) {
  const options = [
    {
      key: 'free', label: 'Free delivery', hint: 'Buyers pay nothing', Icon: Gift,
    },
    {
      key: 'places', label: 'Fee per place', hint: 'Per town or barangay', Icon: Tag,
    },
    allowDistance && {
      key: 'distance', label: 'By distance', hint: 'Goes up per km', Icon: Path,
    },
  ].filter(Boolean);
  return (
    <div className={`dpl-mode is-${options.length}`} role="group" aria-label="How buyers pay for delivery">
      {options.map(({
        key, label, hint, Icon,
      }) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            className={`dpl-mode-opt${on ? ' is-on' : ''}`}
            aria-pressed={on}
            data-dpl-focus={`mode-${key}`}
            onClick={() => onChange(key)}
          >
            <span className="dpl-mode-top" aria-hidden="true">
              <Icon size={22} weight="fill" />
              <span className={`dpl-mode-tick${on ? ' is-on' : ''}`}>{on && <Check size={14} weight="bold" />}</span>
            </span>
            <strong>{label}</strong>
            <small>{hint}</small>
          </button>
        );
      })}
    </div>
  );
}

/** "What buyers pay", in sentences (the guided setup's "all set" screen). */
export function PlacesSummary({ lines }) {
  if (!lines.length) return null;
  return (
    <div className="dpl-summary" aria-live="polite">
      <h4>What buyers pay</h4>
      <ul>
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

/** "Same fee for all [₱ ] [Apply to all]", above the list. */
function SameFee({ busy, onApply }) {
  const [text, setText] = useState('');
  const fee = parseFee(text);
  const bad = text.trim() !== '' && fee === undefined;
  const apply = async () => {
    if (fee == null || fee === undefined) return;
    await onApply(fee);
    setText('');
  };
  return (
    <div className="dpl-samefee">
      <span className="dpl-samefee-label" id="dpl-samefee-label">Same fee for all</span>
      <span className={`dpl-box is-small${bad ? ' has-error' : ''}`}>
        <span aria-hidden="true">₱</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Fee"
          value={text}
          aria-labelledby="dpl-samefee-label"
          aria-invalid={bad ? 'true' : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
        />
      </span>
      <button type="button" className="dpl-btn is-small" data-dpl-focus="all-fee" disabled={busy || fee == null || fee === undefined} onClick={apply}>
        Apply to all
      </button>
    </div>
  );
}

/**
 * The places, one line each with its fee right next to it (a town with
 * barangays of their own under a small town heading), then "+ Add a place".
 * The ⋯ on a line opens "Change barangays" and "Remove" under it. The panel
 * state is the caller's (useInlinePanel), so only one is open.
 * @param {Object} props
 * @param {Array} props.places - Sorted (sortPlaces)
 * @param {Object|null} props.panel - { kind: 'add'|'home'|'edit'|'menu'|'remove', place }
 * @param {Function} props.onOpen - (panel, from)
 * @param {Function} props.onSave - (nextPlan, message) => Promise<Boolean>|void
 * @param {Function} props.onFee - (place, fee) => Promise<Boolean>|void
 * @param {Function} props.onRemove - (place) => Promise<Boolean>|void
 * @param {'edit'|'free'|'hidden'} [props.feeMode] - Fee boxes, "Free" on every line, or no fees (by distance)
 */
export function PlaceList({
  places, plan, nameOf, homeId, municipalities, panel, onOpen, onClose, onSave, onFee, onRemove, busy = false,
  feeMode = plan.distance ? 'hidden' : plan.free ? 'free' : 'edit', addId,
}) {
  const adding = panel?.kind === 'add' || panel?.kind === 'home';
  const formProps = {
    plan, municipalities, homeId, onClose, onSave,
  };
  // The lines by town (sorted: the shop's town first); a town with
  // barangays of their own gets a small heading.
  const towns = [];
  for (const p of places) {
    const last = towns[towns.length - 1];
    if (last && last.id === p.municipalityId) last.places.push(p);
    else towns.push({ id: p.municipalityId, places: [p] });
  }
  const row = (p, headed) => {
    const { title } = placeTitle(p, nameOf);
    const shown = headed && !isWhole(p) ? brgyLabel(p.barangays[0]) : title;
    const mine = panel?.place?.key === p.key ? panel.kind : null;
    const home = p.municipalityId === homeId && isWhole(p);
    return (
      <li key={p.key} className={`dpl-row${mine === 'edit' ? ' is-open' : ''}`}>
        <div className="dpl-row-top">
          <MapPin size={20} weight="fill" className="dpl-row-pin" aria-hidden="true" />
          <div className="dpl-row-main">
            <strong>{shown}</strong>
            {p.barangays.length > 1 && <span className="dpl-row-detail">{p.barangays.join(', ')}</span>}
            {home && <span className="dpl-row-tags"><span className="dpl-tag">Your town</span></span>}
          </div>
          {feeMode === 'free' && <span className="dpl-free-tag">Free</span>}
          {feeMode === 'edit' && mine !== 'edit' && (
            <RowFee
              fee={p.fee}
              label={`Delivery fee, ${title}`}
              onSave={(fee) => onFee(p, fee)}
            />
          )}
          {mine !== 'edit' && (
            <button
              type="button"
              className={`dpl-more${mine ? ' is-on' : ''}`}
              data-dpl-focus={`more:${p.key}`}
              aria-label={`More for ${title}`}
              aria-expanded={mine === 'menu' || mine === 'remove'}
              onClick={() => (mine ? onClose() : onOpen({ kind: 'menu', place: p }, `more:${p.key}`))}
            >
              <DotsThree size={22} weight="bold" />
            </button>
          )}
        </div>
        {mine === 'menu' && (
          <RowMenu
            title={title}
            busy={busy}
            onChange={() => onOpen({ kind: 'edit', place: p }, `more:${p.key}`)}
            onRemove={() => onOpen({ kind: 'remove', place: p }, `more:${p.key}`)}
            onClose={onClose}
          />
        )}
        {mine === 'remove' && (
          <RemoveAsk
            title={title}
            busy={busy}
            onKeep={onClose}
            onRemove={async () => {
              const ok = await onRemove(p);
              if (ok !== false) onClose();
            }}
          />
        )}
        {mine === 'edit' && <PlaceForm key={`edit:${p.key}`} kind="edit" place={p} embedded {...formProps} />}
      </li>
    );
  };
  return (
    <>
      {places.length > 0 && (
        <div className="dpl-list">
          {towns.map((town) => {
            const headed = town.places.some((p) => !isWhole(p));
            return headed ? (
              <section key={town.id} className="dpl-town" aria-label={nameOf(town.id)}>
                <h5 className="dpl-town-name">{nameOf(town.id)}</h5>
                <ul className="dpl-rows">{town.places.map((p) => row(p, true))}</ul>
              </section>
            ) : (
              <ul key={town.id} className="dpl-rows">{town.places.map((p) => row(p, false))}</ul>
            );
          })}
        </div>
      )}
      {adding ? (
        <PlaceForm key={panel.kind} kind={panel.kind} {...formProps} />
      ) : (
        <button type="button" className="dpl-add" id={addId} data-dpl-focus="add" onClick={() => onOpen({ kind: 'add' }, 'add')}>
          <Plus size={18} weight="bold" /> Add a place
        </button>
      )}
    </>
  );
}

/**
 * A line's fee, typed in place: saved on Enter, when the box is left, or a
 * moment after typing stops; "Free" sets ₱0. A small "Saved" shows after.
 */
function RowFee({ fee, label, onSave }) {
  const shown = (f) => (f == null ? '' : String(Number(f)));
  const [text, setText] = useState(shown(fee));
  const [typing, setTyping] = useState(false);
  const [state, setState] = useState(null);
  const [prevFee, setPrevFee] = useState(fee);
  const timer = useRef(null);
  const inputRef = useRef(null);
  if (fee !== prevFee) {
    setPrevFee(fee);
    if (!typing) setText(shown(fee));
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const free = fee != null && Number(fee) === 0 && !typing;
  const parsed = parseFee(text);
  const bad = text.trim() !== '' && parsed === undefined;

  const put = async (next) => {
    clearTimeout(timer.current);
    if (next === undefined) return;
    if (next === null || (fee != null && Number(fee) === next)) {
      if (next === null) setText(shown(fee));
      return;
    }
    setState('saving');
    const ok = await onSave(next);
    setState(ok === false ? null : 'saved');
    if (ok === false) setText(shown(fee));
    else setTimeout(() => setState((s) => (s === 'saved' ? null : s)), 2500);
  };

  return (
    <span className="dpl-rowfee">
      {free ? (
        <button
          type="button"
          className="dpl-chip is-on is-free"
          aria-pressed="true"
          aria-label={`${label}: free. Tap to type an amount`}
          onClick={() => {
            setTyping(true);
            setText('');
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Check size={14} weight="bold" /> Free
        </button>
      ) : (
        <>
          <span className={`dpl-box is-row${bad ? ' has-error' : ''}${fee == null && !text ? ' is-missing' : ''}`}>
            <span aria-hidden="true">₱</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              placeholder={fee == null ? 'Fee' : '0'}
              value={text}
              aria-label={label}
              aria-invalid={bad ? 'true' : undefined}
              onFocus={() => setTyping(true)}
              onChange={(e) => {
                setText(e.target.value);
                clearTimeout(timer.current);
                const next = parseFee(e.target.value);
                if (next != null) timer.current = setTimeout(() => put(next), 1500);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') put(parseFee(text));
                if (e.key === 'Escape') {
                  setText(shown(fee));
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => {
                setTyping(false);
                put(parseFee(text));
              }}
            />
          </span>
          <button
            type="button"
            className="dpl-chip"
            aria-pressed="false"
            aria-label={`${label}: make it free`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTyping(false);
              setText('0');
              put(0);
            }}
          >
            Free
          </button>
        </>
      )}
      <span className={`dpl-rowfee-state${state ? ' is-on' : ''}`} role="status">
        {state === 'saved' && <><Check size={12} weight="bold" /> Saved</>}
        {state === 'saving' && 'Saving…'}
      </span>
    </span>
  );
}

/** The ⋯ menu, under the line: Change barangays, Remove. */
function RowMenu({
  title, busy, onChange, onRemove, onClose,
}) {
  const firstRef = useRef(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  return (
    <div className="dpl-row-menu" role="group" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <button type="button" ref={firstRef} onClick={onChange} disabled={busy}>Change barangays</button>
      <button type="button" className="is-remove" onClick={onRemove} disabled={busy}>Remove</button>
    </div>
  );
}

/** "Stop delivering here? [Keep] [Remove]", on the line. */
function RemoveAsk({
  title, busy, onKeep, onRemove,
}) {
  const keepRef = useRef(null);
  useEffect(() => { keepRef.current?.focus(); }, []);
  return (
    <div
      className="dpl-row-ask"
      role="group"
      aria-label={`Remove ${title}?`}
      onKeyDown={(e) => { if (e.key === 'Escape') onKeep(); }}
    >
      <span>Stop delivering here?</span>
      <button type="button" ref={keepRef} className="dpl-btn is-small" onClick={onKeep}>Keep</button>
      <button type="button" className="dpl-btn is-small is-danger" disabled={busy} onClick={onRemove}>
        {busy ? 'Removing…' : 'Remove'}
      </button>
    </div>
  );
}

/**
 * A fee: a ₱ box with [Free] [₱20] [₱30] [₱50] beside it.
 * @param {Object} props
 * @param {Number|null} props.value
 * @param {Function} props.onChange - (fee: Number|null)
 */
export function FeeChoice({
  value, onChange, label = 'Delivery fee', inputId,
}) {
  const shown = (f) => (f == null ? '' : String(Number(f)));
  const [text, setText] = useState(shown(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    const typed = parseFee(text);
    if ((value != null && typed !== value) || (value == null && typed != null)) setText(shown(value));
  }
  const bad = text.trim() !== '' && parseFee(text) === undefined;
  return (
    <div className="dpl-feeq">
      <span className={`dpl-box${bad ? ' has-error' : ''}`}>
        <span aria-hidden="true">₱</span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={text}
          aria-label={label}
          aria-invalid={bad ? 'true' : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const fee = parseFee(e.target.value);
            onChange(fee === undefined ? null : fee);
          }}
        />
      </span>
      <span className="dpl-chips" role="group" aria-label={`${label}: quick amounts`}>
        {QUICK_FEES.map((fee) => {
          const on = value != null && Number(value) === fee;
          return (
            <button
              key={fee}
              type="button"
              className={`dpl-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => {
                setText(String(fee));
                onChange(fee);
              }}
            >
              {fee === 0 ? 'Free' : pesos(fee)}
            </button>
          );
        })}
      </span>
      {bad && <span className="dpl-err">Enter ₱0 to ₱{MAX_FEE.toLocaleString('en-PH')}.</span>}
    </div>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** When it opens: in sight, and focus on its first field. */
function useOpenFocus(boxRef, firstRef) {
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight - 80) {
      box.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    firstRef.current?.focus({ preventScroll: true });
  }, [boxRef, firstRef]);
}

/**
 * Add a place, or change one, in one small form (no steps): the town, all
 * of it or some barangays (picked right there), the fee, [Add]. While
 * charging by distance there is no fee to ask.
 * @param {'add'|'home'|'edit'} props.kind
 * @param {Boolean} [props.embedded] - Inside a place's line (Change barangays)
 */
export function PlaceForm({
  kind, place, plan, municipalities, homeId, onClose, onSave, embedded = false,
}) {
  const editKey = kind === 'edit' ? place?.key : null;
  const skipFee = plan.distance || plan.free;
  const homeListed = plan.places.some((p) => p.municipalityId === homeId);
  const [town, setTown] = useState(() => {
    if (kind === 'edit') return place.municipalityId;
    if (kind === 'home' || (homeId && !homeListed)) return homeId || '';
    return '';
  });
  const [where, setWhere] = useState(kind === 'edit' && !isWhole(place) ? 'some' : 'all');
  const [barangays, setBarangays] = useState(kind === 'edit' ? [...place.barangays] : []);
  const [fee, setFee] = useState(kind === 'edit' ? place.fee : null);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const firstRef = useRef(null);
  const ids = useId();
  useOpenFocus(boxRef, firstRef);

  const nameOf = (id) => municipalities.find((m) => m.id === id)?.name || 'Town';
  const all = town === 'all';
  const townName = town && !all ? nameOf(town) : '';
  const listedWhole = town && !all ? wholeTown(plan, town, editKey) : null;
  const listed = new Set(plan.places.map((p) => p.municipalityId));
  const others = municipalities.filter((m) => m.id !== homeId);
  const ready = Boolean(town) && (all || where === 'all' || barangays.length > 0) && (skipFee || fee != null);

  const pickTown = (id) => {
    setTown(id);
    setWhere('all');
    setBarangays([]);
    const whole = id && id !== 'all' ? wholeTown(plan, id, editKey) : null;
    if (whole && fee == null) setFee(whole.fee);
  };
  const submit = async () => {
    if (!ready || saving) return;
    const theFee = skipFee ? (place?.fee ?? null) : fee;
    const next = all
      ? putAllTowns(plan, municipalities.map((m) => m.id), theFee)
      : putPlace(plan, { municipalityId: town, barangays: where === 'some' ? barangays : [], fee: theFee }, editKey);
    setSaving(true);
    try {
      await onSave(next, all ? 'All towns added' : 'Delivery place saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={boxRef}
      className={`dpl-form${embedded ? ' is-embedded' : ''}`}
      role="group"
      aria-label={kind === 'edit' ? 'Change this place' : 'Add a place'}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target.tagName === 'INPUT' && e.target.value)) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="dpl-field">
        <label className="dpl-field-label" htmlFor={`${ids}-town`}>Town</label>
        <select id={`${ids}-town`} ref={firstRef} className="dpl-select" value={town} onChange={(e) => pickTown(e.target.value)}>
          {!town && <option value="">Choose a town</option>}
          {homeId && <option value={homeId}>{nameOf(homeId)} (your town)</option>}
          {kind !== 'edit' && <option value="all">All towns in Oriental Mindoro</option>}
          {others.map((m) => (
            <option key={m.id} value={m.id}>{m.name}{listed.has(m.id) && m.id !== place?.municipalityId ? ' · in your list' : ''}</option>
          ))}
        </select>
      </div>

      {town && !all && (
        <div className="dpl-field">
          <span className="dpl-field-label" id={`${ids}-where`}>Where</span>
          <div className="dpl-seg" role="group" aria-labelledby={`${ids}-where`}>
            <button type="button" className={where === 'all' ? 'is-on' : ''} aria-pressed={where === 'all'} onClick={() => setWhere('all')}>
              All of {townName}
            </button>
            <button type="button" className={where === 'some' ? 'is-on' : ''} aria-pressed={where === 'some'} onClick={() => setWhere('some')}>
              Some barangays
            </button>
          </div>
          {listedWhole && !skipFee && (
            <span className="dpl-field-note">
              {where === 'all' ? `Now ${feeLabel(listedWhole.fee)}` : `The rest of ${townName} stays ${feeLabel(listedWhole.fee)}`}
            </span>
          )}
          {where === 'some' && (
            <BarangayChecklist
              townName={townName}
              picked={barangays}
              onChange={setBarangays}
              others={plan.places.filter((p) => p.municipalityId === town && !isWhole(p) && p.key !== editKey)}
              hideFees={plan.distance}
            />
          )}
        </div>
      )}

      {!skipFee && (
        <div className="dpl-field">
          <label className="dpl-field-label" htmlFor={`${ids}-fee`}>Fee</label>
          <FeeChoice value={fee} onChange={setFee} inputId={`${ids}-fee`} label="Delivery fee" />
        </div>
      )}

      <div className="dpl-form-foot">
        <button type="button" className="dpl-btn is-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="dpl-btn is-primary" disabled={!ready || saving} onClick={submit}>
          {saving ? 'Saving…' : kind === 'edit' ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}

/** Back to fees per place with places that have none: one fee for them. */
function MissingFees({ count, onSave, onClose }) {
  const [fee, setFee] = useState(null);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const firstRef = useRef(null);
  const ids = useId();
  useOpenFocus(boxRef, firstRef);
  return (
    <div ref={boxRef} className="dpl-form" role="group" aria-labelledby={`${ids}-t`} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <h4 className="dpl-form-title" id={`${ids}-t`} ref={firstRef} tabIndex={-1}>
        Fee for {count === 1 ? 'the new place' : `the ${plural(count, 'new place')}`}
      </h4>
      <FeeChoice value={fee} onChange={setFee} label="Delivery fee" />
      <div className="dpl-form-foot">
        <button type="button" className="dpl-btn is-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="dpl-btn is-primary"
          disabled={fee == null || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(fee);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/** The town's barangays (PSGC, as the address pickers load them). */
function useBarangays(townName) {
  const [state, setState] = useState({ status: 'loading', list: [] });
  useEffect(() => {
    const code = SERVICE_MUNICIPALITIES.find((m) => normalizeName(m.name) === normalizeName(townName))?.code;
    let live = true;
    Promise.resolve().then(() => { if (live) setState({ status: 'loading', list: [] }); });
    if (!code) {
      Promise.resolve().then(() => { if (live) setState({ status: 'failed', list: [] }); });
      return () => { live = false; };
    }
    listBarangaysByMunicipality(code)
      .then((list) => { if (live) setState({ status: list.length ? 'ready' : 'failed', list: list.map((b) => b.name) }); })
      .catch(() => { if (live) setState({ status: 'failed', list: [] }); });
    return () => { live = false; };
  }, [townName]);
  return state;
}

/**
 * A searchable checklist of a town's barangays, with Pick all and Clear; one
 * typed when the list can't load. Barangays already in another line of the
 * town show its fee: picking them moves them here.
 */
function BarangayChecklist({
  townName, picked, onChange, others = [], hideFees = false,
}) {
  const { status, list } = useBarangays(townName);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const pickedKeys = useMemo(() => new Set(picked.map(brgyKey)), [picked]);
  const elsewhere = useMemo(() => {
    const map = new Map();
    for (const p of others) for (const b of p.barangays) map.set(brgyKey(b), p.fee);
    return map;
  }, [others]);
  const all = useMemo(() => {
    const known = new Set(list.map(brgyKey));
    const extra = [...picked, ...others.flatMap((p) => p.barangays)].filter((b) => !known.has(brgyKey(b)));
    return [...list, ...extra.filter((b, i) => extra.findIndex((x) => brgyKey(x) === brgyKey(b)) === i)];
  }, [list, picked, others]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((b) => b.toLowerCase().includes(q)) : all;

  const toggle = (name) => onChange(pickedKeys.has(brgyKey(name))
    ? picked.filter((b) => brgyKey(b) !== brgyKey(name))
    : [...picked, name]);
  const pickShown = () => onChange([...picked, ...shown.filter((b) => !pickedKeys.has(brgyKey(b)))]);
  const clearShown = () => {
    const off = new Set(shown.map(brgyKey));
    onChange(picked.filter((b) => !off.has(brgyKey(b))));
  };
  const addTyped = () => {
    const name = typed.replace(/\s+/g, ' ').trim();
    if (!name) return;
    if (!pickedKeys.has(brgyKey(name))) onChange([...picked, name]);
    setTyped('');
  };

  return (
    <div className="dpl-brgy">
      {all.length > 0 && (
        <div className="dpl-brgy-bar">
          <label className="dpl-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder={`Search ${all.length} barangays`}
              aria-label={`Search barangays in ${townName}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="dpl-brgy-actions">
            <span className="dpl-brgy-count">{picked.length} picked</span>
            <button type="button" onClick={pickShown}>{q ? 'Pick these' : 'Pick all'}</button>
            <button type="button" onClick={clearShown} disabled={!picked.length}>Clear</button>
          </span>
        </div>
      )}
      {status === 'loading' && !all.length && <p className="dpl-hint">Loading barangays…</p>}
      {all.length > 0 && (
        <ul className="dpl-checklist" aria-label={`Barangays in ${townName}`}>
          {shown.map((b) => {
            const on = pickedKeys.has(brgyKey(b));
            const now = elsewhere.get(brgyKey(b));
            return (
              <li key={b}>
                <label className={`dpl-check${on ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(b)} />
                  <span className="dpl-check-name">{b}</span>
                  {elsewhere.has(brgyKey(b)) && !on && (
                    <span className="dpl-check-now">{hideFees ? 'In your list' : `${now == null ? 'No fee' : Number(now) === 0 ? 'Free' : pesos(now)} now`}</span>
                  )}
                </label>
              </li>
            );
          })}
          {!shown.length && <li className="dpl-check-none">No barangay matches “{query}”.</li>}
        </ul>
      )}
      {status === 'failed' && (
        <div className="dpl-typed">
          <p className="dpl-hint">Barangay list unavailable. Type each one.</p>
          <div className="dpl-typed-row">
            <input
              type="text"
              placeholder="Barangay name"
              aria-label="Barangay name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTyped();
                }
              }}
            />
            <button type="button" className="dpl-btn is-small" onClick={addTyped}>Add</button>
          </div>
          {picked.length > 0 && <p className="dpl-hint">Picked: {picked.join(', ')}</p>}
        </div>
      )}
    </div>
  );
}

const PREVIEW_KM = [2, 5, 10];
const kmLabel = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;
const KM_FIELDS = ['baseFee', 'includedKm', 'perKm', 'maxKm'];

/**
 * "By distance", on the page: the starting fee, the km it covers, each extra
 * km, the farthest; what buyers pay at 2, 5 and 10 km; the shop pin note.
 * Not on yet: "Use distance fee" turns it on. On: Save keeps changed numbers.
 */
function DistanceFields({
  plan, platformRate, extras, note, busy, onSave,
}) {
  const [k, setK] = useState(plan.perKm);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = !plan.distance;
  const dirty = KM_FIELDS.some((f) => String(k[f] ?? '') !== String(plan.perKm[f] ?? ''));
  const problems = distanceProblems(k);
  const errorOf = (key) => (tried ? problems.find((p) => p.key === `perKm.${key}`)?.message : null);
  const rate = distanceRate(k, platformRate);
  const set = (field) => (e) => setK((prev) => ({ ...prev, [field]: e.target.value }));
  const field = (key, label, unit, placeholder) => (
    <label className={`dpl-km${errorOf(key) ? ' has-error' : ''}`}>
      <span className="dpl-field-label">{label}</span>
      <span className="dpl-box">
        {unit === '₱' && <span aria-hidden="true">₱</span>}
        <input
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={k[key]}
          onChange={set(key)}
          aria-invalid={errorOf(key) ? 'true' : undefined}
        />
        {unit === 'km' && <span aria-hidden="true">km</span>}
      </span>
      {errorOf(key) && <span className="dpl-err">{errorOf(key)}</span>}
    </label>
  );
  const submit = async () => {
    setTried(true);
    if (problems.length) return;
    setSaving(true);
    try {
      await onSave(k);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="dpl-km-card" id="delivery-distance">
      <div className="dpl-km-grid">
        {field('baseFee', 'Starting fee', '₱', String(platformRate.base))}
        {field('includedKm', 'Km included', 'km', String(platformRate.included))}
        {field('perKm', 'Each extra km', '₱', String(platformRate.perKm))}
        {field('maxKm', 'Max distance', 'km', 'No limit')}
      </div>
      {rate && (
        <p className="dpl-km-preview" role="status">
          {PREVIEW_KM.map((km, i) => (
            <span key={km}>
              {i > 0 && ' · '}
              {kmLabel(km)} <strong>{rate.max != null && km > rate.max ? 'too far' : pesos(distanceFeeAt(rate, km))}</strong>
            </span>
          ))}
        </p>
      )}
      {extras || (note && <p className="dpl-pin-note" role="status"><Warning size={15} weight="fill" /> {note}</p>)}
      <div className="dpl-km-foot">
        {pending && <span className="dpl-km-state">Not on yet</span>}
        {!pending && dirty && (
          <button
            type="button"
            className="dpl-btn is-ghost"
            onClick={() => {
              setK(plan.perKm);
              setTried(false);
            }}
          >
            Undo
          </button>
        )}
        {!pending && !dirty ? (
          <span className="dpl-km-saved"><Check size={15} weight="bold" /> Saved</span>
        ) : (
          <button type="button" className="dpl-btn is-primary" disabled={saving || busy} onClick={submit}>
            {saving ? 'Saving…' : pending ? 'Use distance fee' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
