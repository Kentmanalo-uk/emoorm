import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  MagnifyingGlass as Search, Storefront as Store, MapPin, Package, CaretLeft as ChevronLeft, CaretRight as ChevronRight, X,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useMunicipalities } from '../hooks/useReferenceData';
import './Stores.css';
import { StoreCardsSkeleton } from '../components/ui/PageSkeletons';

export default function Stores() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPhone = usePhoneLayout();
  const { municipalities } = useMunicipalities();
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const searchQuery = searchParams.get('q') || '';
  const [inputValue, setInputValue] = useState(searchQuery);
  const municipalityId = searchParams.get('municipalityId') || '';
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const fetchStores = async () => {
    setIsLoading(true);
    try {
      const params = { page: pagination.page, pageSize: pagination.pageSize };
      // The API filters on `search`; the page keeps `q` in its own URL.
      if (searchQuery) params.search = searchQuery;
      if (municipalityId) params.municipalityId = municipalityId;

      const response = await axios.get('/stores', { params });
      setStores(response.data || []);
      if (response.pagination) {
        setPagination((prev) => ({ ...prev, ...response.pagination }));
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, pagination.page, municipalityId]);

  // Changes the URL's q / municipalityId, keeping the other, from page 1.
  // Built from the live URL, not this render's copy (React Router's updater
  // gets the same stale copy): the type-to-search timer can fire after
  // another change and must not undo it.
  const updateParams = (changes) => {
    const next = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value); else next.delete(key);
    });
    if (next.toString() === new URLSearchParams(window.location.search).toString()) return;
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSearchParams(next, { replace: true });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    updateParams({ q: inputValue.trim() });
  };

  // Phones search as you type, after a short pause.
  useEffect(() => {
    if (!isPhone) return undefined;
    const q = inputValue.trim();
    if (q === searchQuery) return undefined;
    const t = setTimeout(() => updateParams({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, isPhone]);

  const clearSearch = () => {
    setInputValue('');
    updateParams({ q: '' });
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const townName = municipalities.find((m) => m.id === municipalityId)?.name;

  return (
    <Layout phoneBar={false}>
      <div className={`stores-page${isPhone ? ' is-phone' : ''}`}>
        {isPhone && (
          <div className="stores-m-bar">
            <button type="button" className="stores-m-back" onClick={goBack} aria-label="Back">
              <ChevronLeft size={22} weight="bold" />
            </button>
            <form className="stores-m-field" role="search" onSubmit={handleSearch}>
              <Search size={18} className="stores-m-field-icon" />
              <input
                type="search"
                enterKeyHint="search"
                placeholder="Search stores"
                aria-label="Search stores"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
              {inputValue && (
                <button type="button" className="stores-m-clear" onClick={clearSearch} aria-label="Clear search">
                  <X size={13} weight="bold" />
                </button>
              )}
            </form>
          </div>
        )}

        <div className="stores-container">

          {/* Breadcrumbs */}
          <div className="stores-breadcrumbs">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>Stores</span>
          </div>

          {/* Page header */}
          <div className="stores-hero">
            <div>
              <h1 className="stores-title">{isPhone ? 'Stores' : 'Browse Stores'}</h1>
              <p className="stores-subtitle">
                Discover local businesses from Oriental Mindoro
              </p>
            </div>

            <form className="stores-search" onSubmit={handleSearch}>
              <div className="stores-search-inner">
                <Search size={16} className="stores-search-icon" />
                <input
                  type="text"
                  placeholder="Search stores…"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>
              <button type="submit">Search</button>
            </form>
          </div>

          {/* Phones: filter by town */}
          {isPhone && municipalities.length > 0 && (
            <div className="stores-m-towns" role="toolbar" aria-label="Filter by town">
              <button
                type="button"
                className={`stores-m-chip${!municipalityId ? ' is-active' : ''}`}
                onClick={() => updateParams({ municipalityId: '' })}
              >
                All towns
              </button>
              {municipalities.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`stores-m-chip${municipalityId === m.id ? ' is-active' : ''}`}
                  onClick={() => updateParams({ municipalityId: m.id })}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {/* Results count */}
          {!isLoading && (
            <p className="stores-count">
              {pagination.total > 0
                ? <>
                    {isPhone ? <strong>{pagination.total}</strong> : pagination.total}
                    {` store${pagination.total !== 1 ? 's' : ''}`}
                    {isPhone ? (townName ? ` in ${townName}` : '') : ' found'}
                    {isPhone && searchQuery ? ` for “${searchQuery}”` : ''}
                  </>
                : searchQuery
                  ? `No stores match "${searchQuery}"`
                  : 'No stores yet'}
            </p>
          )}

          {/* Store grid */}
          {isLoading ? (
            <StoreCardsSkeleton count={6} />
          ) : stores.length === 0 ? (
            isPhone ? (
              <div className="stores-m-empty">
                <span className="stores-m-empty-icon"><Store size={30} weight="fill" /></span>
                <h2>
                  {searchQuery ? `No stores match “${searchQuery}”` : townName ? `No stores in ${townName} yet` : 'No stores yet'}
                </h2>
                <p>{searchQuery ? 'Check the spelling or try another name.' : 'Try another town.'}</p>
                {(searchQuery || municipalityId) && (
                  <button
                    type="button"
                    className="stores-m-empty-btn"
                    onClick={() => { setInputValue(''); updateParams({ q: '', municipalityId: '' }); }}
                  >
                    Show all stores
                  </button>
                )}
              </div>
            ) : (
              <div className="stores-empty">
                <Store size={48} weight="fill" />
                <p>No stores found</p>
                {searchQuery && (
                  <button className="stores-clear-btn" onClick={clearSearch}>
                    Clear search
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="stores-grid">
              {stores.map((store) => (
                isPhone
                  ? <PhoneStoreCard key={store.id} store={store} />
                  : <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="stores-pagination">
              <button
                className="stores-page-btn"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="stores-page-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="stores-page-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}

const initialsOf = (name) => (name
  ? name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  : '?');

// The API returns the logo as `logo`; older rows may carry `logoUrl`.
const logoOf = (store) => {
  const raw = store.logoUrl || store.logo;
  return raw ? resolveImg(raw) || raw : null;
};

function StoreLogo({ store, className }) {
  const [failed, setFailed] = useState(false);
  const src = logoOf(store);
  return (
    <div className={className}>
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{initialsOf(store.name)}</span>
      )}
    </div>
  );
}

function StoreCard({ store }) {
  return (
    <Link to={`/store/${store.slug}`} className="store-card">
      <StoreLogo store={store} className="store-card-avatar" />

      <div className="store-card-body">
        <h3 className="store-card-name">{store.name}</h3>
        {store.address && (
          <p className="store-card-address">
            <MapPin size={12} /> {store.address}
          </p>
        )}
        {store.description && (
          <p className="store-card-desc">{store.description}</p>
        )}
      </div>

      <div className="store-card-footer">
        <span className="store-card-stat">
          <Package size={13} />
          {store._count?.products ?? 0} products
        </span>
        {store.isActive ? (
          <span className="store-badge-active">Active</span>
        ) : (
          <span className="store-badge-inactive">Inactive</span>
        )}
      </div>
    </Link>
  );
}

/** Phones: logo, name, town and product count, a line about the shop, and
 *  a peek at up to three of its newest products. */
function PhoneStoreCard({ store }) {
  const count = store._count?.products ?? 0;
  const previews = (store.products || []).slice(0, 3);
  return (
    <Link to={`/store/${store.slug}`} className="stores-m-card">
      <div className="stores-m-card-head">
        <StoreLogo store={store} className="stores-m-logo" />
        <div className="stores-m-card-text">
          <h3>{store.name}</h3>
          <p className="stores-m-meta">
            {store.municipality?.name && <span><MapPin size={12} weight="fill" /> {store.municipality.name}</span>}
            <span><Package size={12} weight="fill" /> {count} {count === 1 ? 'product' : 'products'}</span>
          </p>
        </div>
        <ChevronRight size={16} className="stores-m-chevron" />
      </div>
      {store.description && <p className="stores-m-desc">{store.description}</p>}
      {previews.length > 0 && (
        <div className="stores-m-previews">
          {previews.map((p) => (
            <div key={p.id} className="stores-m-preview">
              <ProductImage src={Array.isArray(p.images) ? p.images[0] : p.images} alt={p.name} />
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
