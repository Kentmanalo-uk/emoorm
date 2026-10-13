import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Check, GlobeHemisphereEast, MagnifyingGlass, MapPin, NavigationArrow, Path, Plus, Tag, Warning, X,
} from '@phosphor-icons/react';
import {
  MAX_FEE, QUICK_FEES, brgyKey, brgyLabel, distanceFeeAt, distanceProblems, distanceRate, distanceWords, feeLabel,
  fillMissingFees, isWhole, parseFee, pesos, placeTitle, plural, putAllTowns, putPlace, removePlace, setAllFees,
  sortPlaces, summaryLines, unpricedPlaces, wholeTown,
} from '../../../lib/deliveryPlan';
import { SERVICE_MUNICIPALITIES, listBarangaysByMunicipality, normalizeName } from '../../../lib/phAddress';
import { useSheetPresence } from '../../../hooks/useSheetMotion';
import './DeliveryPlaces.css';

/**
 * "Delivery places and fees": one list, each line a place and what delivery
 * costs there. "+ Add a place" asks one thing per screen (Which town? Where
 * in it? How much?), and each line can be changed or removed. Shortcuts for
 * the common cases ("Deliver only in <my town>", "Same fee for all my
 * places") and, at the bottom, "Charge by distance instead".
 *
 * Every change goes to onCommit(nextPlan, message): the Delivery page saves
 * it at once (a rejected promise keeps the sheet open), the guided setup
 * keeps it until "Save and continue". lib/deliveryPlan.js turns the list
 * into the request.
 *
 * @param {Object} props
 * @param {Object} props.plan - lib/deliveryPlan.js
 * @param {Function} props.onCommit - (nextPlan, message) => Promise|void
 * @param {Array<{id, name}>} props.municipalities
 * @param {String} props.homeId - The shop's own town
 * @param {{base, included, perKm}} props.platformRate - The platform's by-distance numbers
 * @param {Boolean} [props.pickupToo] - Buyers can also pick up (pickup is free)
 * @param {React.ReactNode} [props.distanceExtras] - With "Fee by distance": the shop pin note / map
 * @param {String} [props.distanceNote] - In the distance sheet: why the shop pin matters (no pin yet)
 * @param {Boolean} [props.allowDistance] - Offer "Charge by distance instead"
 * @param {Boolean} [props.showHead] - The title and the one-line hint
 * @param {String} [props.savedNote] - Under the hint, e.g. that changes save at once
 */
export default function DeliveryPlaces({
  plan, onCommit, municipalities, homeId, platformRate, pickupToo = false, distanceExtras = null, distanceNote = null,
  allowDistance = true, showHead = true, savedNote = null,
}) {
  const nameOf = (id) => municipalities.find((m) => m.id === id)?.name || '';
  const homeName = nameOf(homeId) || 'your town';
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);

  const commit = async (next, message) => {
    setBusy(true);
    try {
      await onCommit(next, message);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };
  const close = () => setSheet(null);
  const places = sortPlaces(plan.places, homeId, nameOf);
  const lines = summaryLines(plan, nameOf, homeId, platformRate, municipalities.map((m) => m.id));
  const missing = plan.distance ? [] : unpricedPlaces(plan);

  // Back to fees per place: places added while charging by distance need a fee first.
  const backToPlaces = () => {
    if (unpricedPlaces(plan).length) setSheet({ kind: 'missing' });
    else commit({ ...plan, distance: false }, 'Fees per place are on again');
  };

  return (
    <section className="dpl" id="delivery-areas" aria-labelledby={showHead ? 'dpl-title' : undefined}>
      {showHead && (
        <div className="dpl-head">
          <h3 id="dpl-title">Delivery places and fees</h3>
          <p>Add each place you deliver to and how much buyers pay there.</p>
          {savedNote && <p className="dpl-head-note"><Check size={14} weight="bold" /> {savedNote}</p>}
        </div>
      )}

      {!places.length ? (
        <div className="dpl-empty" id="delivery-fee">
          <span className="dpl-empty-icon" aria-hidden="true"><MapPin size={26} weight="fill" /></span>
          <strong>You haven&apos;t added a place yet</strong>
          <p>Most sellers start with their own town. You can add more places after.</p>
          <button type="button" className="dpl-btn is-primary is-big" onClick={() => setSheet({ kind: 'home' })}>
            <MapPin size={18} weight="fill" /> Deliver only in {homeName}
          </button>
          <button type="button" className="dpl-btn is-big" onClick={() => setSheet({ kind: 'add' })}>
            <Plus size={18} weight="bold" /> Choose places
          </button>
        </div>
      ) : (
        <>
          <PlacesSummary lines={lines} pickupToo={pickupToo} missing={missing.length} />
          {!plan.distance && places.length > 1 && (
            <button type="button" className="dpl-shortcut" onClick={() => setSheet({ kind: 'all-fee' })}>
              <Tag size={18} weight="fill" /> Same fee for all my places
            </button>
          )}
          <PlaceRows
            places={places}
            plan={plan}
            nameOf={nameOf}
            homeId={homeId}
            busy={busy}
            onChange={(place) => setSheet({ kind: 'edit', place })}
            onRemove={(place) => commit(removePlace(plan, place.key), `Removed ${placeTitle(place, nameOf).title}`)}
          />
          <button type="button" className="dpl-add" id="delivery-fee" onClick={() => setSheet({ kind: 'add' })}>
            <Plus size={18} weight="bold" /> Add a place
          </button>
        </>
      )}

      {allowDistance && (plan.distance ? (
        <div className="dpl-distance">
          <div className="dpl-distance-card">
            <Path size={24} weight="fill" className="dpl-distance-icon" aria-hidden="true" />
            <div>
              <strong>Fee by distance</strong>
              <span>{distanceWords(plan.perKm, platformRate) || 'Set your starting fee'}</span>
            </div>
            <button type="button" className="dpl-link" onClick={() => setSheet({ kind: 'distance' })}>Change</button>
          </div>
          {distanceExtras}
          <button type="button" className="dpl-link dpl-switch" onClick={backToPlaces} disabled={busy}>
            Use fees per place instead
          </button>
        </div>
      ) : (
        <button type="button" className="dpl-link dpl-switch" onClick={() => setSheet({ kind: 'distance' })}>
          <Path size={16} weight="fill" /> Charge by distance instead
        </button>
      ))}

      {sheet && sheet.kind === 'distance' ? (
        <DistanceSheet
          open
          plan={plan}
          platformRate={platformRate}
          note={distanceNote}
          onClose={close}
          onSave={async (perKm) => {
            const ok = await commit({ ...plan, distance: true, perKm }, plan.distance ? 'Distance fee saved' : 'Now charging by distance');
            if (ok) close();
            return ok;
          }}
        />
      ) : (
        <PlaceSheet
          open={Boolean(sheet)}
          kind={sheet?.kind}
          place={sheet?.place}
          plan={plan}
          municipalities={municipalities}
          homeId={homeId}
          onClose={close}
          onSave={async (next, message) => {
            const ok = await commit(next, message);
            if (ok) close();
            return ok;
          }}
        />
      )}
    </section>
  );
}

/** "What buyers pay", in sentences. */
export function PlacesSummary({ lines, pickupToo = false, missing = 0 }) {
  if (!lines.length) return null;
  return (
    <div className="dpl-summary" aria-live="polite">
      <h4>What buyers pay</h4>
      <ul>
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {missing > 0 && (
        <p className="dpl-summary-warn">
          <Warning size={15} weight="fill" /> {plural(missing, 'place')} still {missing === 1 ? 'needs' : 'need'} a fee. Tap “Choose a fee” on {missing === 1 ? 'it' : 'each'}.
        </p>
      )}
      {pickupToo && <p className="dpl-summary-note">Pickup is always free.</p>}
    </div>
  );
}

/**
 * The places as cards: where, the fee, Change and Remove (Remove asks once).
 * @param {Object} props
 * @param {Array} props.places - Sorted (sortPlaces)
 */
export function PlaceRows({
  places, plan, nameOf, homeId, onChange, onRemove, busy = false,
}) {
  const [asking, setAsking] = useState(null);
  return (
    <ul className="dpl-list">
      {places.map((p) => {
        const { title, detail } = placeTitle(p, nameOf);
        const override = !isWhole(p) && Boolean(wholeTown(plan, p.municipalityId));
        const unpriced = !plan.distance && p.fee == null;
        return (
          <li key={p.key} className={`dpl-row${unpriced ? ' is-missing' : ''}`}>
            <div className="dpl-row-top">
              <MapPin size={22} weight="fill" className="dpl-row-pin" aria-hidden="true" />
              <div className="dpl-row-main">
                <strong>{title}</strong>
                {detail && <span className="dpl-row-detail">{detail}</span>}
                {(override || p.municipalityId === homeId) && (
                  <span className="dpl-row-tags">
                    {p.municipalityId === homeId && isWhole(p) && <span className="dpl-tag">Your town</span>}
                    {override && <span className="dpl-tag is-pink">Different fee</span>}
                  </span>
                )}
              </div>
              {!plan.distance && (
                unpriced ? (
                  <button type="button" className="dpl-fee is-missing" onClick={() => onChange(p)}>Choose a fee</button>
                ) : (
                  <span className={`dpl-fee${Number(p.fee) === 0 ? ' is-free' : ''}`}>{feeLabel(p.fee)}</span>
                )
              )}
            </div>
            {asking === p.key ? (
              <div className="dpl-row-ask" role="group" aria-label={`Remove ${title}?`}>
                <span>Stop delivering here?</span>
                <button type="button" className="dpl-btn is-small" onClick={() => setAsking(null)}>Keep</button>
                <button
                  type="button"
                  className="dpl-btn is-small is-danger"
                  disabled={busy}
                  onClick={async () => {
                    await onRemove(p);
                    setAsking(null);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="dpl-row-actions">
                <button type="button" onClick={() => onChange(p)} disabled={busy}>Change</button>
                <button type="button" className="is-remove" onClick={() => setAsking(p.key)} disabled={busy}>Remove</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Free, ₱20, ₱30, ₱50, or another amount: big buttons.
 * @param {Object} props
 * @param {Number|null} props.value
 * @param {Function} props.onChange - (fee: Number|null)
 */
export function FeeChoice({ value, onChange, label = 'Delivery fee' }) {
  const quick = value != null && QUICK_FEES.includes(Number(value));
  const [other, setOther] = useState(value != null && !quick);
  const [text, setText] = useState(value != null && !quick ? String(value) : '');
  const typed = parseFee(text);
  const bad = other && text.trim() !== '' && typed === undefined;
  return (
    <div className="dpl-fees">
      <div className="dpl-fee-grid" role="radiogroup" aria-label={label}>
        {QUICK_FEES.map((fee) => {
          const on = !other && value != null && Number(value) === fee;
          return (
            <button
              key={fee}
              type="button"
              role="radio"
              aria-checked={on}
              className={`dpl-fee-btn${on ? ' is-on' : ''}${fee === 0 ? ' is-free' : ''}`}
              onClick={() => {
                setOther(false);
                onChange(fee);
              }}
            >
              {on && <Check size={16} weight="bold" />} {fee === 0 ? 'Free delivery' : pesos(fee)}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          className={`dpl-fee-btn is-other${other ? ' is-on' : ''}`}
          onClick={() => {
            setOther(true);
            onChange(typed == null || typed === undefined ? null : typed);
          }}
        >
          {other && <Check size={16} weight="bold" />} Other amount
        </button>
      </div>
      {other && (
        <label className={`dpl-amount${bad ? ' has-error' : ''}`}>
          <span className="dpl-amount-label">Type the amount</span>
          <span className="dpl-amount-box">
            <span aria-hidden="true">₱</span>
            <input
              type="number"
              min="0"
              max={MAX_FEE}
              step="1"
              inputMode="decimal"
              placeholder="e.g. 40"
              value={text}
              autoFocus
              aria-invalid={bad ? 'true' : undefined}
              onChange={(e) => {
                setText(e.target.value);
                const fee = parseFee(e.target.value);
                onChange(fee === undefined ? null : fee);
              }}
            />
          </span>
          {bad && <span className="dpl-err">Enter ₱0 to ₱{MAX_FEE.toLocaleString('en-PH')}.</span>}
        </label>
      )}
    </div>
  );
}

/** A sheet on phones, a centred dialog on computers. */
function DplSheet({
  open, title, step, onBack, onClose, children, footer,
}) {
  const { mounted, closing } = useSheetPresence(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={`dpl-sheet-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`} onClick={onClose} role="presentation">
      <div className="dpl-sheet ui-sheet-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="dpl-sheet-grip" aria-hidden="true" />
        <div className="dpl-sheet-bar">
          {onBack ? (
            <button type="button" className="dpl-sheet-round" onClick={onBack} aria-label="Back"><ArrowLeft size={18} weight="bold" /></button>
          ) : <span className="dpl-sheet-round is-blank" aria-hidden="true" />}
          {step ? <span className="dpl-sheet-step">{step}</span> : <span />}
          <button type="button" className="dpl-sheet-round" onClick={onClose} aria-label="Close"><X size={18} weight="bold" /></button>
        </div>
        <h2 className="dpl-sheet-title">{title}</h2>
        <div className="dpl-sheet-body">{children}</div>
        {footer && <div className="dpl-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const STEPS = ['town', 'where', 'fee'];

/** What the sheet starts with, for each way it opens. */
const startOf = (kind, place, homeId, skipFee) => {
  if (kind === 'edit' && place) {
    return {
      // Changing a place opens at its fee (while charging by distance: at where).
      step: skipFee ? 'where' : 'fee',
      town: place.municipalityId,
      all: false,
      where: isWhole(place) ? 'all' : 'some',
      barangays: [...place.barangays],
      fee: place.fee,
    };
  }
  if (kind === 'home') {
    return {
      step: skipFee ? 'where' : 'fee', town: homeId, all: false, where: 'all', barangays: [], fee: null,
    };
  }
  if (kind === 'all-fee' || kind === 'missing') {
    return {
      step: 'fee', town: null, all: false, where: null, barangays: [], fee: null,
    };
  }
  return {
    step: 'town', town: null, all: false, where: null, barangays: [], fee: null,
  };
};

/**
 * Add a place or change one: Which town? → Where in it? → How much? One
 * question per screen, Back and Next. Also the one-screen fee sheets: "Same
 * fee for all my places" (kind all-fee) and "places without a fee" (missing).
 * While charging by distance the fee screen is left out.
 */
export function PlaceSheet({
  open, kind, place, plan, municipalities, homeId, onClose, onSave,
}) {
  const skipFee = plan.distance && (kind === 'add' || kind === 'edit' || kind === 'home');
  const [s, setS] = useState(() => startOf(kind, place, homeId, skipFee));
  const [saving, setSaving] = useState(false);
  // Opened again (another place, another way): start over.
  const [opened, setOpened] = useState(null);
  const openKey = open ? `${kind}:${place?.key || ''}` : null;
  if (openKey !== opened) {
    setOpened(openKey);
    if (open) setS(startOf(kind, place, homeId, skipFee));
  }
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const nameOf = (id) => municipalities.find((m) => m.id === id)?.name || 'Town';
  const editKey = kind === 'edit' ? place?.key : null;
  const townName = s.town ? nameOf(s.town) : '';
  const listedWhole = s.town ? wholeTown(plan, s.town, editKey) : null;

  const save = async (fee) => {
    let next;
    let message = 'Delivery place saved';
    if (kind === 'all-fee') {
      next = setAllFees(plan, fee);
      message = `Every place: ${fee === 0 ? 'free delivery' : pesos(fee)}`;
    } else if (kind === 'missing') {
      next = { ...fillMissingFees(plan, fee), distance: false };
      message = 'Fees per place are on again';
    } else if (s.all) {
      next = putAllTowns(plan, municipalities.map((m) => m.id), fee);
      message = 'All towns added';
    } else {
      next = putPlace(plan, { municipalityId: s.town, barangays: s.where === 'some' ? s.barangays : [], fee }, editKey);
    }
    setSaving(true);
    try {
      await onSave(next, message);
    } finally {
      setSaving(false);
    }
  };

  const feeOnly = kind === 'all-fee' || kind === 'missing';
  const stepIndex = STEPS.indexOf(s.step);
  const stepCount = skipFee ? 2 : 3;
  const back = (() => {
    if (feeOnly) return null;
    if (s.step === 'fee') return () => set({ step: s.all ? 'town' : 'where' });
    if (s.step === 'where') return () => set({ step: 'town' });
    return null;
  })();

  let title;
  let body;
  let footer = null;
  if (s.step === 'town') {
    title = 'Which town?';
    const listed = new Set(plan.places.map((p) => p.municipalityId));
    const others = municipalities.filter((m) => m.id !== homeId);
    const pick = (id) => set({
      town: id, all: false, step: 'where', where: null, barangays: [],
    });
    body = (
      <div className="dpl-towns">
        {homeId && (
          <>
            <span className="dpl-label">Your town</span>
            <TownButton name={nameOf(homeId)} tag={listed.has(homeId) ? 'In your list' : null} onClick={() => pick(homeId)} home />
          </>
        )}
        <button
          type="button"
          className="dpl-town is-all"
          onClick={() => set({
            all: true, town: null, where: 'all', step: skipFee ? 'town' : 'fee',
          })}
          aria-pressed={s.all}
        >
          <GlobeHemisphereEast size={22} weight="fill" className="dpl-town-icon" aria-hidden="true" />
          <span className="dpl-town-text">
            <strong>All towns in Oriental Mindoro</strong>
            <small>{plan.places.length ? 'Adds every town not in your list yet' : 'Every barangay of every town'}</small>
          </span>
          {s.all && skipFee && <Check size={18} weight="bold" className="dpl-town-check" />}
        </button>
        <span className="dpl-label">Other towns</span>
        {others.map((m) => (
          <TownButton key={m.id} name={m.name} tag={listed.has(m.id) ? 'In your list' : null} onClick={() => pick(m.id)} />
        ))}
      </div>
    );
    if (s.all && skipFee) {
      footer = (
        <button type="button" className="dpl-btn is-primary" disabled={saving} onClick={() => save(null)}>
          {saving ? 'Saving…' : 'Add all towns'}
        </button>
      );
    }
  } else if (s.step === 'where') {
    title = `Where in ${townName}?`;
    const someLabel = listedWhole ? 'Different fee for some barangays' : 'Only some barangays';
    const someText = listedWhole
      ? `These barangays pay their own fee. The rest of ${townName} stays ${feeLabel(listedWhole.fee).replace('Free delivery', 'free')}.`
      : 'Pick them from a list';
    const ready = s.where === 'all' || (s.where === 'some' && s.barangays.length > 0);
    body = (
      <div className="dpl-where">
        <button
          type="button"
          className={`dpl-option${s.where === 'all' ? ' is-on' : ''}`}
          aria-pressed={s.where === 'all'}
          onClick={() => set(skipFee ? { where: 'all' } : { where: 'all', step: 'fee', fee: listedWhole && s.where !== 'all' ? listedWhole.fee : s.fee })}
        >
          <span className="dpl-radio" aria-hidden="true" />
          <span>
            <strong>All of {townName}</strong>
            <small>{listedWhole ? `Now ${feeLabel(listedWhole.fee).replace('Free delivery', 'free')}. Pick this to change it.` : `Every barangay in ${townName}`}</small>
          </span>
        </button>
        <button
          type="button"
          className={`dpl-option${s.where === 'some' ? ' is-on' : ''}`}
          aria-pressed={s.where === 'some'}
          onClick={() => set({ where: 'some' })}
        >
          <span className="dpl-radio" aria-hidden="true" />
          <span>
            <strong>{someLabel}</strong>
            <small>{someText}</small>
          </span>
        </button>
        {s.where === 'some' && (
          <BarangayChecklist
            townName={townName}
            picked={s.barangays}
            onChange={(barangays) => set({ barangays })}
            others={plan.places.filter((p) => p.municipalityId === s.town && !isWhole(p) && p.key !== editKey)}
            hideFees={plan.distance}
          />
        )}
      </div>
    );
    footer = (
      <>
        <button type="button" className="dpl-btn" onClick={back}>Back</button>
        {skipFee ? (
          <button type="button" className="dpl-btn is-primary" disabled={!ready || saving} onClick={() => save(place?.fee ?? null)}>
            {saving ? 'Saving…' : 'Save place'}
          </button>
        ) : (
          <button type="button" className="dpl-btn is-primary" disabled={!ready} onClick={() => set({ step: 'fee' })}>Next</button>
        )}
      </>
    );
  } else {
    const n = unpricedPlaces(plan).length;
    title = kind === 'all-fee' ? 'Same fee for all my places' : 'How much is delivery there?';
    const sub = kind === 'all-fee' ? 'Every place in your list gets this fee.'
      : kind === 'missing' ? `For the ${plural(n, 'place')} that ${n === 1 ? 'has' : 'have'} no fee yet. The rest keep theirs.`
        : s.all ? 'All towns in Oriental Mindoro'
          : s.where === 'some' ? `${s.barangays.length === 1 ? brgyLabel(s.barangays[0]) : plural(s.barangays.length, 'barangay')} in ${townName}`
            : `All of ${townName}`;
    body = (
      <>
        <p className="dpl-sheet-sub"><MapPin size={16} weight="fill" /> {sub}</p>
        <FeeChoice key={`${opened}:${s.town}:${s.where}`} value={s.fee} onChange={(fee) => set({ fee })} />
      </>
    );
    footer = (
      <>
        {back && <button type="button" className="dpl-btn" onClick={back}>Back</button>}
        <button type="button" className="dpl-btn is-primary" disabled={s.fee == null || saving} onClick={() => save(s.fee)}>
          {saving ? 'Saving…' : kind === 'all-fee' ? 'Use for all places' : kind === 'missing' ? 'Save fees' : 'Save place'}
        </button>
      </>
    );
  }

  return (
    <DplSheet
      open={open}
      title={title}
      step={feeOnly ? null : `Step ${Math.min(stepIndex + 1, stepCount)} of ${stepCount}`}
      onBack={back}
      onClose={onClose}
      footer={footer}
    >
      {body}
    </DplSheet>
  );
}

function TownButton({
  name, tag, onClick, home = false,
}) {
  return (
    <button type="button" className={`dpl-town${home ? ' is-home' : ''}`} onClick={onClick}>
      <MapPin size={22} weight="fill" className="dpl-town-icon" aria-hidden="true" />
      <span className="dpl-town-text"><strong>{name}</strong></span>
      {tag && <span className="dpl-tag is-grey">{tag}</span>}
    </button>
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
      <div className="dpl-brgy-bar">
        <span className="dpl-brgy-count">{picked.length} picked</span>
        {all.length > 0 && (
          <span className="dpl-brgy-actions">
            <button type="button" onClick={pickShown}>{q ? 'Pick these' : 'Pick all'}</button>
            <button type="button" onClick={clearShown} disabled={!picked.length}>Clear</button>
          </span>
        )}
      </div>
      {all.length > 0 && (
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
      )}
      {status === 'loading' && !all.length && <p className="dpl-hint">Loading the barangays of {townName}…</p>}
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
          <p className="dpl-hint">The barangay list is not available right now. Type each barangay instead.</p>
          <div className="dpl-typed-row">
            <input
              type="text"
              placeholder="Barangay name"
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

/** "Charge by distance": the starting fee, the km it covers, each extra km, the farthest. */
function DistanceSheet({
  open, plan, platformRate, note, onClose, onSave,
}) {
  const [k, setK] = useState(plan.perKm);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const problems = distanceProblems(k);
  const errorOf = (key) => (tried ? problems.find((p) => p.key === `perKm.${key}`)?.message : null);
  const rate = distanceRate(k, platformRate);
  const set = (field) => (e) => setK((prev) => ({ ...prev, [field]: e.target.value }));
  const field = (key, label, unit, placeholder, help) => (
    <label className={`dpl-km${errorOf(key) ? ' has-error' : ''}`}>
      <span className="dpl-km-label">{label}</span>
      <span className="dpl-amount-box">
        {unit === '₱' && <span aria-hidden="true">₱</span>}
        <input type="number" min="0" step={unit === 'km' ? '0.5' : '1'} inputMode="decimal" placeholder={placeholder} value={k[key]} onChange={set(key)} />
        {unit === 'km' && <span aria-hidden="true">km</span>}
      </span>
      <small>{help}</small>
      {errorOf(key) && <span className="dpl-err">{errorOf(key)}</span>}
    </label>
  );
  return (
    <DplSheet
      open={open}
      title="Charge by distance"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dpl-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="dpl-btn is-primary"
            disabled={saving}
            onClick={async () => {
              setTried(true);
              if (problems.length) return;
              setSaving(true);
              try {
                await onSave(k);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : plan.distance ? 'Save' : 'Use distance fee'}
          </button>
        </>
      )}
    >
      <p className="dpl-sheet-sub">
        <NavigationArrow size={15} weight="fill" /> The fee goes up the farther the buyer is, by road from your shop pin. Your places stay: you still deliver only there.
      </p>
      <div className="dpl-km-grid">
        {field('baseFee', 'Starting fee', '₱', String(platformRate.base), `Covers the first ${kmLabel(rate?.included ?? platformRate.included)}`)}
        {field('includedKm', 'First km included', 'km', String(platformRate.included), `Blank: ${kmLabel(platformRate.included)}`)}
        {field('perKm', 'Each extra km', '₱', String(platformRate.perKm), `Blank: ${pesos(platformRate.perKm)}`)}
        {field('maxKm', 'Farthest (optional)', 'km', 'No limit', 'Farther buyers can’t choose your delivery')}
      </div>
      {rate && (
        <p className="dpl-km-preview" role="status">
          What buyers pay:{' '}
          {PREVIEW_KM.map((km, i) => (
            <span key={km}>
              {i > 0 && ' · '}
              {kmLabel(km)} <strong>{rate.max != null && km > rate.max ? 'too far' : pesos(distanceFeeAt(rate, km))}</strong>
            </span>
          ))}
        </p>
      )}
      {note && <p className="dpl-pin-note" role="status"><Warning size={15} weight="fill" /> {note}</p>}
    </DplSheet>
  );
}
