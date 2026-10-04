import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CaretLeft, ClockCounterClockwise, Eye, EyeSlash, MagnifyingGlass, SquaresFour, Trash, X,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import ImageSearchModal from '../components/layout/ImageSearchModal';
import CategoryIcon, { CategoryIconGradients } from '../components/CategoryIcon';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { loadRecent, saveRecent, clearRecent, removeRecentTerm } from '../lib/buyerSearch';
import { useCategories } from '../hooks/useReferenceData';
import useAppSettings from '../hooks/useAppSettings';
import './SearchStart.css';

const HIDE_POPULAR_KEY = 'emoorm.search.hide-popular';
const readHidden = () => {
  try { return localStorage.getItem(HIDE_POPULAR_KEY) === '1'; } catch { return false; }
};

/**
 * Phones: the search page the header's search bar opens (and the results
 * page's bar, to change the words). A search field with the camera and a
 * Search button; your search history; popular products (most ordered); and
 * categories with how many products each has. While typing: matching past
 * searches, products and categories.
 */
export default function SearchStart() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const [q, setQ] = useState(() => location.state?.q || '');
  const [recent, setRecent] = useState(loadRecent);
  const [popular, setPopular] = useState(null);
  const [popularHidden, setPopularHidden] = useState(readHidden);
  const [counts, setCounts] = useState({});
  // Products matching the words typed, with the words they were asked for.
  const [found, setFound] = useState({ term: '', list: [] });
  const [imageOpen, setImageOpen] = useState(false);
  const { categories } = useCategories();
  const { settings } = useAppSettings();
  const categoryIcons = settings.categoryStyle === 'ICON';
  const typed = q.trim();

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Popular: the products ordered most, as search words with their picture.
  useEffect(() => {
    let live = true;
    axios.get('/products', { params: { sortBy: 'orderCount', sortOrder: 'desc', pageSize: 10 } })
      .then((res) => { if (live) setPopular(res.data || []); })
      .catch(() => { if (live) setPopular([]); });
    return () => { live = false; };
  }, []);

  // How many products each category has (real numbers, not made-up discounts).
  useEffect(() => {
    if (!categories.length) return undefined;
    let live = true;
    Promise.all(categories.map((c) => axios.get('/products', { params: { categoryId: c.id, pageSize: 1 } })
      .then((res) => [c.id, res.pagination?.total ?? 0])
      .catch(() => [c.id, null])))
      .then((list) => { if (live) setCounts(Object.fromEntries(list)); });
    return () => { live = false; };
  }, [categories]);

  // While typing: products whose names match, asked for a moment after the last key.
  useEffect(() => {
    if (typed.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      axios.get('/products', { params: { search: typed, pageSize: 6 } })
        .then((res) => { if (live) setFound({ term: typed, list: res.data || [] }); })
        .catch(() => { if (live) setFound({ term: typed, list: [] }); });
    }, 220);
    return () => { live = false; clearTimeout(timer); };
  }, [typed]);

  const shownCategories = useMemo(() => {
    // Fullest categories first once their counts are in; empty ones are left out.
    const list = categories.filter((c) => counts[c.id] !== 0);
    if (Object.keys(counts).length) list.sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return list;
  }, [categories, counts]);

  const search = (term) => {
    const word = term.trim();
    if (!word) { inputRef.current?.focus(); return; }
    setRecent(saveRecent(word));
    navigate(`/search?q=${encodeURIComponent(word)}`);
  };
  const openCategory = (id) => navigate(`/search?category=${id}`);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const togglePopular = () => {
    const next = !popularHidden;
    setPopularHidden(next);
    try { localStorage.setItem(HIDE_POPULAR_KEY, next ? '1' : '0'); } catch { /* the choice just isn't remembered */ }
  };

  const low = typed.toLowerCase();
  const recentMatches = typed ? recent.filter((t) => t.toLowerCase().includes(low)).slice(0, 4) : [];
  const categoryMatches = typed ? categories.filter((c) => c.name.toLowerCase().includes(low)).slice(0, 3) : [];
  // The last answer stays while the next is on its way, if it still fits the words.
  const matches = typed.length >= 2 && found.term && low.startsWith(found.term.toLowerCase()) ? found.list : [];

  return (
    <Layout phoneBar={false} showFooter={false}>
      <div className="ss">
        <h1 className="sr-only">Search Emoorm</h1>
        <div className="ss-bar">
          <button type="button" className="ss-back" onClick={back} aria-label="Back">
            <CaretLeft size={24} />
          </button>
          <form className="ss-field" role="search" onSubmit={(e) => { e.preventDefault(); search(q); }}>
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
            />
            {q && (
              <button type="button" className="ss-clear" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear">
                <X size={14} weight="bold" />
              </button>
            )}
            <button type="button" className="ss-camera" onClick={() => setImageOpen(true)} aria-label="Search by image">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                <path d="M7 5L8 3H12L13 5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="submit" className="ss-go" aria-label="Search">
              <MagnifyingGlass size={18} />
            </button>
          </form>
        </div>

        {typed ? (
          <div className="ss-suggest">
            <button type="button" className="ss-sug-row" onClick={() => search(typed)}>
              <MagnifyingGlass size={18} className="ss-sug-icon" />
              <span className="ss-sug-text">Search for “<b>{typed}</b>”</span>
            </button>
            {recentMatches.map((term) => (
              <button type="button" key={`r-${term}`} className="ss-sug-row" onClick={() => search(term)}>
                <ClockCounterClockwise size={18} className="ss-sug-icon" />
                <span className="ss-sug-text">{term}</span>
              </button>
            ))}
            {categoryMatches.map((c) => (
              <button type="button" key={`c-${c.id}`} className="ss-sug-row" onClick={() => openCategory(c.id)}>
                <SquaresFour size={18} className="ss-sug-icon" />
                <span className="ss-sug-text">{c.name}<small>Category</small></span>
              </button>
            ))}
            {matches.map((p) => (
              <button type="button" key={p.id} className="ss-sug-row" onClick={() => search(p.name)}>
                <span className="ss-sug-thumb"><ProductImage src={p.images?.[0]} alt="" /></span>
                <span className="ss-sug-text">{p.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="ss-sec">
                <div className="ss-head">
                  <h2>Search History</h2>
                  <button type="button" className="ss-head-btn" onClick={() => setRecent(clearRecent())}>
                    Clear All <Trash size={18} />
                  </button>
                </div>
                <div className="ss-history">
                  {recent.map((term) => (
                    <span key={term} className="ss-chip">
                      <button type="button" onClick={() => search(term)}>{term}</button>
                      <button type="button" className="ss-chip-x" onClick={() => setRecent(removeRecentTerm(term))} aria-label={`Remove ${term}`}>
                        <X size={11} weight="bold" />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {popular?.length > 0 && (
              <section className="ss-sec">
                <div className="ss-head">
                  <h2>Popular Search</h2>
                  <button type="button" className="ss-head-btn" onClick={togglePopular}>
                    {popularHidden ? <>Show <EyeSlash size={19} /></> : <>Hide <Eye size={19} /></>}
                  </button>
                </div>
                {popularHidden ? (
                  <p className="ss-hidden-note">Popular searches are hidden.</p>
                ) : (
                  <div className="ss-popular">
                    {popular.map((p) => (
                      <button type="button" key={p.id} className="ss-pop" onClick={() => search(p.name)}>
                        <span className="ss-pop-img"><ProductImage src={p.images?.[0]} alt="" /></span>
                        <span className="ss-pop-name">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {shownCategories.length > 0 && (
              <section className="ss-sec ss-sec-cats">
                <div className="ss-head"><h2>Popular Categories</h2></div>
                {categoryIcons && <CategoryIconGradients />}
                <div className="ss-cats">
                  {shownCategories.map((c) => (
                    <button type="button" key={c.id} className="ss-cat" onClick={() => openCategory(c.id)}>
                      <span className="ss-cat-img">
                        {categoryIcons
                          ? <CategoryIcon category={c} size={40} />
                          : <img src={resolveImg(c.image) || `/categories/${c.slug}.png`} alt="" loading="lazy" />}
                      </span>
                      <span className="ss-cat-text">
                        <span className="ss-cat-name">{c.name}</span>
                        {counts[c.id] != null && (
                          <span className="ss-cat-count">{counts[c.id]} {counts[c.id] === 1 ? 'product' : 'products'}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <ImageSearchModal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        onFile={(file) => { setImageOpen(false); navigate('/search/image', { state: { file } }); }}
      />
    </Layout>
  );
}
