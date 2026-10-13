import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Minus, Info, ForkKnife, DotsThree, MagnifyingGlass,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import { resolveImg, firstImage } from '../lib/media';
import { confirmAction } from '../lib/confirm';
import {
  isOpen, momentLabel, clockLabel, whenLabel,
} from '../lib/availability';
import { saleInfo } from '../lib/variantPricing';
import { BusyLabel } from '../components/ui/Spinner';
import { dayTitle, manilaDay } from '../lib/manilaDays';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSheet from '../components/seller/PhoneSheet';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
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
const ADD_PICKS = [5, 10, 20];

/** The product photo, or a plain tile when there is none or it fails to load. */
function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="stw-thumb stw-thumb--empty" aria-hidden="true"><ForkKnife size={22} /></span>;
  return <img className="stw-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/**
 * A post's state in plain words: "Taking orders", "Sold out",
 * "Not open yet", "Ended" or "Cancelled", with its tone.
 */
const postStatus = (w, ended = false, now = Date.now()) => {
  if (ended || !['LIVE', 'SCHEDULED'].includes(w.status)) {
    return { tone: 'ended', text: w.status === 'CANCELLED' ? 'Cancelled' : 'Ended' };
  }
  // Coming up is grouped by day and the card shows its times: the state alone.
  if (w.status === 'SCHEDULED' && ms(w.ordersOpenAt) > now) return { tone: 'soon', text: 'Not open yet' };
  if (!isOpen(w, now)) return { tone: 'ended', text: 'Ended' };
  if ((w.remaining ?? 1) <= 0) return { tone: 'out', text: 'Sold out' };
  return { tone: 'live', text: 'Taking orders' };
};

/** "Orders 10:00 AM – 2:00 PM" (with "(next day)" when it closes the day after). */
const ordersSpan = (w) => {
  const next = manilaDay(ms(w.ordersCloseAt)) !== manilaDay(ms(w.ordersOpenAt)) ? ' (next day)' : '';
  return `Orders ${clockLabel(w.ordersOpenAt)} – ${clockLabel(w.ordersCloseAt)}${next}`;
};

/** ⋯ on a card: the actions that are not on its two buttons. */
function MoreMenu({ items, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="stw-more" ref={ref}>
      <button type="button" className="stw-btn stw-btn--icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <DotsThree size={22} weight="bold" />
      </button>
      {open && (
        <ul className="stw-menu" role="menu">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button type="button" role="menuitem" className={it.danger ? 'is-danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A menu item's state in plain words: "Taking orders until 2:00 PM" (green),
 * "Next: Tomorrow, 10:00 AM" or "Not taking orders yet" (grey).
 */
const menuStatus = (item, now = Date.now()) => {
  const w = item.window;
  if (w && isOpen(w, now)) {
    if ((w.remaining ?? 1) <= 0) return { tone: 'out', text: 'Sold out' };
    return { tone: 'live', text: `Taking orders until ${momentLabel(w.ordersCloseAt, now)}` };
  }
  if (w && w.status === 'SCHEDULED' && ms(w.ordersCloseAt) > now) return { tone: 'soon', text: `Next: ${whenLabel(w.ordersOpenAt, now)}` };
  return { tone: 'idle', text: 'Not taking orders yet' };
};

const APPROVAL = { PENDING: 'Waiting for approval', HIDDEN: 'Hidden from buyers' };

/**
 * "Add from My products": the shop's products that can go on the menu,
 * searchable; tapping one asks first, in the same sheet.
 */
function AddFromProducts({
  open, choices, onClose, onAdd, busy,
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (choices || []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [choices, query]);

  return (
    <PhoneSheet
      open={open}
      title={picked ? 'Add to your menu?' : 'Add from My products'}
      className="stw-sheet stw-pick-sheet"
      onClose={onClose}
      footer={picked && (
        <>
          <button type="button" className="scm-btn scm-btn--ghost" onClick={() => setPicked(null)} disabled={busy}>Back</button>
          <button type="button" className="scm-btn" onClick={() => onAdd(picked)} disabled={busy}>
            {busy ? <BusyLabel>Adding…</BusyLabel> : 'Add to menu'}
          </button>
        </>
      )}
    >
      {picked ? (
        <div className="stw-confirm">
          <div className="stw-pick is-static">
            <Thumb src={firstImage(picked.images) ? resolveImg(firstImage(picked.images)) : null} />
            <span className="stw-pick-text">
              <strong>{picked.name}</strong>
              <span>{peso(saleInfo(picked).price)}</span>
            </span>
          </div>
          <p className="stw-hint">
            Add {picked.name} to your menu? It will show as &lsquo;Not taking orders yet&rsquo; until you post it.
          </p>
        </div>
      ) : (
        <div className="stw-picker">
          <label className="stw-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your products"
              aria-label="Search your products"
              enterKeyHint="search"
            />
          </label>
          {choices === null ? (
            <div className="stw-pick-list" aria-busy="true">
              {[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={12} />)}
            </div>
          ) : list.length === 0 ? (
            <p className="stw-hint stw-pick-empty">
              {query ? `No products match “${query}”.` : 'No products to add. Packages and paluto keep their own ordering.'}
            </p>
          ) : (
            <ul className="stw-pick-list">
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" className="stw-pick" disabled={Boolean(p.note)} onClick={() => setPicked(p)}>
                    <Thumb src={firstImage(p.images) ? resolveImg(firstImage(p.images)) : null} />
                    <span className="stw-pick-text">
                      <strong>{p.name}</strong>
                      <span>{p.note || peso(saleInfo(p).price)}</span>
                    </span>
                    {!p.note && <Plus size={18} weight="bold" className="stw-pick-plus" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PhoneSheet>
  );
}

/**
 * Today's menu, on three tabs. Menu: the shop's Available Today items, posted
 * or not, with Post on each and "Add from My products" (an item on the menu
 * shows to buyers as "Not taking orders yet" until it is posted). Now and
 * coming up: Taking orders now and Coming up (by day). Ended. It opens on
 * Now and coming up when something is posted, else on Menu (?tab=menu|ended
 * picks one). "Post an item" and Edit open the one-page form
 * (SellerTodayPost.jsx). On a post: Edit and Add more (or Cancel before it
 * opens); ⋯ holds More time and Stop. An ended post can be posted again.
 */
export default function SellerToday() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const asked = ['menu', 'active', 'ended'].includes(params.get('tab')) ? params.get('tab') : null;
  const [scope, setScope] = useState(asked || 'active');
  // Until the first list is in: then Now and coming up, or Menu when nothing is posted.
  const [decided, setDecided] = useState(Boolean(asked));
  const [data, setData] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [extend, setExtend] = useState(null);
  const [adding, setAdding] = useState(null);
  const [picking, setPicking] = useState(false);
  const [addingId, setAddingId] = useState(null);
  // A fresh picker (no search, nothing picked) each time it opens.
  const [pickRound, setPickRound] = useState(0);
  const first = useRef(!asked);

  const load = useCallback(async (which) => {
    let windows = [];
    try {
      const res = await axios.get('/today/mine', { params: { scope: which === 'ended' ? 'ended' : undefined } });
      setData(res.data || { enabled: true, windows: [] });
      windows = res.data?.windows || [];
    } catch (err) {
      toast.error(err.message || "Could not load Today's menu");
      setData({ enabled: true, windows: [] });
    }
    if (first.current) {
      first.current = false;
      if (!windows.length) setScope('menu');
      setDecided(true);
    }
  }, []);
  useEffect(() => {
    if (scope === 'menu') return;
    setData(null);
    load(scope);
  }, [scope, load]);
  const loadMenu = useCallback(async () => {
    try {
      const res = await axios.get('/today/menu');
      setMenu(res.data || { enabled: true, items: [], choices: [] });
    } catch (err) {
      toast.error(err.message || 'Could not load your menu');
      setMenu((m) => m || { enabled: true, items: [], choices: [] });
    }
  }, []);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  // Back on the menu tab: fresh states (a post may have opened or ended).
  const pickTab = (key) => {
    if (key === scope) return;
    setScope(key);
    if (key === 'menu') loadMenu();
  };

  const openPicker = () => { setPickRound((r) => r + 1); setPicking(true); };

  const addToMenu = async (product) => {
    setAddingId(product.id);
    try {
      await axios.post('/today/menu', { productId: product.id });
      toast.success(`${product.name} is on your menu. Post it when you have it.`);
      setPicking(false);
      await loadMenu();
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
    } finally {
      setAddingId(null);
    }
  };

  const removeFromMenu = async (item) => {
    const ok = await confirmAction({
      title: `Take ${item.name} off your menu?`,
      message: 'It becomes a regular product with 0 in stock. Set its stock in My products to sell it there.',
      confirmLabel: 'Remove from menu',
      danger: true,
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await axios.delete(`/today/menu/${item.id}`);
      toast.success(`${item.name} is off your menu. Set its stock in My products.`);
      await loadMenu();
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  // Live posts tick over on their own: reload when the next one ends or opens.
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

  /** Add more: the total to sell, never below what is already taken. */
  const openAdding = (w) => {
    const live = w.status === 'LIVE';
    const taken = live ? w.quantity - (w.remaining ?? 0) : w.soldCount;
    setAdding({ window: w, total: w.quantity, min: Math.max(1, taken) });
  };
  const saveAdding = async () => {
    const w = adding.window;
    const total = Math.max(adding.min, adding.total);
    const delta = total - w.quantity;
    if (!delta) { setAdding(null); return; }
    const res = await act(w, () => axios.post(`/today/${w.id}/quantity`, { delta }), `Now ${total} to sell`);
    if (res) setAdding(null);
  };

  const goPost = (path) => navigate(path, { state: { fromList: true } });

  const windows = data?.windows || [];
  const live = windows.filter((w) => w.status === 'LIVE');
  const upcoming = windows.filter((w) => w.status === 'SCHEDULED');
  const enabled = data?.enabled !== false && menu?.enabled !== false;
  const items = menu?.items || [];
  const noItems = menu !== null && items.length === 0;
  const today = manilaDay();
  const ended = scope === 'ended';
  const onMenu = scope === 'menu';
  const empty = data !== null && windows.length === 0;

  // Coming up, by the day orders open ("Tomorrow", "Wed, Oct 15").
  const upcomingDays = [];
  for (const w of upcoming) {
    const day = manilaDay(ms(w.ordersOpenAt));
    const last = upcomingDays[upcomingDays.length - 1];
    if (last && last.day === day) last.windows.push(w);
    else upcomingDays.push({ day, windows: [w] });
  }

  const card = (w) => {
    const state = postStatus(w, ended);
    const busy = busyId === w.id;
    const img = firstImage(w.product?.images);
    const left = w.remaining ?? Math.max(0, w.quantity - w.soldCount);
    const isLive = w.status === 'LIVE';
    const name = w.product?.name || 'Item';
    return (
      <article key={w.id} className={`stw-card is-${state.tone}`}>
        <div className="stw-card-top">
          <Thumb src={img ? resolveImg(img) : null} />
          <div className="stw-card-main">
            <h3 className="stw-name">{name}</h3>
            <p className={`stw-status is-${state.tone}`}>
              {ended ? `${dayTitle(manilaDay(ms(w.ordersOpenAt)), today)}${w.status === 'CANCELLED' ? ' · Cancelled' : ''}` : state.text}
            </p>
            <p className="stw-line">
              {ordersSpan(w)}
            </p>
            <p className="stw-line">
              {ended
                ? <><strong>{w.soldCount}</strong> of {w.quantity} ordered</>
                : <><strong>{left}</strong> of {w.quantity} left</>}
            </p>
          </div>
        </div>

        <div className="stw-actions">
          {ended ? (
            <button type="button" className="stw-btn" disabled={busy || !enabled} onClick={() => goPost(`/seller/today/new?again=${w.id}`)}>
              Post again
            </button>
          ) : (
            <>
              <button type="button" className="stw-btn" disabled={busy} onClick={() => goPost(`/seller/today/${w.id}/edit`)}>
                Edit
              </button>
              {isLive ? (
                <>
                  <button type="button" className="stw-btn stw-btn--main" disabled={busy} onClick={() => openAdding(w)}>
                    <Plus size={16} weight="bold" /> Add more
                  </button>
                  <MoreMenu
                    label={`More for ${name}`}
                    items={[
                      { label: 'More time', onClick: () => setExtend({ window: w, value: toInput(ms(w.ordersCloseAt) + 3600e3) }) },
                      { label: 'Stop taking orders', danger: true, onClick: () => endNow(w) },
                    ]}
                  />
                </>
              ) : (
                <button type="button" className="stw-btn stw-btn--danger" disabled={busy} onClick={() => endNow(w)}>
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      </article>
    );
  };

  /** One item on the menu: photo, name, price, one status; Post, and ⋯ for the rest. */
  const menuRow = (item) => {
    const state = menuStatus(item);
    const busy = busyId === item.id;
    const img = firstImage(item.images);
    return (
      <article key={item.id} className={`stw-item is-${state.tone}`}>
        <Thumb src={img ? resolveImg(img) : null} />
        <div className="stw-item-main">
          <h3 className="stw-name">{item.name}</h3>
          <p className="stw-price">{peso(saleInfo(item).price)}</p>
          <p className={`stw-item-status is-${state.tone}`}>{state.text}</p>
          {APPROVAL[item.status] && <p className="stw-item-note">{APPROVAL[item.status]}</p>}
        </div>
        <div className="stw-item-actions">
          <button
            type="button"
            className="stw-btn stw-btn--main stw-btn--small"
            disabled={busy || !enabled}
            onClick={() => goPost(`/seller/today/new?product=${item.id}`)}
          >
            Post
          </button>
          <MoreMenu
            label={`More for ${item.name}`}
            items={[
              { label: 'Edit item', onClick: () => navigate(`/seller/products?edit=${item.id}`, { state: { fromList: true } }) },
              { label: 'Remove from menu', danger: true, onClick: () => removeFromMenu(item) },
            ]}
          />
        </div>
      </article>
    );
  };

  const addButton = (
    <button type="button" className="stw-add" onClick={openPicker} disabled={!enabled}>
      <Plus size={16} weight="bold" /> Add from My products
    </button>
  );
  const createLink = (
    <Link to="/seller/products/new?type=today" state={{ fromList: true }} className="stw-create">
      Create a new menu item
    </Link>
  );

  const showPost = enabled && items.length > 0;
  const tabs = [['menu', 'Menu'], ['active', 'Now and coming up'], ['ended', 'Ended']];

  return (
    <div className="seller-dashboard stw">
      <div className="seller-container">
        <SellerPageHead title="Today's menu" />

        {!enabled && (
          <p className="stw-banner"><Info size={16} /> Available Today is turned off for now. Your posts are kept; buyers can&apos;t order them.</p>
        )}

        <div className="stw-top">
          <div className="stw-tabs" role="tablist" aria-label="Show">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={decided && scope === key} className={decided && scope === key ? 'is-on' : ''} onClick={() => pickTab(key)}>
                {label}
              </button>
            ))}
          </div>
          {showPost && (
            <button type="button" className="stw-post" onClick={() => goPost('/seller/today/new')}>
              <span className="stw-post-icon" aria-hidden="true"><Plus size={16} weight="bold" /></span>
              Post an item
            </button>
          )}
        </div>

        {onMenu ? (
          menu === null ? (
            <div className="stw-list" aria-busy="true">
              {[0, 1, 2].map((i) => <Skeleton key={i} height={96} radius={16} />)}
            </div>
          ) : noItems ? (
            <div className="stw-empty">
              <EmptyState
                className="ui-empty--inset"
                art="calendar"
                title="No items on your menu yet"
                text="Add food you sell. Buyers see it as 'Not taking orders yet' until you post it."
                actions={enabled ? [{ label: 'Add from My products', onClick: openPicker, icon: Plus }] : []}
              />
              <p className="stw-empty-link">{createLink}</p>
            </div>
          ) : (
            <>
              <div className="stw-menu-bar">
                {addButton}
                {createLink}
              </div>
              <div className="stw-list stw-list--menu">{items.map(menuRow)}</div>
            </>
          )
        ) : !decided || data === null ? (
          <div className="stw-list" aria-busy="true">
            {[0, 1].map((i) => <Skeleton key={i} height={150} radius={16} />)}
          </div>
        ) : empty ? (
          <div className="stw-empty">
            {noItems ? (
              <EmptyState
                className="ui-empty--inset"
                art="calendar"
                title="Nothing to post yet"
                text="Add items to your menu first, then post them."
                actions={[{ label: 'Go to Menu', onClick: () => pickTab('menu'), icon: Plus }]}
              />
            ) : (
              <EmptyState
                className="ui-empty--inset"
                art="calendar"
                title={ended ? 'Nothing ended yet' : 'Nothing posted'}
                text={ended ? 'Posts that ended show here, so you can post them again.' : 'Post what you have today.'}
                actions={ended || !enabled ? [] : [{ label: 'Post an item', onClick: () => goPost('/seller/today/new'), icon: Plus }]}
              />
            )}
          </div>
        ) : ended ? (
          <div className="stw-list">{windows.map(card)}</div>
        ) : (
          <>
            {live.length > 0 && (
              <section className="stw-group">
                <h2 className="stw-group-title">Taking orders now</h2>
                <div className="stw-list">{live.map(card)}</div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section className="stw-group">
                <h2 className="stw-group-title">Coming up</h2>
                {upcomingDays.map((g) => (
                  <div key={g.day} className="stw-day">
                    <h3 className="stw-day-title">{dayTitle(g.day, today)}</h3>
                    <div className="stw-list">{g.windows.map(card)}</div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {!onMenu && decided && !empty && !ended && data !== null && (
          <p className="stw-foot">
            New orders show in <Link to="/seller/orders">My orders</Link>. Confirm them quickly.
          </p>
        )}
      </div>

      <AddFromProducts
        key={pickRound}
        open={picking}
        choices={menu ? menu.choices || [] : null}
        busy={Boolean(addingId)}
        onClose={() => setPicking(false)}
        onAdd={addToMenu}
      />

      {/* Add more */}
      <PhoneSheet
        open={Boolean(adding)}
        title="How many to sell"
        className="stw-sheet"
        onClose={() => setAdding(null)}
        footer={adding && (
          <>
            <button type="button" className="scm-btn scm-btn--ghost" onClick={() => setAdding(null)}>Cancel</button>
            <button type="button" className="scm-btn" onClick={saveAdding} disabled={busyId === adding.window.id}>Save</button>
          </>
        )}
      >
        {adding && (
          <div className="stw-form">
            <p className="stw-hint">
              {adding.window.product?.name}: {adding.window.remaining ?? adding.window.quantity} left now.
            </p>
            <div className="stw-stepper" role="group" aria-label="How many in all">
              <button type="button" aria-label="One less" disabled={adding.total <= adding.min} onClick={() => setAdding((a) => ({ ...a, total: Math.max(a.min, a.total - 1) }))}>
                <Minus size={22} weight="bold" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={adding.min}
                value={adding.total}
                aria-label="How many in all"
                onChange={(e) => setAdding((a) => ({ ...a, total: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 }))}
                onBlur={() => setAdding((a) => ({ ...a, total: Math.max(a.min, a.total) }))}
              />
              <button type="button" aria-label="One more" onClick={() => setAdding((a) => ({ ...a, total: a.total + 1 }))}>
                <Plus size={22} weight="bold" />
              </button>
            </div>
            <div className="stw-adds" role="group" aria-label="Add">
              {ADD_PICKS.map((n) => (
                <button key={n} type="button" onClick={() => setAdding((a) => ({ ...a, total: a.total + n }))}>+{n}</button>
              ))}
            </div>
          </div>
        )}
      </PhoneSheet>

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
    </div>
  );
}
