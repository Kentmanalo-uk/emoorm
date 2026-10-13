import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Minus, Clock, Truck, ArrowClockwise, Stop, CalendarPlus, Info, ForkKnife, PencilSimple,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import { resolveImg, firstImage } from '../lib/media';
import { confirmAction } from '../lib/confirm';
import {
  isOpen, momentLabel, clockLabel, dayName,
} from '../lib/availability';
import {
  addDays, dayTitle, toggleDay, manilaDay,
} from '../lib/manilaDays';
import { AHEAD_DAYS, kindOf, getLabel, plural } from '../lib/todayPost';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSheet from '../components/seller/PhoneSheet';
import DayCalendar from '../components/seller/DayCalendar';
import TodayPostFlow from '../components/seller/TodayPostFlow';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import TimeLeft from '../components/ui/TimeLeft';
import './SellerDashboard.css';
import './SellerToday.css';

const pad = (n) => String(n).padStart(2, '0');
// A time as a datetime-local value (the phone's own time).
const toInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const ms = (v) => new Date(v).getTime();

/** The product photo, or a plain tile when there is none or it fails to load. */
function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="stw-thumb stw-thumb--empty" aria-hidden="true"><ForkKnife size={22} /></span>;
  return <img className="stw-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/**
 * A post's state in plain words: "Taking orders", "Sold out",
 * "Starts tomorrow 10:00 AM", "Ended" or "Cancelled", with its tone.
 */
const postStatus = (w, ended = false, now = Date.now()) => {
  if (ended || !['LIVE', 'SCHEDULED'].includes(w.status)) {
    return { tone: 'ended', text: w.status === 'CANCELLED' ? 'Cancelled' : 'Ended' };
  }
  if (w.status === 'SCHEDULED' && ms(w.ordersOpenAt) > now) {
    const day = dayName(w.ordersOpenAt, now);
    return { tone: 'soon', text: `Starts ${['Today', 'Tomorrow'].includes(day) ? day.toLowerCase() : day} ${clockLabel(w.ordersOpenAt)}` };
  }
  if (!isOpen(w, now)) return { tone: 'ended', text: 'Ended' };
  if ((w.remaining ?? 1) <= 0) return { tone: 'ended', text: 'Sold out' };
  return { tone: 'live', text: 'Taking orders' };
};

/** "Orders 10:00 AM – 2:00 PM" (with "(next day)" when it closes the day after). */
const ordersSpan = (w) => {
  const next = manilaDay(ms(w.ordersCloseAt)) !== manilaDay(ms(w.ordersOpenAt)) ? ' (next day)' : '';
  return `Orders ${clockLabel(w.ordersOpenAt)} – ${clockLabel(w.ordersCloseAt)}${next}`;
};

/**
 * Today's menu: the shop's Available Today items. "Post an item" walks the
 * seller through it one question at a time (TodayPostFlow): what, is it
 * ready now, how many, when, then a check. Each post can be edited through
 * the same steps; while it is on, add or take away, give it more time or end
 * it; afterwards, post it again on other days. Orders come in through My
 * orders like any other, with a time to confirm them.
 */
export default function SellerToday() {
  const [scope, setScope] = useState('active');
  const [data, setData] = useState(null);
  const [products, setProducts] = useState(null);
  const [storeMode, setStoreMode] = useState('BOTH');
  const [busyId, setBusyId] = useState(null);
  const [flow, setFlow] = useState({ open: false, key: 0, window: null });
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
      .map((w) => ms(w.status === 'LIVE' ? w.ordersCloseAt : w.ordersOpenAt))
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
      if (res?.data && res.data.id) replace(res.data);
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

  /** A toast for what was posted: one window, or several days. */
  const posted = (list) => {
    if (list.length > 1) {
      const first = dayTitle(manilaDay(ms(list[0].ordersOpenAt)));
      toast.success(`Posted for ${list.length} days, starting ${['Today', 'Tomorrow'].includes(first) ? first.toLowerCase() : first}`);
    } else if (list[0]) {
      toast.success(isOpen(list[0]) ? 'Posted: buyers can order now' : `Posted for ${momentLabel(list[0].ordersOpenAt)}`);
    }
  };

  const openRepeat = (w) => {
    const today = manilaDay();
    setRepeat({ window: w, dates: [addDays(today, 1)], quantity: String(w.quantity), today });
  };

  const saveRepeat = async () => {
    const w = repeat.window;
    if (!repeat.dates.length) return toast.error('Pick at least one day');
    const body = { dates: repeat.dates };
    if (repeat.quantity !== '') body.quantity = Number(repeat.quantity);
    const res = await act(w, () => axios.post(`/today/${w.id}/repeat`, body));
    if (res) {
      posted(res.windows || []);
      setRepeat(null);
      setScope('active');
    }
    return undefined;
  };

  /* ── posting and editing ─────────────────────────────────────── */
  const openFlow = (w = null) => setFlow((f) => ({ open: true, key: f.key + 1, window: w }));
  const closeFlow = () => setFlow((f) => ({ ...f, open: false }));
  const flowDone = (result) => {
    closeFlow();
    if (result.window) toast.success('Saved');
    else posted(result.windows);
    if (scope === 'active') load('active');
    else setScope('active');
  };

  const windows = data?.windows || [];
  const live = windows.filter((w) => w.status === 'LIVE');
  const upcoming = windows.filter((w) => w.status === 'SCHEDULED');
  const enabled = data?.enabled !== false;
  const noProducts = products !== null && products.length === 0;
  const today = manilaDay();

  // Coming up, by the day orders open ("Tomorrow", "Wed, Oct 15").
  const upcomingDays = [];
  for (const w of upcoming) {
    const day = manilaDay(ms(w.ordersOpenAt));
    const last = upcomingDays[upcomingDays.length - 1];
    if (last && last.day === day) last.windows.push(w);
    else upcomingDays.push({ day, windows: [w] });
  }

  const card = (w) => {
    const ended = scope === 'ended';
    const state = postStatus(w, ended);
    const busy = busyId === w.id;
    const img = firstImage(w.product?.images);
    const left = w.remaining ?? Math.max(0, w.quantity - w.soldCount);
    const isLive = w.status === 'LIVE';
    return (
      <article key={w.id} className={`stw-card is-${state.tone}`}>
        <div className="stw-card-top">
          <Thumb src={img ? resolveImg(img) : null} />
          <div className="stw-card-main">
            <span className={`stw-chip is-${state.tone}`}>{state.text}</span>
            <h3 className="stw-name">
              {w.product?.slug ? <Link to={`/product/${w.product.slug}`}>{w.product.name}</Link> : w.product?.name || 'Product'}
            </h3>
            <p className="stw-when">
              <Clock size={15} aria-hidden="true" /> {dayTitle(manilaDay(ms(w.ordersOpenAt)), today)} · {ordersSpan(w)}
            </p>
            <p className="stw-meta">
              <Truck size={14} aria-hidden="true" /> {kindOf(w.mode).title}
              {w.mode === 'MADE_TO_ORDER' && w.prepMinutes ? ` (${w.prepMinutes} min)` : ''} · {getLabel(w.fulfillment)}
            </p>
            {w.note && <p className="stw-note">{w.note}</p>}
          </div>
        </div>

        <div className="stw-count">
          <p>
            {ended
              ? <><strong>{w.soldCount}</strong> of {w.quantity} ordered</>
              : <><strong>{left}</strong> of {w.quantity} left</>}
          </p>
          {!ended && w.soldCount > 0 && <span className="stw-sold">{w.soldCount} ordered</span>}
          {!ended && isLive && <TimeLeft until={w.ordersCloseAt} prefix="Ends in" className="stw-left" />}
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
                disabled={busy || (isLive ? (w.remaining ?? 0) < 1 : w.quantity - w.soldCount <= 1)}
                onClick={() => changeQty(w, -1)}
              >
                <Minus size={16} weight="bold" />
              </button>
              <span aria-live="polite">{w.quantity}</span>
              <button type="button" aria-label="One more" disabled={busy} onClick={() => changeQty(w, 1)}>
                <Plus size={16} weight="bold" />
              </button>
            </div>
            <button type="button" className="stw-btn stw-btn--edit" disabled={busy} onClick={() => openFlow(w)}>
              <PencilSimple size={16} /> Edit
            </button>
            {isLive && (
              <button type="button" className="stw-btn stw-btn--ghost" disabled={busy} onClick={() => setExtend({ window: w, value: toInput(ms(w.ordersCloseAt) + 3600e3) })}>
                <CalendarPlus size={16} /> More time
              </button>
            )}
            <button type="button" className="stw-btn stw-btn--danger" disabled={busy} onClick={() => endNow(w)}>
              <Stop size={16} /> {isLive ? 'End' : 'Cancel'}
            </button>
          </div>
        )}
      </article>
    );
  };

  const repeatTimes = repeat ? `${clockLabel(repeat.window.ordersOpenAt)} – ${clockLabel(repeat.window.ordersCloseAt)}` : '';

  return (
    <div className="seller-dashboard stw">
      <div className="seller-container">
        <SellerPageHead
          title="Today's menu"
          subtitle="Post what you cooked or harvested. Buyers order until it ends or sells out."
          actions={!noProducts && enabled ? (
            <button type="button" className="btn-seller-primary stw-post" onClick={() => openFlow()} disabled={products === null}>
              <Plus size={18} weight="bold" /> Post an item
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
                text={scope === 'ended' ? 'Posts that ended show here, so you can post them again.' : 'Tap "Post an item". We will ask a few short questions.'}
                actions={scope === 'ended' || !enabled ? [] : [{ label: 'Post an item', onClick: () => openFlow(), icon: Plus }]}
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
                {upcomingDays.map((g) => (
                  <div key={g.day} className="stw-day">
                    <h3 className="stw-day-title">{dayTitle(g.day, today)} <small>{g.windows.length}</small></h3>
                    <div className="stw-list">{g.windows.map(card)}</div>
                  </div>
                ))}
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

      {/* Post an item / Edit post: one question at a time */}
      {flow.key > 0 && (
        <TodayPostFlow
          key={flow.key}
          open={flow.open}
          window={flow.window}
          products={products || []}
          storeMode={storeMode}
          onClose={closeFlow}
          onDone={flowDone}
        />
      )}

      {/* More time */}
      <PhoneSheet
        open={Boolean(extend)}
        title="More time to order"
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
            <button type="button" className="scm-btn" onClick={saveRepeat} disabled={busyId === repeat.window.id}>
              {repeat.dates.length > 1 ? `Post for ${repeat.dates.length} days` : 'Post'}
            </button>
          </>
        )}
      >
        {repeat && (
          <div className="stw-form">
            <p className="stw-hint">
              {repeat.window.product?.name}: orders {repeatTimes}, as last time, on each day you pick.
            </p>
            <DayCalendar
              value={repeat.dates}
              onToggle={(day) => setRepeat((r) => ({ ...r, dates: toggleDay(r.dates, day) }))}
              min={repeat.today}
              max={addDays(repeat.today, AHEAD_DAYS - 1)}
              today={repeat.today}
              label="Days to post again"
            />
            <p className="stw-picked" aria-live="polite">
              {repeat.dates.length ? <strong>{plural(repeat.dates.length, 'day')}</strong> : 'Tap the days to post it again.'}
            </p>
            <label className="scm-field stw-gap">
              How many per day
              <input type="number" inputMode="numeric" min="1" step="1" value={repeat.quantity} onChange={(e) => setRepeat((r) => ({ ...r, quantity: e.target.value }))} />
            </label>
          </div>
        )}
      </PhoneSheet>
    </div>
  );
}
