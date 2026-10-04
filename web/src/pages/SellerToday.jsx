import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Minus, Clock, Truck, ArrowClockwise, Stop, CalendarPlus, Info, ForkKnife,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import { resolveImg, firstImage } from '../lib/media';
import { confirmAction } from '../lib/confirm';
import {
  MODES, isOpen, modeLabel, spanLabel, momentLabel, fulfillmentLabel, windowState,
} from '../lib/availability';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSheet from '../components/seller/PhoneSheet';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import TimeLeft from '../components/ui/TimeLeft';
import './SellerDashboard.css';
import './SellerToday.css';

const MODE_HINTS = {
  READY_NOW: 'Already cooked or harvested. Buyers get it right away.',
  MADE_TO_ORDER: 'You make it after the order. Say how long it takes.',
  PRE_ORDER: 'Orders now, ready later: like tomorrow morning.',
};

const pad = (n) => String(n).padStart(2, '0');
// A time as a datetime-local value (the phone's own time).
const toInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const iso = (input) => (input ? new Date(input).toISOString() : undefined);
// Now plus `hours`, on the next half hour.
const later = (hours) => {
  const t = Date.now() + hours * 3600e3;
  return new Date(Math.ceil(t / 1800e3) * 1800e3);
};
const manilaDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
// Today (0), tomorrow (1)… as a Manila date.
const dayFromNow = (days) => manilaDay(Date.now() + days * 86400e3);

/** The product photo, or a plain tile when there is none or it fails to load. */
function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="stw-thumb stw-thumb--empty" aria-hidden="true"><ForkKnife size={22} /></span>;
  return <img className="stw-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

const blankDraft = () => ({
  productId: '',
  mode: 'READY_NOW',
  quantity: '',
  startNow: true,
  ordersOpenAt: toInput(later(1)),
  ordersCloseAt: toInput(later(3)),
  prepMinutes: '',
  readyFrom: '',
  readyUntil: '',
  fulfillment: 'BOTH',
  note: '',
});

/**
 * Today's menu: the shop's Available Today items. Post one with how many and
 * until when; while it is on, add or take away, stretch the time or end it;
 * afterwards, post it again for another day. Orders come in through My orders
 * like any other, with a time to confirm them.
 */
export default function SellerToday() {
  const [scope, setScope] = useState('active');
  const [data, setData] = useState(null);
  const [products, setProducts] = useState(null);
  const [storeMode, setStoreMode] = useState('BOTH');
  const [busyId, setBusyId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [extend, setExtend] = useState(null);
  const [repeat, setRepeat] = useState(null);

  const load = useCallback(async (which) => {
    try {
      const res = await axios.get('/today/mine', { params: { scope: which === 'ended' ? 'ended' : undefined } });
      setData(res.data || { enabled: true, windows: [] });
    } catch (err) {
      toast.error(err.message || "Could not load Today's menu");
      setData({ enabled: true, windows: [] });
    }
  }, []);
  useEffect(() => { setData(null); load(scope); }, [scope, load]);

  useEffect(() => {
    axios.get('/products/my/products', { params: { kind: 'TODAY', pageSize: 100 } })
      .then((res) => setProducts((res.data || []).filter((p) => !['ARCHIVED', 'SUSPENDED'].includes(p.status))))
      .catch(() => setProducts([]));
    axios.get('/stores/my/store')
      .then((res) => setStoreMode(res.data?.fulfillmentMode || 'DELIVERY'))
      .catch(() => {});
  }, []);

  // Live windows tick over on their own: reload when the next one ends or opens.
  useEffect(() => {
    if (scope !== 'active' || !data?.windows?.length) return undefined;
    const now = Date.now();
    const next = data.windows
      .map((w) => new Date(w.status === 'LIVE' ? w.ordersCloseAt : w.ordersOpenAt).getTime())
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    if (!next || next - now > 6 * 3600e3) return undefined;
    const t = setTimeout(() => load('active'), next - now + 65000);
    return () => clearTimeout(t);
  }, [data, scope, load]);

  const replace = (w) => setData((d) => ({ ...d, windows: d.windows.map((x) => (x.id === w.id ? { ...x, ...w } : x)) }));

  const act = async (w, run, done) => {
    setBusyId(w.id);
    try {
      const res = await run();
      if (res?.data) replace(res.data);
      if (done) toast.success(done);
      return res?.data;
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const changeQty = (w, delta) => act(w, () => axios.post(`/today/${w.id}/quantity`, { delta }));

  const endNow = async (w) => {
    const scheduled = w.status === 'SCHEDULED';
    const ok = await confirmAction({
      title: scheduled ? 'Cancel this post?' : 'Stop taking orders?',
      message: scheduled
        ? 'It will not open. You can post it again any time.'
        : 'Buyers can no longer order it. Orders already placed stay.',
      confirmLabel: scheduled ? 'Cancel post' : 'Stop orders',
      danger: true,
    });
    if (!ok) return;
    const res = await act(w, () => axios.post(`/today/${w.id}/end`), scheduled ? 'Post cancelled' : 'Orders stopped');
    if (res) setData((d) => ({ ...d, windows: d.windows.filter((x) => x.id !== w.id) }));
  };

  const saveExtend = async () => {
    if (!extend?.value) return;
    const close = new Date(extend.value);
    const w = extend.window;
    const body = { ordersCloseAt: close.toISOString() };
    if (new Date(w.readyUntil) < close) body.readyUntil = close.toISOString();
    const res = await act(w, () => axios.patch(`/today/${w.id}`, body), `Orders now close ${momentLabel(close)}`);
    if (res) setExtend(null);
  };

  const openRepeat = (w) => {
    const today = dayFromNow(0);
    const tomorrow = dayFromNow(1);
    setRepeat({ window: w, date: tomorrow, quantity: String(w.quantity), today, tomorrow });
  };

  const saveRepeat = async () => {
    const w = repeat.window;
    const body = { date: repeat.date };
    if (repeat.quantity !== '') body.quantity = Number(repeat.quantity);
    const res = await act(w, () => axios.post(`/today/${w.id}/repeat`, body));
    if (res) {
      toast.success(isOpen(res) ? 'Posted: buyers can order now' : `Posted for ${momentLabel(res.ordersOpenAt)}`);
      setRepeat(null);
      setScope('active');
    }
  };

  /* ── posting ─────────────────────────────────────────────────── */
  const openDraft = (productId = '') => {
    const d = blankDraft();
    d.productId = productId || (products?.length === 1 ? products[0].id : '');
    d.fulfillment = storeMode === 'BOTH' ? 'BOTH' : storeMode;
    setDraft(d);
  };
  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const publish = async () => {
    const d = draft;
    if (!d.productId) return toast.error('Choose what you are posting');
    if (!(Number(d.quantity) >= 1)) return toast.error('Enter how many you have');
    if (!d.ordersCloseAt) return toast.error('Choose until when buyers can order');
    if (d.mode === 'PRE_ORDER' && (!d.readyFrom || !d.readyUntil)) return toast.error('Choose when the pre-order is ready');
    const body = {
      productId: d.productId,
      quantity: Number(d.quantity),
      mode: d.mode,
      ordersOpenAt: d.startNow ? undefined : iso(d.ordersOpenAt),
      ordersCloseAt: iso(d.ordersCloseAt),
      prepMinutes: d.mode === 'MADE_TO_ORDER' && d.prepMinutes !== '' ? Number(d.prepMinutes) : undefined,
      readyFrom: d.mode === 'PRE_ORDER' ? iso(d.readyFrom) : undefined,
      readyUntil: d.mode === 'PRE_ORDER' ? iso(d.readyUntil) : undefined,
      fulfillment: d.fulfillment,
      note: d.note.trim() || undefined,
    };
    setSaving(true);
    try {
      const res = await axios.post('/today', body);
      const w = res.data;
      toast.success(w && isOpen(w) ? 'Posted: buyers can order now' : `Posted for ${momentLabel(w?.ordersOpenAt)}`);
      setDraft(null);
      if (scope === 'active') load('active');
      else setScope('active');
    } catch (err) {
      toast.error(err.message || 'Could not post it. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const windows = data?.windows || [];
  const live = windows.filter((w) => w.status === 'LIVE');
  const upcoming = windows.filter((w) => w.status === 'SCHEDULED');
  const enabled = data?.enabled !== false;
  const noProducts = products !== null && products.length === 0;

  const card = (w) => {
    const state = windowState(w, w.remaining);
    const busy = busyId === w.id;
    const ended = scope === 'ended';
    const img = firstImage(w.product?.images);
    return (
      <article key={w.id} className={`stw-card is-${state.tone}`}>
        <div className="stw-card-top">
          <Thumb src={img ? resolveImg(img) : null} />
          <div className="stw-card-main">
            <div className="stw-card-line">
              <span className={`stw-mode is-${w.mode.toLowerCase().replace(/_/g, '-')}`}>{modeLabel(w.mode)}</span>
              <span className={`stw-state is-${state.tone}`}>
                {ended ? (w.status === 'CANCELLED' ? 'Cancelled' : `Ended ${momentLabel(w.endedAt || w.ordersCloseAt)}`) : state.text}
              </span>
            </div>
            <h3 className="stw-name">
              {w.product?.slug ? <Link to={`/product/${w.product.slug}`}>{w.product.name}</Link> : w.product?.name || 'Product'}
            </h3>
            <p className="stw-meta">
              <Clock size={14} aria-hidden="true" /> Ready {spanLabel(w.readyFrom, w.readyUntil)}
              {w.prepMinutes ? ` · ${w.prepMinutes} min to make` : ''}
            </p>
            <p className="stw-meta"><Truck size={14} aria-hidden="true" /> {fulfillmentLabel(w.fulfillment)}</p>
            {w.note && <p className="stw-note">{w.note}</p>}
          </div>
        </div>

        <div className="stw-count">
          <div>
            <strong>{ended ? w.soldCount : (w.remaining ?? Math.max(0, w.quantity - w.soldCount))}</strong>
            <span>{ended ? `ordered of ${w.quantity}` : `left of ${w.quantity}`}</span>
          </div>
          {!ended && <div><strong>{w.soldCount}</strong><span>ordered</span></div>}
          {!ended && w.status === 'LIVE' && <TimeLeft until={w.ordersCloseAt} prefix="Ends in" className="stw-left" />}
        </div>

        {ended ? (
          <div className="stw-actions">
            <button type="button" className="stw-btn" disabled={busy} onClick={() => openRepeat(w)}>
              <ArrowClockwise size={16} /> Post again
            </button>
          </div>
        ) : (
          <div className="stw-actions">
            <div className="stw-stepper" role="group" aria-label={`How many of ${w.product?.name || 'this'}`}>
              <button
                type="button"
                aria-label="One less"
                disabled={busy || (w.status === 'LIVE' ? (w.remaining ?? 0) < 1 : w.quantity - w.soldCount <= 1)}
                onClick={() => changeQty(w, -1)}
              >
                <Minus size={16} weight="bold" />
              </button>
              <span aria-live="polite">{w.quantity}</span>
              <button type="button" aria-label="One more" disabled={busy} onClick={() => changeQty(w, 1)}>
                <Plus size={16} weight="bold" />
              </button>
            </div>
            <button type="button" className="stw-btn stw-btn--ghost" disabled={busy} onClick={() => setExtend({ window: w, value: toInput(new Date(new Date(w.ordersCloseAt).getTime() + 3600e3)) })}>
              <CalendarPlus size={16} /> {w.status === 'LIVE' ? 'More time' : 'Change time'}
            </button>
            <button type="button" className="stw-btn stw-btn--danger" disabled={busy} onClick={() => endNow(w)}>
              <Stop size={16} /> {w.status === 'LIVE' ? 'End' : 'Cancel'}
            </button>
          </div>
        )}
      </article>
    );
  };

  const productOptions = useMemo(() => products || [], [products]);

  return (
    <div className="seller-dashboard stw">
      <div className="seller-container">
        <SellerPageHead
          title="Today's menu"
          subtitle="Post fresh food and harvests for a limited time. Buyers order until it ends or sells out."
          actions={!noProducts && enabled ? (
            <button type="button" className="btn-seller-primary" onClick={() => openDraft()} disabled={products === null}>
              <Plus size={16} weight="bold" /> Post an item
            </button>
          ) : null}
        />

        {!enabled && (
          <p className="stw-banner"><Info size={16} /> Available Today is turned off for now. Your posts are kept; buyers can&apos;t order them.</p>
        )}

        <div className="stw-tabs" role="tablist" aria-label="Show">
          {[['active', 'On now & coming up'], ['ended', 'Ended']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={scope === key} className={scope === key ? 'is-on' : ''} onClick={() => setScope(key)}>
              {label}
            </button>
          ))}
        </div>

        {data === null ? (
          <div className="stw-list" aria-busy="true">
            {[0, 1].map((i) => <Skeleton key={i} height={190} radius={16} />)}
          </div>
        ) : windows.length === 0 ? (
          <div className="seller-card stw-empty">
            {noProducts ? (
              <EmptyState
                className="ui-empty--inset"
                art="calendar"
                title="Nothing to post yet"
                text={'First add a product and choose "Available Today" under How you sell it. Then post it here on the days you have it.'}
                actions={[{ label: 'Add a product', to: '/seller/products/new', icon: Plus }]}
              />
            ) : (
              <EmptyState
                className="ui-empty--inset"
                art="calendar"
                title={scope === 'ended' ? 'Nothing ended in the last 30 days' : 'Nothing on today\'s menu'}
                text={scope === 'ended' ? 'Posts that ended show here, so you can post them again.' : 'Post what you have today, how many, and until when.'}
                actions={scope === 'ended' || !enabled ? [] : [{ label: 'Post an item', onClick: () => openDraft(), icon: Plus }]}
              />
            )}
          </div>
        ) : scope === 'ended' ? (
          <div className="stw-list">{windows.map(card)}</div>
        ) : (
          <>
            {live.length > 0 && (
              <section className="stw-group">
                <h2 className="stw-group-title"><span className="stw-dot" aria-hidden="true" /> On now <small>{live.length}</small></h2>
                <div className="stw-list">{live.map(card)}</div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section className="stw-group">
                <h2 className="stw-group-title">Coming up <small>{upcoming.length}</small></h2>
                <div className="stw-list">{upcoming.map(card)}</div>
              </section>
            )}
          </>
        )}

        {!noProducts && products !== null && (
          <p className="stw-foot">
            Orders for these show in <Link to="/seller/orders">My orders</Link>. Confirm each one quickly: unconfirmed orders cancel on their own.
          </p>
        )}
      </div>

      {/* Post an item */}
      <PhoneSheet
        open={Boolean(draft)}
        title="Post an item"
        className="stw-sheet"
        onClose={() => !saving && setDraft(null)}
        footer={draft && (
          <>
            <button type="button" className="scm-btn scm-btn--ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
            <button type="button" className="scm-btn" onClick={publish} disabled={saving}>{saving ? 'Posting…' : 'Post'}</button>
          </>
        )}
      >
        {draft && (
          <div className="stw-form">
            <label className="scm-field">
              What
              <select value={draft.productId} onChange={(e) => setD({ productId: e.target.value })}>
                <option value="">Choose a product</option>
                {productOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>

            <span className="scm-sheet-label">Kind</span>
            <div className="stw-modes" role="radiogroup" aria-label="Kind">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.mode === m.key}
                  className={`stw-mode-pick${draft.mode === m.key ? ' is-on' : ''}`}
                  onClick={() => setD({ mode: m.key })}
                >
                  <strong>{m.label}</strong>
                  <small>{MODE_HINTS[m.key]}</small>
                </button>
              ))}
            </div>

            <div className="scm-field-row">
              <label className="scm-field">
                How many
                <input type="number" inputMode="numeric" min="1" step="1" value={draft.quantity} onChange={(e) => setD({ quantity: e.target.value })} placeholder="e.g. 20" />
              </label>
              {draft.mode === 'MADE_TO_ORDER' && (
                <label className="scm-field">
                  Minutes to make
                  <input type="number" inputMode="numeric" min="0" max="1440" step="5" value={draft.prepMinutes} onChange={(e) => setD({ prepMinutes: e.target.value })} placeholder="e.g. 30" />
                </label>
              )}
            </div>

            <span className="scm-sheet-label">Buyers can order</span>
            <label className="stw-check">
              <input type="checkbox" checked={draft.startNow} onChange={(e) => setD({ startNow: e.target.checked })} />
              Starting now
            </label>
            <div className="scm-field-row">
              {!draft.startNow && (
                <label className="scm-field">
                  From
                  <input type="datetime-local" value={draft.ordersOpenAt} onChange={(e) => setD({ ordersOpenAt: e.target.value })} />
                </label>
              )}
              <label className="scm-field">
                Until
                <input type="datetime-local" value={draft.ordersCloseAt} onChange={(e) => setD({ ordersCloseAt: e.target.value })} />
              </label>
            </div>

            {draft.mode === 'PRE_ORDER' && (
              <>
                <span className="scm-sheet-label">Ready for buyers</span>
                <div className="scm-field-row">
                  <label className="scm-field">
                    From
                    <input type="datetime-local" value={draft.readyFrom} onChange={(e) => setD({ readyFrom: e.target.value })} />
                  </label>
                  <label className="scm-field">
                    Until
                    <input type="datetime-local" value={draft.readyUntil} onChange={(e) => setD({ readyUntil: e.target.value })} />
                  </label>
                </div>
              </>
            )}

            {storeMode === 'BOTH' ? (
              <label className="scm-field stw-gap">
                How buyers get it
                <select value={draft.fulfillment} onChange={(e) => setD({ fulfillment: e.target.value })}>
                  <option value="BOTH">Pickup or delivery</option>
                  <option value="PICKUP">Pickup only</option>
                  <option value="DELIVERY">Delivery only</option>
                </select>
              </label>
            ) : (
              <p className="stw-hint">{fulfillmentLabel(storeMode)}, as your shop is set up. Couriers don&apos;t carry Today items.</p>
            )}

            <label className="scm-field stw-gap">
              Note for buyers (optional)
              <input value={draft.note} maxLength={200} onChange={(e) => setD({ note: e.target.value })} placeholder="e.g. Best eaten warm. Bring your own container." />
            </label>
          </div>
        )}
      </PhoneSheet>

      {/* More time */}
      <PhoneSheet
        open={Boolean(extend)}
        title={extend?.window.status === 'LIVE' ? 'More time to order' : 'Change the time'}
        className="stw-sheet"
        onClose={() => setExtend(null)}
        footer={extend && (
          <>
            <button type="button" className="scm-btn scm-btn--ghost" onClick={() => setExtend(null)}>Cancel</button>
            <button type="button" className="scm-btn" onClick={saveExtend} disabled={busyId === extend.window.id}>Save</button>
          </>
        )}
      >
        {extend && (
          <div className="stw-form">
            <p className="stw-hint">Now: orders close {momentLabel(extend.window.ordersCloseAt)}.</p>
            <label className="scm-field">
              Orders close
              <input type="datetime-local" value={extend.value} onChange={(e) => setExtend((x) => ({ ...x, value: e.target.value }))} />
            </label>
          </div>
        )}
      </PhoneSheet>

      {/* Post again */}
      <PhoneSheet
        open={Boolean(repeat)}
        title="Post again"
        className="stw-sheet"
        onClose={() => setRepeat(null)}
        footer={repeat && (
          <>
            <button type="button" className="scm-btn scm-btn--ghost" onClick={() => setRepeat(null)}>Cancel</button>
            <button type="button" className="scm-btn" onClick={saveRepeat} disabled={busyId === repeat.window.id}>Post</button>
          </>
        )}
      >
        {repeat && (
          <div className="stw-form">
            <p className="stw-hint">
              {repeat.window.product?.name}: the same times of day ({spanLabel(repeat.window.ordersOpenAt, repeat.window.ordersCloseAt)} last time), on the day you choose.
            </p>
            <div className="stw-days" role="radiogroup" aria-label="Day">
              {[[repeat.today, 'Today'], [repeat.tomorrow, 'Tomorrow']].map(([day, label]) => (
                <button key={day} type="button" role="radio" aria-checked={repeat.date === day} className={`scm-chip${repeat.date === day ? ' is-on' : ''}`} onClick={() => setRepeat((r) => ({ ...r, date: day }))}>
                  {label}
                </button>
              ))}
              <input
                type="date"
                aria-label="Another day"
                value={repeat.date}
                min={repeat.today}
                onChange={(e) => e.target.value && setRepeat((r) => ({ ...r, date: e.target.value }))}
              />
            </div>
            <label className="scm-field stw-gap">
              How many
              <input type="number" inputMode="numeric" min="1" step="1" value={repeat.quantity} onChange={(e) => setRepeat((r) => ({ ...r, quantity: e.target.value }))} />
            </label>
          </div>
        )}
      </PhoneSheet>
    </div>
  );
}
