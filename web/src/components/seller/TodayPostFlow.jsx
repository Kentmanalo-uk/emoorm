import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BowlFood, CookingPot, CalendarCheck, CalendarBlank, CalendarDot, Repeat, Clock, Package, Minus, Plus, Lock, ForkKnife, Check, Truck,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg, firstImage } from '../../lib/media';
import {
  WEEKDAYS, addDays, clockText, manilaClock, manilaDay,
} from '../../lib/manilaDays';
import {
  AHEAD_DAYS, STEPS, KINDS, COOK_PICKS, QTY_PICKS, WEEK_PICKS, DAY_CHOICES, GET_CHOICES, LOCKED_NOTE,
  blankDraft, editDraft, isLocked, withMode, withDays, withStartNow, toggleWeekday, pickDay, draftDays, moments, untilNextDay,
  stepCheck, daysLine, ordersLine, readyLine, qtyLine, postLabel, batchBody, editBody, plainError, errorStep, plural, getLabel,
} from '../../lib/todayPost';
import PhoneSheet from './PhoneSheet';
import DayCalendar from './DayCalendar';
import './TodayPostFlow.css';

const KIND_ICONS = { READY_NOW: BowlFood, MADE_TO_ORDER: CookingPot, PRE_ORDER: CalendarCheck };
const DAY_ICONS = { today: CalendarDot, pick: CalendarBlank, weekly: Repeat };

/** The product photo, or a plain tile. */
function Photo({ product, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  const img = firstImage(product?.images);
  if (!img || failed) return <span className={`tpf-photo tpf-photo--${size} is-empty`} aria-hidden="true"><ForkKnife size={size === 'lg' ? 28 : 20} /></span>;
  return <img className={`tpf-photo tpf-photo--${size}`} src={resolveImg(img)} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** A big choice card: icon, title and a one-line example. */
function Choice({
  icon: Icon, title, hint, on, onClick, disabled = false, compact = false,
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      className={`tpf-choice${on ? ' is-on' : ''}${compact ? ' is-compact' : ''}`}
      onClick={onClick}
    >
      {Icon && <span className="tpf-choice-icon" aria-hidden="true"><Icon size={compact ? 22 : 26} weight="duotone" /></span>}
      <span className="tpf-choice-text">
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className="tpf-choice-tick" aria-hidden="true">{on && <Check size={14} weight="bold" />}</span>
    </button>
  );
}

/** Small round choices in a row: 15 / 30 / 45 / 60, 10 / 20 / 30 / 50. */
function Picks({ values, value, onPick, suffix = '', label, min = 0 }) {
  return (
    <div className="tpf-picks" role="group" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" aria-pressed={String(value) === String(v)} disabled={v < min} className={String(value) === String(v) ? 'is-on' : ''} onClick={() => onPick(v)}>
          {v}{suffix}
        </button>
      ))}
    </div>
  );
}

/** A two- or three-way switch: Start now / Start later, Same day / Next day. */
function Seg({ choices, value, onChange, label }) {
  return (
    <div className="tpf-seg" role="radiogroup" aria-label={label}>
      {choices.map(([key, text]) => (
        <button key={String(key)} type="button" role="radio" aria-checked={value === key} className={value === key ? 'is-on' : ''} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function TimeInput({ value, onChange, label }) {
  return (
    <label className="tpf-time">
      <span className="sr-only">{label}</span>
      <input type="time" step="300" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const QUESTIONS = {
  what: () => ['What are you posting?', 'Tap the item.'],
  ready: () => ['Is it ready now?', 'Pick the one that fits.'],
  qty: (d) => (d.edit
    ? ['How many can you sell?', d.edit.sold ? `Buyers already ordered ${d.edit.sold}.` : 'You can still change this later.']
    : ['How many can you sell each day?', 'If you run out, you can add more later.']),
  when: (d) => ['When can buyers order?', d.edit ? (isLocked(d) ? 'Buyers already ordered, so the day stays.' : 'Pick the day and the times.') : 'Pick the days, then the times.'],
  check: (d) => (d.edit ? ['Check and save', 'Tap Change to fix anything.'] : ['Check and post', 'Look it over. Tap Change to fix anything.']),
};

/**
 * Post an item to Today's menu, one question at a time, or edit one post
 * (`window`) through the same steps, filled in. See lib/todayPost.js for
 * the steps and their rules.
 *
 * <TodayPostFlow open window={null | post} products storeMode onClose onDone={(result) => …} />
 * onDone gets { windows } for a new post, { window } for an edit.
 */
export default function TodayPostFlow({
  open, window: editing = null, products = [], storeMode = 'BOTH', onClose, onDone,
}) {
  const [draft, setDraft] = useState(() => (editing ? editDraft(editing) : blankDraft({ products, storeMode })));
  const [step, setStep] = useState(() => (!editing && draft.productId ? 1 : 0));
  const [fromCheck, setFromCheck] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef(null);

  const name = STEPS[step];
  const locked = isLocked(draft);
  const check = stepCheck(name, draft);
  const today = manilaDay();
  const lastDay = addDays(today, AHEAD_DAYS - 1);

  // The products to pick from. Editing, the post's own product comes first
  // (and is the only one once buyers ordered it).
  const list = useMemo(() => {
    if (!editing) return products;
    const own = products.find((p) => p.id === editing.productId)
      || { id: editing.productId, name: editing.product?.name || 'Item', images: editing.product?.images };
    if (editing.soldCount > 0) return [own];
    return [own, ...products.filter((p) => p.id !== editing.productId)];
  }, [products, editing]);
  const product = list.find((p) => p.id === draft.productId);

  useEffect(() => {
    rootRef.current?.closest('.scm-sheet-body')?.scrollTo?.({ top: 0 });
  }, [step]);

  const set = (patch) => {
    setDraft((d) => (typeof patch === 'function' ? patch(d) : { ...d, ...patch }));
    setError(null);
  };

  const go = (target) => { setError(null); setStep(STEPS.indexOf(target)); };
  const change = (target) => { setFromCheck(true); go(target); };

  const next = () => {
    if (!check.done) return;
    if (fromCheck) {
      // Back to the summary, unless a later step now needs an answer.
      const todo = STEPS.slice(step + 1, -1).find((s) => !stepCheck(s, draft).done);
      go(todo || 'check');
      if (!todo) setFromCheck(false);
      return;
    }
    go(STEPS[step + 1]);
  };
  const back = () => {
    if (step === 0) { onClose(); return; }
    go(STEPS[step - 1]);
  };

  const submit = async () => {
    const bad = STEPS.slice(0, -1).find((s) => !stepCheck(s, draft).done);
    if (bad) { go(bad); return; }
    setSaving(true);
    try {
      const res = draft.edit
        ? await axios.patch(`/today/${draft.edit.id}`, editBody(draft))
        : await axios.post('/today/batch', batchBody(draft));
      onDone(draft.edit ? { window: res.data } : { windows: res.data?.windows || [] });
    } catch (err) {
      const raw = err.message || 'That did not work. Please try again.';
      const target = errorStep(raw);
      if (target) setStep(STEPS.indexOf(target));
      setError(plainError(raw));
    } finally {
      setSaving(false);
    }
  };

  const [question, sub] = QUESTIONS[name](draft);
  const m = name === 'when' || name === 'check' ? moments(draft) : null;
  const days = draftDays(draft);

  /* ── the steps ──────────────────────────────────────────────── */
  const lockNote = <p className="tpf-lock"><Lock size={16} weight="bold" aria-hidden="true" /> {LOCKED_NOTE}</p>;

  const whatStep = (
    <>
      {locked && lockNote}
      {list.length === 0 ? (
        <p className="tpf-empty">First add a product and choose &quot;Available Today&quot; under How you sell it.</p>
      ) : (
        <div className="tpf-products" role="radiogroup" aria-label="Items">
          {list.map((p) => {
            const on = draft.productId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={locked && !on}
                className={`tpf-product${on ? ' is-on' : ''}`}
                onClick={() => set({ productId: p.id })}
              >
                <Photo product={p} />
                <span className="tpf-product-name">{p.name}</span>
                {on && <span className="tpf-product-tick" aria-hidden="true"><Check size={14} weight="bold" /></span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const readyStep = (
    <>
      {locked && lockNote}
      <div className="tpf-choices" role="radiogroup" aria-label="Is it ready now?">
        {KINDS.map((k) => (
          <Choice
            key={k.key}
            icon={KIND_ICONS[k.key]}
            title={k.title}
            hint={k.hint}
            on={draft.mode === k.key}
            disabled={locked && draft.mode !== k.key}
            onClick={() => set((d) => withMode(d, k.key))}
          />
        ))}
      </div>
      {draft.mode === 'MADE_TO_ORDER' && (
        <div className="tpf-more">
          <h4 className="tpf-label">About how many minutes to cook?</h4>
          {!locked && (
            <Picks values={COOK_PICKS} value={draft.prepMinutes} onPick={(v) => set({ prepMinutes: String(v) })} suffix=" min" label="Minutes to cook" />
          )}
          <label className="tpf-inline">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="1440"
              value={draft.prepMinutes}
              disabled={locked}
              placeholder="Other"
              onChange={(e) => set({ prepMinutes: e.target.value.replace(/[^0-9]/g, '') })}
              aria-label="Minutes to cook"
            />
            minutes
          </label>
        </div>
      )}
    </>
  );

  const qtyNum = Number(draft.quantity) || 0;
  const minQty = Math.max(1, draft.edit?.sold || 0);
  const qtyStep = (
    <>
      <div className="tpf-stepper" role="group" aria-label="How many">
        <button type="button" aria-label="One less" disabled={qtyNum <= minQty} onClick={() => set({ quantity: String(Math.max(minQty, qtyNum - 1)) })}>
          <Minus size={24} weight="bold" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={minQty}
          value={draft.quantity}
          placeholder="0"
          aria-label="How many"
          onChange={(e) => set({ quantity: e.target.value.replace(/[^0-9]/g, '') })}
        />
        <button type="button" aria-label="One more" onClick={() => set({ quantity: String(Math.max(minQty, qtyNum + 1)) })}>
          <Plus size={24} weight="bold" />
        </button>
      </div>
      <Picks values={QTY_PICKS} value={draft.quantity} onPick={(v) => set({ quantity: String(v) })} label="Quick picks" min={minQty} />
    </>
  );

  const closeNext = m?.closeNextDay ? <em className="tpf-next">(next day)</em> : null;
  const orderTimes = (
    <>
      <h4 className="tpf-label">What time can buyers order?</h4>
      <p className="tpf-sentence">
        <span>Buyers can order from</span>
        {m?.keepsOpen && locked
          ? <strong className="tpf-fixed">{clockText(manilaClock(m.openAt))}</strong>
          : (!draft.edit && draft.days === 'today' && draft.startNow)
            ? <strong className="tpf-fixed">now</strong>
            : <TimeInput value={draft.open} label="Orders open at" onChange={(v) => set({ open: v, timesSet: true })} />}
        <span>until</span>
        <TimeInput value={draft.close} label="Orders close at" onChange={(v) => set({ close: v, timesSet: true })} />
        {closeNext}
      </p>
      {locked && draft.edit?.live && <p className="tpf-hint">Buyers already ordered, so only the closing time can change.</p>}
    </>
  );

  const readyTimes = draft.mode === 'PRE_ORDER' && (
    <>
      <h4 className="tpf-label">When will it be ready?</h4>
      <Seg choices={[[false, 'Same day'], [true, 'Next day']]} value={draft.readyNextDay} onChange={(v) => set({ readyNextDay: v })} label="Ready on" />
      <p className="tpf-sentence">
        <span>Ready from</span>
        <TimeInput value={draft.readyFrom} label="Ready from" onChange={(v) => set({ readyFrom: v })} />
        <span>until</span>
        <TimeInput value={draft.readyUntil} label="Ready until" onChange={(v) => set({ readyUntil: v })} />
        {untilNextDay(draft) && <em className="tpf-next">(next day)</em>}
      </p>
    </>
  );

  const whenStep = (
    <>
      {draft.edit ? (
        locked ? (
          <p className="tpf-fixed-day"><CalendarBlank size={18} aria-hidden="true" /> {daysLine(draft)}</p>
        ) : (
          <>
            <h4 className="tpf-label">Which day?</h4>
            <DayCalendar value={draft.picked} onToggle={(day) => set((d) => pickDay(d, day))} min={today} max={lastDay} today={today} label="Which day" />
            <p className="tpf-picked" aria-live="polite">{days.length ? <strong>{daysLine(draft)}</strong> : 'Tap a day.'}</p>
          </>
        )
      ) : (
        <>
          <h4 className="tpf-label">Which days?</h4>
          <div className="tpf-choices" role="radiogroup" aria-label="Which days">
            {DAY_CHOICES.map((c) => (
              <Choice key={c.key} compact icon={DAY_ICONS[c.key]} title={c.title} hint={c.hint} on={draft.days === c.key} onClick={() => set((d) => withDays(d, c.key))} />
            ))}
          </div>

          {draft.days === 'today' && (
            <Seg choices={[[true, 'Start now'], [false, 'Start later']]} value={draft.startNow} onChange={(on) => set((d) => withStartNow(d, on))} label="When orders start" />
          )}

          {draft.days === 'pick' && (
            <>
              <DayCalendar value={draft.picked} onToggle={(day) => set((d) => pickDay(d, day))} min={today} max={lastDay} today={today} label="Pick days" />
              <p className="tpf-picked" aria-live="polite">
                {draft.picked.length ? (
                  <>
                    <strong>{plural(draft.picked.length, 'day')} picked</strong>
                    <button type="button" className="tpf-link" onClick={() => set({ picked: [] })}>Clear</button>
                  </>
                ) : 'Tap the days you will have it, up to 30 days ahead.'}
              </p>
            </>
          )}

          {draft.days === 'weekly' && (
            <>
              <div className="tpf-weekdays" role="group" aria-label="Days of the week">
                {WEEKDAYS.map((w, n) => (
                  <button key={w} type="button" aria-pressed={draft.weekdays.includes(n)} className={draft.weekdays.includes(n) ? 'is-on' : ''} onClick={() => set((d) => toggleWeekday(d, n))}>
                    {w}
                  </button>
                ))}
              </div>
              <h4 className="tpf-label">For how many weeks?</h4>
              <Seg choices={WEEK_PICKS.map((n) => [n, plural(n, 'week')])} value={draft.weeks} onChange={(n) => set({ weeks: n })} label="For how many weeks" />
              {days.length > 0 && <p className="tpf-picked" aria-live="polite"><strong>{daysLine(draft)}</strong></p>}
            </>
          )}
        </>
      )}
      {orderTimes}
      {readyTimes}
    </>
  );

  const row = (Icon, text, target, key) => (
    <li key={key}>
      <Icon size={18} aria-hidden="true" />
      <span>{text}</span>
      {target && <button type="button" className="tpf-change" onClick={() => change(target)}>Change</button>}
    </li>
  );
  const KindIcon = KIND_ICONS[draft.mode] || BowlFood;
  const checkStep = (
    <>
      <div className="tpf-summary">
        <div className="tpf-summary-head">
          <Photo product={product} size="lg" />
          <strong>{product?.name || draft.edit?.productName || 'Item'}</strong>
          {locked
            ? <Lock size={16} className="tpf-summary-lock" aria-label="Stays the same" />
            : list.length > 1 && <button type="button" className="tpf-change" onClick={() => change('what')}>Change</button>}
        </div>
        <ul className="tpf-summary-rows">
          {row(Package, qtyLine(draft), 'qty', 'qty')}
          {row(CalendarBlank, daysLine(draft), locked ? null : 'when', 'days')}
          {row(Clock, ordersLine(draft), 'when', 'orders')}
          {row(KindIcon, readyLine(draft), locked ? (draft.mode === 'PRE_ORDER' ? 'when' : null) : 'ready', 'ready')}
          {row(Truck, getLabel(draft.fulfillment), null, 'get')}
        </ul>
      </div>

      {storeMode === 'BOTH' ? (
        <>
          <h4 className="tpf-label">How buyers get it</h4>
          <Seg choices={GET_CHOICES.map((c) => [c.key, c.title])} value={draft.fulfillment} onChange={(v) => set({ fulfillment: v })} label="How buyers get it" />
        </>
      ) : (
        <p className="tpf-hint">{getLabel(storeMode)}, as your shop is set up.</p>
      )}

      <label className="tpf-note">
        <span className="tpf-label">Note for buyers (optional)</span>
        <input value={draft.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Best eaten warm. Bring your own container." />
      </label>
    </>
  );

  const body = {
    what: whatStep, ready: readyStep, qty: qtyStep, when: whenStep, check: checkStep,
  }[name];
  const message = error || check.message;
  const last = name === 'check';

  return (
    <PhoneSheet
      open={open}
      title={draft.edit ? 'Edit post' : 'Post an item'}
      className="stw-sheet tpf-sheet"
      onClose={() => !saving && onClose()}
      footer={(
        <>
          <button type="button" className="scm-btn scm-btn--ghost" onClick={back} disabled={saving}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {last ? (
            <button type="button" className="scm-btn" onClick={submit} disabled={saving}>
              {saving ? (draft.edit ? 'Saving…' : 'Posting…') : postLabel(draft)}
            </button>
          ) : (
            <button type="button" className="scm-btn" onClick={next} disabled={!check.done}>Next</button>
          )}
        </>
      )}
    >
      <div className="tpf" ref={rootRef}>
        <div className="tpf-progress">
          <span className="tpf-count">Step {step + 1} of {STEPS.length}</span>
          <span className="tpf-bar" aria-hidden="true">
            {STEPS.map((s, i) => <i key={s} className={i <= step ? 'is-on' : ''} />)}
          </span>
        </div>
        <h3 className="tpf-q">{question}</h3>
        {sub && <p className="tpf-sub">{sub}</p>}
        {message && <p className="tpf-error" role="alert">{message}</p>}
        {body}
      </div>
    </PhoneSheet>
  );
}
