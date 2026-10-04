import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MagnifyingGlass, Truck, ShoppingBag, SlidersHorizontal, CaretDown, Check, X, MapPin, SquaresFour, ArrowsDownUp,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import TodayCard from '../components/today/TodayCard';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import useSeo from '../lib/seo';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useSheetPresence } from '../hooks/useSheetMotion';
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';
import { MODES, isOpen } from '../lib/availability';
import '../components/search/SearchFilterSheet.css';
import './AvailableToday.css';

const SORTS = [
  { key: 'ending', label: 'Ending soon' },
  { key: 'newest', label: 'Newest' },
  { key: 'ready', label: 'Ready soonest' },
  { key: 'price-low', label: 'Price: low to high' },
  { key: 'price-high', label: 'Price: high to low' },
];
const PAGE_SIZE = 24;

/**
 * Phones: one filter's choices in a bottom sheet, like the search results'.
 * A tap applies the choice and closes it.
 */
function ChoiceSheet({ title, options, value, onPick, onClose, open }) {
  const { mounted, closing } = useSheetPresence(open);
  const [shown, setShown] = useState({ title, options, value });
  if (open && (shown.title !== title || shown.value !== value || shown.options !== options)) setShown({ title, options, value });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div className={`sfs-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`} onClick={onClose} role="presentation">
      <div className="sfs ui-sheet-panel" role="dialog" aria-modal="true" aria-label={shown.title} onClick={(e) => e.stopPropagation()}>
        <div className="sfs-head">
          <h2>{shown.title}</h2>
          <button type="button" className="sfs-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="sfs-body">
          <div className="sfs-options">
            {shown.options.map((o) => (
              <button
                key={o.key || 'none'}
                type="button"
                className={`sfs-option${shown.value === o.key ? ' is-on' : ''}`}
                onClick={() => { onPick(o.key); onClose(); }}
              >
                <span>{o.label}</span>
                {shown.value === o.key && <Check size={18} weight="bold" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Available Today: fresh food and produce local shops sell for a limited
 * time. Near the buyer's town by default; filters for the kind (ready now,
 * made to order, pre-order), the town or delivery to the buyer, category,
 * search and sort, all kept in the address so a view can be shared.
 * Computers: filters in a sidebar beside the grid, like Products. Phones:
 * kind chips and filter chips that open bottom sheets.
 */
export default function AvailableToday() {
  useSeo({ title: 'Available Today', description: 'Fresh food and produce from local shops in Oriental Mindoro, for a limited time.' });
  const isPhone = usePhoneLayout();
  const user = useAuthStore((s) => s.user);
  const myTown = user?.municipalityId || '';
  const myBarangay = user?.barangay || '';
  const { municipalities } = useMunicipalities();
  const { categories } = useCategories();
  const [params, setParams] = useSearchParams();

  // "near" (default when signed in): shops in my town or delivering there.
  const town = params.get('town') ?? (myTown ? 'near' : '');
  const mode = params.get('mode') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'ending';
  const q = params.get('q') || '';
  const delivers = params.get('delivers') === '1' && Boolean(myTown);
  const [draft, setDraft] = useState(q);
  const [sheet, setSheet] = useState(null);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };

  // Where: near me, delivers to me, all towns, or one town.
  const where = delivers ? 'delivers' : town === 'near' ? 'near' : (!town || town === 'all') ? 'all' : town;
  const setWhere = (key) => {
    if (key === 'delivers') set({ delivers: '1', town: null });
    else if (key === 'near') set({ delivers: null, town: null });
    else if (key === 'all') set({ delivers: null, town: myTown ? 'all' : null });
    else set({ delivers: null, town: key });
  };
  const townName = municipalities.find((m) => m.id === myTown)?.name;
  const whereOptions = useMemo(() => [
    ...(myTown ? [
      { key: 'near', label: `Near me${townName ? ` (${townName})` : ''}` },
      { key: 'delivers', label: 'Delivers to me' },
    ] : []),
    { key: 'all', label: 'All towns' },
    ...municipalities.map((m) => ({ key: m.id, label: m.name })),
  ], [myTown, townName, municipalities]);
  const categoryOptions = useMemo(() => [{ key: '', label: 'All categories' }, ...categories.map((c) => ({ key: c.id, label: c.name }))], [categories]);
  const labelOf = (options, key, fallback) => options.find((o) => o.key === key)?.label || fallback;

  const query = useMemo(() => {
    const out = { sort, pageSize: PAGE_SIZE };
    if (mode) out.mode = mode;
    if (category) out.categoryId = category;
    if (q) out.search = q;
    if (delivers) {
      out.deliversTo = myTown;
      if (myBarangay) out.barangay = myBarangay;
    } else if (town === 'near' && myTown) {
      out.near = myTown;
    } else if (town && town !== 'near' && town !== 'all') {
      out.municipalityId = town;
    }
    return out;
  }, [sort, mode, category, q, delivers, town, myTown, myBarangay]);

  const [state, setState] = useState({ items: [], total: 0, page: 1, loading: true, enabled: true });
  const request = useRef(0);
  const load = useCallback(async (page) => {
    const id = ++request.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await axios.get('/today', { params: { ...query, page } });
      if (id !== request.current) return;
      const data = res.data || {};
      setState((s) => ({
        items: page === 1 ? data.items || [] : [...s.items, ...(data.items || [])],
        total: data.total || 0,
        page,
        loading: false,
        enabled: data.enabled !== false,
      }));
    } catch {
      if (id === request.current) setState((s) => ({ ...s, loading: false }));
    }
  }, [query]);
  useEffect(() => { load(1); }, [load]);

  const items = state.items.filter((w) => isOpen(w));
  const filtered = Boolean(q || mode || category || (town && town !== 'near') || delivers);
  const clearAll = () => { setDraft(''); set({ q: null, mode: null, category: null, sort: null, delivers: null, town: null }); };

  const searchForm = (
    <form className="avt-search" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() }); }}>
      <MagnifyingGlass size={18} aria-hidden="true" />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search today's food and produce"
        aria-label="Search Available Today"
        enterKeyHint="search"
      />
      {draft && (
        <button type="button" className="avt-search-clear" aria-label="Clear search" onClick={() => { setDraft(''); set({ q: null }); }}>
          <X size={14} weight="bold" />
        </button>
      )}
    </form>
  );

  const modeChips = (
    <div className="avt-modes" role="tablist" aria-label="Kind">
      {[{ key: '', label: 'All' }, ...MODES].map((m) => (
        <button
          key={m.key || 'all'}
          type="button"
          role="tab"
          aria-selected={mode === m.key}
          className={`avt-chip${mode === m.key ? ' is-on' : ''}`}
          onClick={() => set({ mode: m.key })}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  const radio = (name, key, label, checked, onChange) => (
    <label key={key || 'none'} className={`avt-option${checked ? ' is-on' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );

  const results = state.loading && state.page === 1 ? (
    <div className="avt-grid" aria-busy="true">
      {Array.from({ length: isPhone ? 4 : 10 }, (_, i) => <Skeleton key={i} height={isPhone ? 250 : 290} radius={isPhone ? 12 : 2} />)}
    </div>
  ) : items.length === 0 ? (
    <EmptyState
      className="avt-empty"
      art="calendar"
      title={state.enabled ? 'Nothing available right now' : 'Available Today is off for now'}
      text={state.enabled
        ? (filtered ? 'Try other filters, or check back later today.' : 'Shops post fresh food and produce here during the day. Check back soon.')
        : 'Check back later.'}
      actions={filtered && state.enabled
        ? [{ label: 'Clear filters', onClick: clearAll, icon: X }]
        : [{ label: 'Browse products', to: '/products', icon: ShoppingBag }]}
    />
  ) : (
    <>
      <div className="avt-grid">
        {items.map((item) => <TodayCard key={item.id} item={item} result={isPhone} />)}
      </div>
      {state.items.length < state.total && (
        <button type="button" className="avt-more" onClick={() => load(state.page + 1)} disabled={state.loading}>
          {state.loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );

  /* ── Phones ─────────────────────────────────────────────────── */
  if (isPhone) {
    return (
      <Layout>
        <div className="avt is-phone">
          <h1 className="avt-title title-medium">Available Today</h1>
          <div className="avt-m-top">
            {searchForm}
            {modeChips}
            <div className="avt-m-filters">
              <button type="button" className={`avt-m-fchip${where !== (myTown ? 'near' : 'all') ? ' is-active' : ''}`} onClick={() => setSheet('where')}>
                <MapPin size={15} /> <span>{labelOf(whereOptions, where, 'All towns')}</span> <CaretDown size={12} />
              </button>
              <button type="button" className={`avt-m-fchip${category ? ' is-active' : ''}`} onClick={() => setSheet('category')}>
                <SquaresFour size={15} /> <span>{category ? labelOf(categoryOptions, category, 'Category') : 'Category'}</span> <CaretDown size={12} />
              </button>
              <button type="button" className={`avt-m-fchip${sort !== 'ending' ? ' is-active' : ''}`} onClick={() => setSheet('sort')}>
                <ArrowsDownUp size={15} /> <span>{labelOf(SORTS, sort, 'Sort')}</span> <CaretDown size={12} />
              </button>
            </div>
          </div>
          <div className="avt-m-body">
            {!state.loading && items.length > 0 && (
              <p className="avt-count">
                <strong>{state.total}</strong> available{delivers ? ' · delivered to your address' : ''}
                {filtered && <button type="button" className="avt-clear-link" onClick={clearAll}>Clear</button>}
              </p>
            )}
            {results}
          </div>
        </div>
        <ChoiceSheet
          open={sheet === 'where'}
          title="Where"
          options={whereOptions}
          value={where}
          onPick={setWhere}
          onClose={() => setSheet(null)}
        />
        <ChoiceSheet
          open={sheet === 'category'}
          title="Category"
          options={categoryOptions}
          value={category}
          onPick={(key) => set({ category: key })}
          onClose={() => setSheet(null)}
        />
        <ChoiceSheet
          open={sheet === 'sort'}
          title="Sort by"
          options={SORTS}
          value={sort}
          onPick={(key) => set({ sort: key === 'ending' ? null : key })}
          onClose={() => setSheet(null)}
        />
      </Layout>
    );
  }

  /* ── Computers ──────────────────────────────────────────────── */
  return (
    <Layout>
      <div className="avt">
        <div className="avt-container">
          <nav className="avt-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Available Today</span>
          </nav>

          <header className="avt-head">
            <div>
              <h1 className="avt-title title-medium">Available Today</h1>
              <p className="avt-sub">Fresh from local kitchens and farms, for a limited time. Order before it&apos;s gone.</p>
            </div>
            {searchForm}
          </header>

          <div className="avt-layout">
            <aside className="avt-sidebar" aria-label="Filters">
              <div className="avt-side-head">
                <h2><SlidersHorizontal size={18} /> Filters</h2>
                {filtered && <button type="button" className="avt-clear-link" onClick={clearAll}>Clear all</button>}
              </div>

              <section className="avt-side-sec">
                <h3>Kind</h3>
                {[{ key: '', label: 'All kinds' }, ...MODES].map((m) => radio('avt-mode', m.key, m.label, mode === m.key, () => set({ mode: m.key })))}
              </section>

              <section className="avt-side-sec">
                <h3>Where</h3>
                {myTown && radio('avt-where', 'near', `Near me${townName ? ` (${townName})` : ''}`, where === 'near', () => setWhere('near'))}
                {myTown && radio('avt-where', 'delivers', 'Delivers to me', where === 'delivers', () => setWhere('delivers'))}
                {radio('avt-where', 'all', 'All towns', where === 'all', () => setWhere('all'))}
                <select
                  className="avt-side-select"
                  value={['near', 'delivers', 'all'].includes(where) ? '' : where}
                  onChange={(e) => setWhere(e.target.value || 'all')}
                  aria-label="One town"
                >
                  <option value="">Choose a town…</option>
                  {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </section>

              <section className="avt-side-sec">
                <h3>Category</h3>
                {categoryOptions.map((c) => radio('avt-category', c.key, c.label, category === c.key, () => set({ category: c.key })))}
              </section>
            </aside>

            <div className="avt-main">
              <div className="avt-toolbar">
                <p className="avt-count">
                  {state.loading && state.page === 1
                    ? 'Loading…'
                    : <><strong>{items.length ? state.total : 0}</strong> available</>}
                  {delivers && <span className="avt-note"><Truck size={15} weight="fill" /> Shops that deliver to your address</span>}
                </p>
                <label className="avt-sort">
                  <span>Sort by</span>
                  <select value={sort} onChange={(e) => set({ sort: e.target.value === 'ending' ? '' : e.target.value })}>
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              {results}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
