import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass as Search, Storefront as Store, MapPin, Package, CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import './Stores.css';

export default function Stores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [inputValue, setInputValue] = useState(searchParams.get('q') || '');
  const municipalityId = searchParams.get('municipalityId') || '';
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  useEffect(() => {
    fetchStores();
  }, [searchQuery, pagination.page, municipalityId]);

  const fetchStores = async () => {
    setIsLoading(true);
    try {
      const params = { page: pagination.page, pageSize: pagination.pageSize };
      if (searchQuery) params.q = searchQuery;
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

  const handleSearch = (e) => {
    e.preventDefault();
    const q = inputValue.trim();
    setSearchQuery(q);
    setPagination((prev) => ({ ...prev, page: 1 }));
    const params = {};
    if (q) params.q = q;
    setSearchParams(params);
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Layout>
      <div className="stores-page">
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
              <h1 className="stores-title">Browse Stores</h1>
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

          {/* Results count */}
          {!isLoading && (
            <p className="stores-count">
              {pagination.total > 0
                ? `${pagination.total} store${pagination.total !== 1 ? 's' : ''} found`
                : searchQuery
                  ? `No stores match "${searchQuery}"`
                  : 'No stores yet'}
            </p>
          )}

          {/* Store grid */}
          {isLoading ? (
            <div className="stores-loading">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="store-card-skeleton" />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="stores-empty">
              <Store size={48} weight="fill" />
              <p>No stores found</p>
              {searchQuery && (
                <button
                  className="stores-clear-btn"
                  onClick={() => { setSearchQuery(''); setInputValue(''); setSearchParams({}); }}
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="stores-grid">
              {stores.map((store) => (
                <StoreCard key={store.id} store={store} />
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

function StoreCard({ store }) {
  const initials = store.name
    ? store.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  return (
    <Link to={`/store/${store.slug}`} className="store-card">
      <div className="store-card-avatar">
        {store.logoUrl ? (
          <img src={store.logoUrl} alt={store.name} />
        ) : (
          <span>{initials}</span>
        )}
      </div>

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
