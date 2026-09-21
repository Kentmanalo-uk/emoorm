import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Package,
  Star,
  ShoppingCart,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Flag,
  ChatCircle as MessageCircle,
  MagnifyingGlass as Search,
  X,
  Heart,
  Users,
  SealCheck,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ReportModal from '../components/ReportModal';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ProductImage from '../components/ProductImage';
import {
  followStore as apiFollowStore,
  unfollowStore as apiUnfollowStore,
  subscribeToFollowChanges,
} from '../lib/follow';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './StoreDetail.css';

const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'price_asc', label: 'Price: Low to High', sortBy: 'price', sortOrder: 'asc' },
  { key: 'price_desc', label: 'Price: High to Low', sortBy: 'price', sortOrder: 'desc' },
  { key: 'best', label: 'Best Selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'popular', label: 'Most Popular', sortBy: 'orderCount', sortOrder: 'desc' },
];

const PAGE_SIZE = 16;
const DEFAULT_PRIMARY = 'var(--t-primary-600, #059669)';
const DEFAULT_SECONDARY = 'var(--t-warning-500, #f59e0b)';

// Debounce hook for search
function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function StoreDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { addItem } = useCartStore();

  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [isLoadingStore, setIsLoadingStore] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortKey, setSortKey] = useState('newest');
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounce(rawSearch, 350);

  useEffect(() => {
    fetchStore();
    // Reset UI state when slug changes
    setPage(1);
    setActiveCategory('all');
    setSortKey('newest');
    setRawSearch('');
  }, [slug]);

  useEffect(() => {
    if (store) fetchProducts();
  }, [store, page, activeCategory, sortKey, search]);

  const fetchStore = async () => {
    setIsLoadingStore(true);
    try {
      const res = await axios.get(`/stores/slug/${slug}/storefront`);
      setStore(res.data);
    } catch (err) {
      if (err.status === 404) navigate('/stores');
      else toast.error('Failed to load store');
    } finally {
      setIsLoadingStore(false);
    }
  };

  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const isNewTab = activeCategory === 'new';
      const sortForRequest = isNewTab
        ? { sortBy: 'createdAt', sortOrder: 'desc' }
        : (() => {
          const s = SORTS.find((x) => x.key === sortKey) || SORTS[0];
          return { sortBy: s.sortBy, sortOrder: s.sortOrder };
        })();

      const params = {
        storeId: store.id,
        page,
        pageSize: PAGE_SIZE,
        ...sortForRequest,
      };
      if (activeCategory !== 'all' && activeCategory !== 'new') {
        params.categoryId = activeCategory;
      }
      if (search.trim()) params.search = search.trim();

      const res = await axios.get('/products', { params });
      setProducts(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleAddToCart = (e, product) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!isAuthenticated) {
      toast.error('Please login to add items to cart');
      return;
    }
    addItem({ ...product, quantity: 1 });
    toast.success(`${product.name} added to cart`);
  };

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to follow this store');
      return;
    }
    if (!store || store.ownerId === user?.id) return;
    setFollowBusy(true);
    try {
      const wasFollowing = !!store.isFollowing;
      const res = wasFollowing
        ? await apiUnfollowStore(store.id)
        : await apiFollowStore(store.id);
      setStore((s) => (s ? { ...s, isFollowing: res.following, followerCount: res.followerCount } : s));
      toast.success(res.following ? `You now follow ${store.name}` : `Unfollowed ${store.name}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update follow');
    } finally {
      setFollowBusy(false);
    }
  };

  // Cross-tab/session sync: react when another tab updates our follow state
  useEffect(() => {
    if (!store) return undefined;
    return subscribeToFollowChanges((msg) => {
      if (!msg || msg.storeId !== store.id) return;
      setStore((s) => (s ? {
        ...s,
        isFollowing: msg.type === 'follow' ? true : msg.type === 'unfollow' ? false : s.isFollowing,
        followerCount: msg.data?.followerCount ?? s.followerCount,
      } : s));
    });
  }, [store?.id]);

  const onCategoryChange = useCallback((id) => {
    setActiveCategory(id);
    setPage(1);
  }, []);

  const onSortChange = (key) => {
    setSortKey(key);
    setPage(1);
  };

  const onSearchChange = (val) => {
    setRawSearch(val);
    setPage(1);
  };

  const themeStyle = useMemo(() => {
    const primary = store?.primaryColor || DEFAULT_PRIMARY;
    const secondary = store?.secondaryColor || DEFAULT_SECONDARY;
    return {
      '--shop-primary': primary,
      '--shop-secondary': secondary,
    };
  }, [store?.primaryColor, store?.secondaryColor]);

  if (isLoadingStore) {
    return (
      <Layout>
        <div className="shop-loading">
          <div className="loading-spinner" />
          <p>Loading store…</p>
        </div>
      </Layout>
    );
  }

  if (!store) return null;

  const initials = store.name
    ? store.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  const banner = store.bannerImage || store.coverImage;
  const stats = store.stats || {};
  const rating = Number(stats.averageRating || 0);
  const reviewCount = stats.reviewCount || 0;
  const productCount = stats.productCount || 0;
  const followerCount = store.followerCount || 0;
  const isFollowing = !!store.isFollowing;
  const isOwnStore = user?.id && store.ownerId === user.id;
  const categories = Array.isArray(store.categories) ? store.categories : [];

  return (
    <Layout>
      <div className="shop-page" style={themeStyle}>
        {/* Hero */}
        <div className="shop-hero">
          <div className="shop-hero-banner">
            {banner ? (
              <img src={resolveImg(banner)} alt="" />
            ) : (
              <div className="shop-hero-banner-fallback" />
            )}
            <div className="shop-hero-overlay" />
          </div>

          <div className="shop-container">
            <nav className="shop-breadcrumbs">
              <Link to="/">Home</Link>
              <ChevronRight size={12} />
              <Link to="/stores">Stores</Link>
              <ChevronRight size={12} />
              <span>{store.name}</span>
            </nav>

            <div className="shop-hero-card">
              <div className="shop-hero-identity">
                <div className="shop-avatar">
                  {store.logo ? (
                    <img src={resolveImg(store.logo)} alt={store.name} />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="shop-hero-title">
                  <div className="shop-name-row">
                    <h1>{store.name}</h1>
                    {store.isActive && !store.isSuspended && (
                      <span className="shop-badge">Active</span>
                    )}
                    {store.owner?.identityVerified && (
                      <span
                        className="shop-badge shop-badge-verified"
                        title="This seller's identity was verified with a government ID"
                      >
                        <SealCheck size={12} weight="fill" /> Seller verified
                      </span>
                    )}
                  </div>
                  {store.owner?.username && (
                    <p className="shop-username">@{store.owner.username}</p>
                  )}
                  {store.description && (
                    <p className="shop-tagline">{store.description}</p>
                  )}
                  <div className="shop-stats-row">
                    <div className="shop-stat">
                      <Star size={14} className="shop-stat-icon" />
                      <strong>{rating > 0 ? rating.toFixed(1) : '—'}</strong>
                      <span>({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})</span>
                    </div>
                    <div className="shop-stat">
                      <Package size={14} className="shop-stat-icon" />
                      <strong>{productCount}</strong>
                      <span>products</span>
                    </div>
                    <div className="shop-stat">
                      <Users size={14} className="shop-stat-icon" />
                      <strong>{followerCount}</strong>
                      <span>{followerCount === 1 ? 'follower' : 'followers'}</span>
                    </div>
                    {store.municipality?.name && (
                      <div className="shop-stat">
                        <MapPin size={14} className="shop-stat-icon" />
                        <span>{store.municipality.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="shop-hero-actions">
                {!isOwnStore && (
                  <button
                    type="button"
                    className={`shop-btn ${isFollowing ? 'shop-btn-outline is-following' : 'shop-btn-primary'}`}
                    onClick={handleToggleFollow}
                    disabled={followBusy}
                  >
                    <Heart size={14} weight={isFollowing ? 'fill' : 'regular'} />
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                <button
                  type="button"
                  className="shop-btn shop-btn-outline"
                  onClick={() => {
                    if (!isAuthenticated) {
                      toast.error('Please login to chat');
                      return;
                    }
                    navigate(`/messages?store=${store.id}`);
                  }}
                >
                  <MessageCircle size={14} /> Message
                </button>
                <button
                  type="button"
                  className="shop-btn shop-btn-outline"
                  onClick={() => {
                    if (!isAuthenticated) {
                      toast.error('Please login to report');
                      return;
                    }
                    setShowReport(true);
                  }}
                >
                  <Flag size={14} /> Report
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Contact + seller info strip */}
        <div className="shop-container">
          <div className="shop-info-strip">
            {store.owner?.fullName && (
              <div className="shop-info-item">
                <span className="shop-info-label">Seller</span>
                <span>{store.owner.fullName}</span>
              </div>
            )}
            {store.pickupAddress && (
              <div className="shop-info-item">
                <MapPin size={14} />
                <span>{store.pickupAddress}</span>
              </div>
            )}
            {store.businessHours && (
              <div className="shop-info-item">
                <span className="shop-info-label">Hours</span>
                <span>{store.businessHours}</span>
              </div>
            )}
          </div>
        </div>

        {/* Products */}
        <div className="shop-container shop-products-section">
          {/* Toolbar */}
          <div className="shop-toolbar">
            <div className="shop-toolbar-left">
              <h2>Products</h2>
              <span className="shop-toolbar-count">{pagination.total || 0}</span>
            </div>
            <div className="shop-toolbar-right">
              <div className="shop-search">
                <Search size={16} />
                <input
                  type="text"
                  value={rawSearch}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search products…"
                />
                {rawSearch && (
                  <button
                    type="button"
                    className="shop-search-clear"
                    onClick={() => onSearchChange('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="shop-sort">
                <label>Sort:</label>
                <select value={sortKey} onChange={(e) => onSortChange(e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Category tabs */}
          <div className="shop-tabs">
            <button
              type="button"
              className={`shop-tab ${activeCategory === 'all' ? 'is-active' : ''}`}
              onClick={() => onCategoryChange('all')}
            >
              All Products
            </button>
            <button
              type="button"
              className={`shop-tab ${activeCategory === 'new' ? 'is-active' : ''}`}
              onClick={() => onCategoryChange('new')}
            >
              New Listings
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`shop-tab ${activeCategory === c.id ? 'is-active' : ''}`}
                onClick={() => onCategoryChange(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Grid */}
          {isLoadingProducts ? (
            <div className="shop-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="shop-product-skeleton" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="shop-empty">
              <Package size={40} weight="fill" />
              <p>
                {search
                  ? `No products match “${search}”.`
                  : activeCategory !== 'all'
                    ? 'No products in this category yet.'
                    : 'This store has no products yet.'}
              </p>
              {(search || activeCategory !== 'all') && (
                <button
                  type="button"
                  className="shop-btn shop-btn-outline"
                  onClick={() => {
                    setRawSearch('');
                    onCategoryChange('all');
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="shop-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="shop-pagination">
              <button
                className="shop-page-btn"
                disabled={page <= 1}
                onClick={() => {
                  setPage(page - 1);
                  window.scrollTo({ top: 400, behavior: 'smooth' });
                }}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span>Page {page} of {pagination.totalPages}</span>
              <button
                className="shop-page-btn"
                disabled={page >= pagination.totalPages}
                onClick={() => {
                  setPage(page + 1);
                  window.scrollTo({ top: 400, behavior: 'smooth' });
                }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {showReport && (
        <ReportModal
          type="SELLER"
          storeId={store.id}
          targetName={store.name}
          onClose={() => setShowReport(false)}
        />
      )}
    </Layout>
  );
}

function ProductCard({ product, onAddToCart }) {
  const price = Number(product.price);
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images[0] || null;

  return (
    <Link to={`/product/${product.slug}`} className="product-card">
      <div className="product-image">
        <ProductImage src={image} alt={product.name} />
        <button
          type="button"
          className="product-cart-fab"
          onClick={(e) => onAddToCart(e, product)}
          aria-label="Add to cart"
        >
          <ShoppingCart size={16} />
        </button>
      </div>
      <div className="product-info">
        <span className="product-name">{product.name}</span>
        <span className="product-price">₱{price.toFixed(2)}</span>
        {/* Stars only from real review data; an unrated product says "New". */}
        {Number(product.reviewCount ?? 0) > 0 ? (
          <div className="product-rating-row">
            <div className="product-stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star
                  key={i}
                  size={11}
                  weight={i < Math.round(Number(product.averageRating || 0)) ? 'fill' : 'regular'}
                  color={i < Math.round(Number(product.averageRating || 0))
                    ? 'var(--t-warning-500, #f59e0b)'
                    : 'var(--t-neutral-300, #d1d5db)'}
                />
              ))}
            </div>
            <span className="product-review-count">({product.reviewCount})</span>
          </div>
        ) : (
          <div className="product-rating-row">
            <span className="product-review-count">New</span>
          </div>
        )}
      </div>
    </Link>
  );
}
