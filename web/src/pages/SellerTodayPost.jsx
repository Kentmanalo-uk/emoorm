import { useEffect, useMemo, useState } from 'react';
import {
  Link, useLocation, useNavigate, useParams, useSearchParams,
} from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BowlFood, CookingPot, CalendarCheck, CaretLeft, Check, Basket, Lock, Minus, Plus,
} from '../lib/icons';
import axios from '../lib/axios';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { confirmAction } from '../lib/confirm';
import LoadFailed from '../components/ui/LoadFailed';
import { resolveImg, firstImage } from '../lib/media';
import { isOpen, momentLabel } from '../lib/availability';
import { saleInfo } from '../lib/variantPricing';
import {
  WEEKDAYS, addDays, clockText, dayTitle, manilaClock, manilaDay,
} from '../lib/manilaDays';
import {
  AHEAD_DAYS, SECTIONS, KINDS, COOK_PICKS, QTY_PICKS, WEEK_PICKS, DAY_CHOICES, GET_CHOICES, LOCKED_NOTE,
  blankDraft, editDraft, againDraft, isLocked, withMode, withDays, withStartNow, toggleWeekday, pickDay, draftDays,
  moments, untilNextDay, startsNow, formErrors, daysLine, summaryLine, postLabel, batchBody, editBody, plainError,
  errorSection, plural,
} from '../lib/todayPost';
import DayCalendar from '../components/seller/DayCalendar';
import Skeleton from '../components/ui/Skeleton';
import { BusyLabel } from '../components/ui/Spinner';
import { peso } from '../lib/format';
import './SellerDashboard.css';
import './SellerTodayPost.css';

const KIND_ICONS = { READY_NOW: BowlFood, MADE_TO_ORDER: CookingPot, PRE_ORDER: CalendarCheck };
const ms = (v) => new Date(v).getTime();

/** The product photo, or a plain tile. */
function Photo({ product }) {
  const [failed, setFailed] = useState(false);
  const img = firstImage(product?.images);
  if (!img || failed) return <span className="tpp-photo is-empty" aria-hidden="true"><Basket size={22} /></span>;
  return <img className="tpp-photo" src={resolveImg(img)} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** A numbered section: a short title, at most one hint, the fields, and its error under them. */
function Section({
  n, id, title, hint, error, locked = false, children,
}) {
  return (
    <section className="tpp-sec" id={`tpp-sec-${id}`} aria-labelledby={`tpp-${id}`}>
      <h2 className="tpp-sec-title" id={`tpp-${id}`}>
        <span className="tpp-num" aria-hidden="true">{n}</span>
        {title}
        {locked && <Lock size={16} className="tpp-lock-icon" aria-label="Stays the same" />}
      </h2>
      {hint && <p className="tpp-hint">{hint}</p>}
      {children}
      {error && <p className="tpp-error" role="alert">{error}</p>}
    </section>
  );
}

/** Choices in one row (Today / Pick days / Every week, Same day / Next day…). */
function Seg({
  choices, value, onChange, label, small = false,
}) {
  return (
    <div className={`tpp-seg${small ? ' is-small' : ''}`} role="radiogroup" aria-label={label}>
      {choices.map(([key, text]) => (
        <button key={String(key)} type="button" role="radio" aria-checked={value === key} className={value === key ? 'is-on' : ''} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Quick picks in a row: 15 / 30 / 45 / 60 min, 10 / 20 / 30 / 50. */
function Picks({
  values, value, onPick, suffix = '', label, min = 0, extra = null,
}) {
  return (
    <div className="tpp-picks" role="group" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" aria-pressed={String(value) === String(v)} disabled={v < min} className={String(value) === String(v) ? 'is-on' : ''} onClick={() => onPick(v)}>
          {v}{suffix}
        </button>
      ))}
      {extra}
    </div>
  );
}

function TimeInput({ value, onChange, label }) {
  return <input className="tpp-time" type="time" step="300" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * Post an item to Available today, or edit one post, on one page
 * (/seller/today/new, /seller/today/:id/edit; /seller/today/new?again=:id
 * fills it in from an ended post; ?product=:id picks an item, shown
 * alone with "Change item"). Every section shows at once; a bar at the
 * bottom sums it up in one line with the main button. lib/todayPost.js holds
 * the rules, shared with the app.
 */
export default function SellerTodayPost() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const againId = id ? null : params.get('again');
  const productId = id || againId ? null : params.get('product');
  const navigate = useNavigate();
  const location = useLocation();

  const [products, setProducts] = useState(null);
  const [storeMode, setStoreMode] = useState('BOTH');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [missing, setMissing] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [otherCook, setOtherCook] = useState(false);
  const [changeDay, setChangeDay] = useState(false);
  // "Change item": the whole list again, though an item is already chosen.
  const [changeItem, setChangeItem] = useState(false);
  // The form as it opened, to tell when something was changed; and whether
  // the items could be loaded at all (a failure is not "no items").
  const [opened, setOpened] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prods, mode, post] = await Promise.all([
        axios.get('/products/my/products', { params: { kind: 'TODAY', pageSize: 100 } })
          .then((res) => (res.data || []).filter((p) => !['ARCHIVED', 'SUSPENDED'].includes(p.status)))
          .catch(() => null),
        axios.get('/stores/my/store').then((res) => res.data?.fulfillmentMode || 'DELIVERY').catch(() => 'BOTH'),
        id || againId
          ? axios.get('/today/mine', { params: { scope: againId ? 'ended' : undefined } })
            .then((res) => (res.data?.windows || []).find((w) => w.id === (id || againId)) || null)
            .catch(() => null)
          : null,
      ]);
      if (cancelled) return;
      if (prods === null) { setLoadFailed(true); return; }
      setLoadFailed(false);
      setProducts(prods);
      setStoreMode(mode);
      if (id) {
        if (!post || !['LIVE', 'SCHEDULED'].includes(post.status)) { setMissing(true); return; }
        setEditing(post);
        const d = editDraft(post);
        setDraft(d);
        setOpened(d);
      } else if (post) {
        const d = againDraft(post, { products: prods, storeMode: mode });
        setDraft(d);
        setOpened(d);
        setOtherCook(d.prepMinutes !== '' && !COOK_PICKS.includes(Number(d.prepMinutes)));
      } else {
        // ?product=<id>: Post on a menu item picks it.
        const d = blankDraft({ products: prods, storeMode: mode });
        if (productId && prods.some((p) => p.id === productId)) d.productId = productId;
        setDraft(d);
        setOpened(d);
      }
    })();
    return () => { cancelled = true; };
  }, [id, againId, productId, attempt]);

  // Leaving with changes asks first: links (useUnsavedChanges) and the back arrow.
  const dirty = Boolean(draft && opened) && !done && JSON.stringify(draft) !== JSON.stringify(opened);
  useUnsavedChanges(dirty && !saving, { title: id ? 'Leave without saving?' : 'Leave without posting?', message: id ? 'Your changes to this post are not saved yet.' : 'This post is not up yet.' });

  // Editing, the post's own product comes first (and is the only one once buyers ordered it).
  const list = useMemo(() => {
    if (!products) return [];
    if (!editing) return products;
    const own = products.find((p) => p.id === editing.productId)
      || { ...editing.product, id: editing.productId, name: editing.product?.name || 'Item' };
    if (editing.soldCount > 0) return [own];
    return [own, ...products.filter((p) => p.id !== editing.productId)];
  }, [products, editing]);

  const goBack = () => {
    if (location.state?.fromList) navigate(-1);
    else navigate('/seller/today', { replace: true });
  };
  const requestBack = async () => {
    if (dirty && !saving) {
      const leave = await confirmAction({
        title: id ? 'Leave without saving?' : 'Leave without posting?',
        message: id ? 'Your changes to this post are not saved yet.' : 'This post is not up yet.',
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
        danger: true,
      });
      if (!leave) return;
    }
    goBack();
  };

  const title = id ? 'Edit post' : 'Post an item';
  const head = (
    <div className="tpp-head">
      <button type="button" className="tpp-back" onClick={requestBack} aria-label="Back">
        <CaretLeft size={22} weight="bold" />
      </button>
      <h1>{title}</h1>
    </div>
  );

  if (missing) {
    return (
      <div className="seller-dashboard tpp">
        {head}
        <div className="tpp-form">
          <p className="tpp-hint">This post has ended or was removed, so it can&apos;t be changed.</p>
          <Link to="/seller/today" className="btn-seller-primary tpp-missing">Back to Available today</Link>
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="seller-dashboard tpp">
        {head}
        <div className="tpp-form">
          <LoadFailed what="your items" compact onRetry={() => { setLoadFailed(false); setAttempt((n) => n + 1); }} />
        </div>
      </div>
    );
  }

  if (!draft || !products) {
    return (
      <div className="seller-dashboard tpp" aria-busy="true">
        {head}
        <div className="tpp-form">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={120} radius={14} />)}
        </div>
      </div>
    );
  }

  const set = (patch) => {
    setDraft((d) => (typeof patch === 'function' ? patch(d) : { ...d, ...patch }));
    setServerError(null);
  };

  const locked = isLocked(draft);
  const errors = formErrors(draft);
  const errorOf = (section) => {
    if (serverError?.section === section) return serverError.text;
    const e = errors[section];
    return e && (!e.empty || tried) ? e.text : null;
  };
  const today = manilaDay();
  const lastDay = addDays(today, AHEAD_DAYS - 1);
  const m = moments(draft);
  const days = draftDays(draft);
  const showGet = storeMode === 'BOTH';

  const scrollTo = (section) => {
    // After the error has rendered: the section from its title, or, when it is
    // taller than the screen, its error in the middle of the screen.
    setTimeout(() => {
      const sec = document.getElementById(`tpp-sec-${section}`);
      const err = sec?.querySelector('.tpp-error');
      if (err && sec.offsetHeight > window.innerHeight - 220) err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const posted = (windows) => {
    if (windows.length > 1) {
      const first = dayTitle(manilaDay(ms(windows[0].ordersOpenAt)));
      return `Posted for ${windows.length} days, starting ${['Today', 'Tomorrow'].includes(first) ? first.toLowerCase() : first}`;
    }
    if (windows[0]) return isOpen(windows[0]) ? 'Posted: buyers can order now' : `Posted for ${momentLabel(windows[0].ordersOpenAt)}`;
    return 'Posted';
  };

  const submit = async () => {
    setTried(true);
    const first = SECTIONS.find((s) => errors[s]);
    if (first) { scrollTo(first); return; }
    setSaving(true);
    try {
      if (draft.edit) {
        await axios.patch(`/today/${draft.edit.id}`, editBody(draft));
        toast.success('Saved');
      } else {
        const res = await axios.post('/today/batch', batchBody(draft));
        toast.success(posted(res.data?.windows || []));
      }
      setDone(true);
      goBack();
    } catch (err) {
      const raw = err.message || 'That did not work. Please try again.';
      const section = errorSection(raw) || 'end';
      setServerError({ section, text: plainError(raw) });
      scrollTo(section);
    } finally {
      setSaving(false);
    }
  };

  // The sections' numbers: "How buyers get it" only shows when the shop does both.
  const shown = SECTIONS.filter((s) => s !== 'get' || showGet);
  const num = (key) => shown.indexOf(key) + 1;

  /* ── 1. Item ─────────────────────────────────────────────────── */
  // An item already chosen (Post on an item, editing, Post again, a shop
  // with one item, or one just tapped) shows alone; "Change item" opens the
  // list again, unless buyers already ordered this post.
  const chosen = list.find((p) => p.id === draft.productId);
  const canChange = !locked && list.length > 1;
  const showOne = chosen && (!changeItem || !canChange);
  const itemText = (p) => (
    <span className="tpp-product-text">
      <span className="tpp-product-name">{p.name}</span>
      {p.price != null && <span className="tpp-product-price">{peso(saleInfo(p).price)}</span>}
    </span>
  );
  const itemSection = (
    <Section n={num('item')} id="item" title="Item" error={errorOf('item')}>
      {locked && <p className="tpp-locked"><Lock size={16} weight="bold" aria-hidden="true" /> {LOCKED_NOTE}</p>}
      {list.length === 0 && (
        <p className="tpp-hint">
          Add items to Available today first. <Link to="/seller/today?tab=menu">Go to Your items</Link>
        </p>
      )}
      {list.length > 0 && showOne && (
        <div className="tpp-product is-on is-chosen">
          <Photo product={chosen} />
          {itemText(chosen)}
          {canChange ? (
            <button type="button" className="tpp-link tpp-change" aria-expanded="false" onClick={() => setChangeItem(true)}>
              Change item
            </button>
          ) : <span className="tpp-tick" aria-hidden="true"><Check size={12} weight="bold" /></span>}
        </div>
      )}
      {list.length > 0 && !showOne && (
        <div className="tpp-products" role="radiogroup" aria-label="Item">
          {list.map((p) => {
            const on = draft.productId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`tpp-product${on ? ' is-on' : ''}`}
                onClick={() => { set({ productId: p.id }); setChangeItem(false); }}
              >
                <Photo product={p} />
                {itemText(p)}
                {on && <span className="tpp-tick" aria-hidden="true"><Check size={12} weight="bold" /></span>}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );

  /* ── 2. Is it ready now? ─────────────────────────────────────── */
  const cookOther = otherCook || (draft.prepMinutes !== '' && !COOK_PICKS.includes(Number(draft.prepMinutes)));
  const readySection = (
    <Section n={num('ready')} id="ready" title="Is it ready now?" locked={locked} error={errorOf('ready')}>
      <div className="tpp-kinds" role="radiogroup" aria-label="Is it ready now?">
        {KINDS.filter((k) => !locked || k.key === draft.mode).map((k) => {
          const Icon = KIND_ICONS[k.key];
          const on = draft.mode === k.key;
          return (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked}
              className={`tpp-kind${on ? ' is-on' : ''}`}
              onClick={() => set((d) => withMode(d, k.key))}
            >
              <Icon size={22} className="tpp-kind-icon" aria-hidden="true" />
              <span className="tpp-kind-text">
                <strong>{k.title}</strong>
                <small>{k.hint}</small>
              </span>
              {on && <Check size={18} weight="bold" className="tpp-kind-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {draft.mode === 'MADE_TO_ORDER' && (
        <div className="tpp-sub">
          <p className="tpp-label">Minutes to cook</p>
          {locked ? (
            <p className="tpp-fixed">{draft.prepMinutes} minutes</p>
          ) : (
            <>
              <Picks
                values={COOK_PICKS}
                value={cookOther ? '' : draft.prepMinutes}
                onPick={(v) => { setOtherCook(false); set({ prepMinutes: String(v) }); }}
                label="Minutes to cook"
                extra={(
                  <button type="button" aria-pressed={cookOther} className={cookOther ? 'is-on' : ''} onClick={() => { setOtherCook(true); set({ prepMinutes: '' }); }}>
                    Other
                  </button>
                )}
              />
              {cookOther && (
                <label className="tpp-inline">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="1440"
                    value={draft.prepMinutes}
                    placeholder="90"
                    onChange={(e) => set({ prepMinutes: e.target.value.replace(/[^0-9]/g, '') })}
                    aria-label="Minutes to cook"
                  />
                  minutes
                </label>
              )}
            </>
          )}
        </div>
      )}
    </Section>
  );

  /* ── 3. How many ─────────────────────────────────────────────── */
  const qtyNum = Number(draft.quantity) || 0;
  const minQty = Math.max(1, draft.edit?.sold || 0);
  const qtySection = (
    <Section
      n={num('qty')}
      id="qty"
      title={draft.edit ? 'How many to sell' : 'How many each day'}
      hint={draft.edit?.sold ? `Buyers already ordered ${draft.edit.sold}.` : null}
      error={errorOf('qty')}
     
    >
      <div className="tpp-stepper" role="group" aria-label="How many">
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
    </Section>
  );

  /* ── 4. When ─────────────────────────────────────────────────── */
  const openField = (m.keepsOpen && locked) || startsNow(draft)
    ? <strong className="tpp-fixed-time">{startsNow(draft) ? 'now' : clockText(manilaClock(m.openAt))}</strong>
    : <TimeInput value={draft.open} label="Orders open at" onChange={(v) => set({ open: v, timesSet: true })} />;

  const whenSection = (
    <Section n={num('when')} id="when" title="When" locked={locked} error={errorOf('when')}>
      {draft.edit ? (
        <div className="tpp-day">
          <span>Day: <strong>{daysLine(draft)}</strong></span>
          {!locked && (
            <button type="button" className="tpp-link" aria-expanded={changeDay} onClick={() => setChangeDay((c) => !c)}>
              {changeDay ? 'Done' : 'Change day'}
            </button>
          )}
        </div>
      ) : (
        <Seg choices={DAY_CHOICES.map((c) => [c.key, c.title])} value={draft.days} onChange={(v) => set((d) => withDays(d, v))} label="Which days" />
      )}

      {draft.edit && changeDay && !locked && (
        <DayCalendar value={draft.picked} onToggle={(day) => set((d) => pickDay(d, day))} min={today} max={lastDay} today={today} label="Which day" />
      )}

      {!draft.edit && draft.days === 'today' && (
        <button type="button" role="switch" aria-checked={draft.startNow} className={`tpp-check${draft.startNow ? ' is-on' : ''}`} onClick={() => set((d) => withStartNow(d, !d.startNow))}>
          <span className="tpp-box" aria-hidden="true">{draft.startNow && <Check size={14} weight="bold" />}</span>
          Start now
        </button>
      )}

      {!draft.edit && draft.days === 'pick' && (
        <>
          <DayCalendar value={draft.picked} onToggle={(day) => set((d) => pickDay(d, day))} min={today} max={lastDay} today={today} label="Pick days" />
          {draft.picked.length > 0 && (
            <p className="tpp-picked" aria-live="polite">
              <strong>{plural(draft.picked.length, 'day')} picked</strong>
              <button type="button" className="tpp-link" onClick={() => set({ picked: [] })}>Clear</button>
            </p>
          )}
        </>
      )}

      {!draft.edit && draft.days === 'weekly' && (
        <>
          <div className="tpp-weekdays" role="group" aria-label="Days of the week">
            {WEEKDAYS.map((w, i) => (
              <button key={w} type="button" aria-pressed={draft.weekdays.includes(i)} className={draft.weekdays.includes(i) ? 'is-on' : ''} onClick={() => set((d) => toggleWeekday(d, i))}>
                {w}
              </button>
            ))}
          </div>
          <div className="tpp-row">
            <span className="tpp-row-label">For</span>
            <Seg small choices={WEEK_PICKS.map((k) => [k, plural(k, 'week')])} value={draft.weeks} onChange={(k) => set({ weeks: k })} label="For how many weeks" />
          </div>
          {days.length > 0 && <p className="tpp-picked" aria-live="polite">{daysLine(draft)}</p>}
        </>
      )}

      <div className="tpp-sentence">
        <span>Buyers can order from</span>
        <span className="tpp-times">
          {openField}
          <span>until</span>
          <TimeInput value={draft.close} label="Orders close at" onChange={(v) => set({ close: v, timesSet: true })} />
        </span>
        {m.closeNextDay && <em className="tpp-next">(next day)</em>}
      </div>

      {draft.mode === 'PRE_ORDER' && (
        <div className="tpp-sentence">
          <span className="tpp-times">
            <span>Ready on</span>
            <Seg small choices={[[false, 'Same day'], [true, 'Next day']]} value={draft.readyNextDay} onChange={(v) => set({ readyNextDay: v })} label="Ready on" />
          </span>
          <span className="tpp-times">
            <TimeInput value={draft.readyFrom} label="Ready from" onChange={(v) => set({ readyFrom: v })} />
            <span>until</span>
            <TimeInput value={draft.readyUntil} label="Ready until" onChange={(v) => set({ readyUntil: v })} />
          </span>
          {untilNextDay(draft) && <em className="tpp-next">(next day)</em>}
        </div>
      )}
    </Section>
  );

  /* ── 5. How buyers get it (only when the shop does both) ─────── */
  const getSection = showGet ? (
    <Section n={num('get')} id="get" title="How buyers get it" error={errorOf('get')}>
      <Seg choices={GET_CHOICES.map((c) => [c.key, c.title])} value={draft.fulfillment} onChange={(v) => set({ fulfillment: v })} label="How buyers get it" />
    </Section>
  ) : null;

  /* ── 6. Note ─────────────────────────────────────────────────── */
  const noteSection = (
    <Section n={num('note')} id="note" title="Note for buyers (optional)">
      <input
        className="tpp-note"
        value={draft.note}
        maxLength={200}
        onChange={(e) => set({ note: e.target.value })}
        placeholder="e.g. Picked this morning, or Best eaten warm"
        aria-label="Note for buyers"
      />
    </Section>
  );

  const summary = summaryLine(draft);

  return (
    <div className="seller-dashboard tpp">
      {head}
      <div className="tpp-form">
        {itemSection}
        {readySection}
        {qtySection}
        {whenSection}
        {getSection}
        {noteSection}
        <div id="tpp-sec-end" className="tpp-end">
          {serverError?.section === 'end' && <p className="tpp-error" role="alert">{serverError.text}</p>}
        </div>
      </div>

      <div className="tpp-bar">
        <div className="tpp-bar-in">
          <p className="tpp-summary" aria-live="polite">{summary || 'Fill in the form, then post.'}</p>
          <button type="button" className="tpp-go" onClick={submit} disabled={saving}>
            {saving ? <BusyLabel>{draft.edit ? 'Saving…' : 'Posting…'}</BusyLabel> : postLabel(draft)}
          </button>
        </div>
      </div>
    </div>
  );
}
