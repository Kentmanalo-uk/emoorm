import React, { useState, useEffect, useRef } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  SlidersHorizontal, CaretDown as ChevronDown, GridFour as Grid, Rows as List, ShoppingCart, Star, WarningCircle,
  CaretLeft, MagnifyingGlass,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import useCartStore from '../store/cartStore';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import Skeleton from '../components/ui/Skeleton';
import './Products.css';
import { useCategories } from '../hooks/useReferenceData';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { POPULAR_SUGGESTIONS, saveRecent } from '../lib/buyerSearch';
import { readCache, writeCache } from '../lib/pageCache';

// The DB stores `images` as JSON; some rows come back stringified. Normalize.
const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
};

// Stars only from real review data; a product with no reviews shows "New".
const renderRating = (product, size = 14) => {
  const count = Number(product.reviewCount ?? 0);
  if (count <= 0) {
    return (
      <div className="product-rating-row">
        <span className="product-review-count">New</span>
      </div>
    );
  }
  const filled = Math.round(Number(product.averageRating || 0));
  return (
    <div className="product-rating-row">
      <div className="product-stars">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            size={size}
            weight={i < filled ? 'fill' : 'regular'}
            color={i < filled ? 'var(--t-warning-500, #f59e0b)' : 'var(--t-neutral-300, #d1d5db)'}
          />
        ))}
      </div>
      <span className="product-review-count">({count})</span>
    </div>
  );
};

// The API's sortBy and sortOrder for each sort choice.
const SORTS = {
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc' },
  'price-low': { sortBy: 'price', sortOrder: 'asc' },
  'price-high': { sortBy: 'price', sortOrder: 'desc' },
  'name-asc': { sortBy: 'name', sortOrder: 'asc' },
  'name-desc': { sortBy: 'name', sortOrder: 'desc' },
};

/** GET /products parameters for the list as filtered and paged. */
const listParams = ({ page, pageSize, category, municipalityId, search, minPrice, maxPrice, sort }) => {
  const params = { page, pageSize };
  if (category) params.categoryId = category;
  if (municipalityId) params.municipalityId = municipalityId;
  if (search) params.search = search;
  if (minPrice) params.minPrice = minPrice;
  if (maxPrice) params.maxPrice = maxPrice;
  if (sort && SORTS[sort]) Object.assign(params, SORTS[sort]);
  return params;
};

// Each filtered page remembers what it showed (pageCache).
const listKey = (params) => `products:${JSON.stringify(params)}`;

const Products = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPhone = usePhoneLayout();
  // The list as it showed last time for these filters: shown at once while
  // it is asked for again (and Back finds it, and the spot in it, as left).
  const [saved] = useState(() => (searchParams.get('imageSearch') === '1' ? undefined : readCache(listKey(listParams({
    page: parseInt(searchParams.get('page')) || 1,
    pageSize: 20,
    category: searchParams.get('category') || '',
    municipalityId: searchParams.get('municipalityId') || '',
    search: searchParams.get('q') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    sort: searchParams.get('sort') || 'newest',
  })))));
  const [products, setProducts] = useState(() => saved?.products || []);
  const [imageSearchPreview, setImageSearchPreview] = useState('');
  const { categories } = useCategories();
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [loadError, setLoadError] = useState('');
  // Only the latest request is shown: an earlier one can answer after it.
  const latestRequest = useRef(0);
  const [viewMode, setViewMode] = useState('grid');
  const addItem = useCartStore((s) => s.addItem);

  const handleAddToCart = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stock === 0) {
      toast.error('Out of stock');
      return;
    }
    // Options must be chosen on the product page.
    if (Array.isArray(product.variations) && product.variations.length > 0) {
      navigate(`/product/${product.slug}`);
      return;
    }
    try {
      addItem({
        id: product.id,
        productId: product.id,
        name: product.name,
        price: product.price,
        image: parseImages(product.images)[0] || '/placeholder-product.png',
        storeId: product.storeId || product.store?.id,
        storeName: product.store?.name,
        storeLogo: product.store?.logoUrl || product.store?.logo || null,
        readyToSell: product.store?.readyToSell,
        stock: product.stock,
        slug: product.slug,
        categoryId: product.categoryId,
        selectedVariations: null,
      }, 1);
      toast.success(`${product.name} added to cart`);
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
    }
  };

  // Filters
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const municipalityId = searchParams.get('municipalityId') || '';
  const imageSearch = searchParams.get('imageSearch') === '1';
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [priceRange, setPriceRange] = useState({
    min: searchParams.get('minPrice') || '',
    max: searchParams.get('maxPrice') || '',
  });

  // Pagination
  const [pagination, setPagination] = useState(() => ({
    page: parseInt(searchParams.get('page')) || 1,
    pageSize: 20,
    total: saved?.total || 0,
    totalPages: saved?.totalPages || 0,
  }));

  // Sync local search state whenever the URL query string changes (e.g. header re-search).
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const cat = searchParams.get('category') || '';
    setSearchQuery((prev) => (prev === q ? prev : q));
    setSelectedCategory((prev) => (prev === cat ? prev : cat));
    setPagination((p) => ({ ...p, page: parseInt(searchParams.get('page')) || 1 }));
  }, [searchParams]);

  useEffect(() => {
    if (imageSearch) {
      latestRequest.current += 1;
      try {
        const stored = JSON.parse(sessionStorage.getItem('emoorm.image-search') || '{}');
        setProducts(Array.isArray(stored.results) ? stored.results : []);
        setImageSearchPreview(stored.previewUrl || '');
        setPagination((prev) => ({ ...prev, total: Array.isArray(stored.results) ? stored.results.length : 0, totalPages: 1 }));
      } catch {
        setProducts([]);
        setImageSearchPreview('');
      } finally {
        setIsLoading(false);
      }
      return undefined;
    }
    setImageSearchPreview('');
    fetchProducts();
    return undefined;
  }, [selectedCategory, searchQuery, sortBy, priceRange, pagination.page, municipalityId, imageSearch]);

  const fetchProducts = async () => {
    const params = listParams({
      page: pagination.page,
      pageSize: pagination.pageSize,
      category: selectedCategory,
      municipalityId,
      search: searchQuery,
      minPrice: priceRange.min,
      maxPrice: priceRange.max,
      sort: sortBy,
    });
    const key = listKey(params);
    const request = ++latestRequest.current;
    // Shown before: at once, then refreshed. New filters: the skeleton.
    const kept = readCache(key);
    if (kept) {
      setProducts(kept.products || []);
      setPagination((prev) => ({ ...prev, total: kept.total || 0, totalPages: kept.totalPages || 0 }));
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setLoadError('');
    try {
      const response = await axios.get('/products', { params });
      if (request !== latestRequest.current) return;
      setProducts(response.data || []);
      if (response.pagination) {
        setPagination(prev => ({
          ...prev,
          total: response.pagination.total,
          totalPages: response.pagination.totalPages,
        }));
      }
      // All products, page 1, is saved on the device; a search, a filter or
      // another page, for this visit.
      const firstView = params.page === 1 && !params.categoryId && !params.municipalityId
        && !params.search && !params.minPrice && !params.maxPrice
        && params.sortBy === SORTS.newest.sortBy && params.sortOrder === SORTS.newest.sortOrder;
      writeCache(key, {
        products: response.data || [],
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.totalPages || 0,
      }, { visitOnly: !firstView });
    } catch (error) {
      if (request !== latestRequest.current) return;
      console.error('Failed to fetch products:', error);
      // Offline and the like: the list shown last time stays.
      if (!kept) {
        setProducts([]);
        setLoadError(error?.message || 'Failed to load products');
      }
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setPagination(prev => ({ ...prev, page: 1 }));
    updateURL({ category: categoryId, page: 1 });
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
    updateURL({ sort });
  };

  const handlePriceFilter = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    updateURL({
      minPrice: priceRange.min,
      maxPrice: priceRange.max,
      page: 1
    });
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    updateURL({ page: newPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateURL = (params) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setSearchQuery('');
    setSortBy('newest');
    setPriceRange({ min: '', max: '' });
    setImageSearchPreview('');
    sessionStorage.removeItem('emoorm.image-search');
    setPagination(prev => ({ ...prev, page: 1 }));
    setSearchParams({});
  };

  const hasActiveFilters = selectedCategory || searchQuery || priceRange.min || priceRange.max || sortBy !== 'newest';

  /* ── Phones: the page brings its own search bar (the site header is Home
     only), filter chips and a friendlier empty state. Tapping the bar opens
     the search page (SearchStart) with the words already in it. */
  const [priceOpen, setPriceOpen] = useState(false);
  const openSearchPage = () => navigate('/search', { state: { q: searchQuery } });
  const priceActive = Boolean(searchParams.get('minPrice') || searchParams.get('maxPrice'));

  const runSearch = (term) => {
    const q = term.trim();
    if (!q) return;
    saveRecent(q);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const phoneBack = () => {
    if (window.history.length > 1) navigate(-1); else navigate('/');
  };

  const clearPrice = () => {
    setPriceRange({ min: '', max: '' });
    setPriceOpen(false);
    setPagination((prev) => ({ ...prev, page: 1 }));
    updateURL({ minPrice: '', maxPrice: '', page: 1 });
  };

  const activeCategoryName = categories.find((c) => c.id === selectedCategory)?.name;
  const minParam = searchParams.get('minPrice');
  const maxParam = searchParams.get('maxPrice');
  const priceLabel = priceActive
    ? (maxParam ? `₱${minParam || 0} – ₱${maxParam}` : `₱${minParam} and up`)
    : 'Price';

  return (
    <Layout phoneBar={false}>
      <div className={`products-page${isPhone ? ' is-phone' : ''}`}>
        {isPhone && (
          <div className="srch-m-bar">
            <button type="button" className="srch-m-back" onClick={phoneBack} aria-label="Back">
              <CaretLeft size={22} weight="bold" />
            </button>
            <form
              className="srch-m-field"
              role="search"
              onSubmit={(e) => { e.preventDefault(); openSearchPage(); }}
            >
              <input
                type="search"
                value={searchQuery}
                readOnly
                onFocus={(e) => { e.currentTarget.blur(); openSearchPage(); }}
                placeholder="Search products"
                aria-label="Search products"
              />
              <button type="button" className="srch-m-camera" onClick={() => navigate('/search/image')} aria-label="Search by image">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  <path d="M7 5L8 3H12L13 5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="submit" className="srch-m-go" aria-label="Search">
                <MagnifyingGlass size={18} />
              </button>
            </form>
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="container">
          <div className="breadcrumbs">
            <Link to="/">Home</Link>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Products</span>
          </div>
        </div>

        <div className="container">
          <div className="products-layout">
            {/* Sidebar Filters */}
            <aside className="products-sidebar">
              <div className="sidebar-section">
                <h3 className="sidebar-title">
                  <SlidersHorizontal size={18} />
                  Filters
                </h3>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="clear-filters-btn">
                    Clear All
                  </button>
                )}
              </div>

              {/* Categories */}
              <div className="sidebar-section">
                <h4 className="sidebar-section-title">Categories</h4>
                <div className="filter-options">
                  <label className="filter-option">
                    <input
                      type="radio"
                      name="category"
                      checked={!selectedCategory}
                      onChange={() => handleCategoryChange('')}
                    />
                    <span>All Categories</span>
                  </label>
                  {categories.map((category) => (
                    <label key={category.id} className="filter-option">
                      <input
                        type="radio"
                        name="category"
                        checked={selectedCategory === category.id}
                        onChange={() => handleCategoryChange(category.id)}
                      />
                      <span>{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div className="sidebar-section">
                <h4 className="sidebar-section-title">Price Range</h4>
                <div className="price-range-inputs">
                  <input
                    type="number"
                    placeholder="Min"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                    className="price-input"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                    className="price-input"
                  />
                </div>
                <button onClick={handlePriceFilter} className="apply-filter-btn">
                  Apply
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <main className="products-main">
              {/* Search and Controls */}
              <div className="products-controls">
                <div className="products-results-context">
                  {imageSearch ? (
                    <span className="products-image-context"><img src={imageSearchPreview} alt="Image search" /> Results matching this image</span>
                  ) : searchQuery ? <>Results for <strong>“{searchQuery}”</strong></> : 'All products'}
                </div>

                <div className="products-actions">
                  <select
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="sort-select"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="name-asc">Name: A to Z</option>
                    <option value="name-desc">Name: Z to A</option>
                  </select>

                  <div className="view-toggle">
                    <button
                      className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                    >
                      <Grid size={18} />
                    </button>
                    <button
                      className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {isPhone && (
                <div className="srch-m-tools">
                  <div className="srch-m-summary">
                    {isLoading ? (
                      <Skeleton height={12} width={150} />
                    ) : imageSearch ? (
                      <span className="srch-m-image">
                        {imageSearchPreview && <img src={imageSearchPreview} alt="" />}
                        <span><strong>{pagination.total}</strong> matching this photo</span>
                      </span>
                    ) : (
                      <span>
                        <strong>{pagination.total}</strong> {pagination.total === 1 ? 'result' : 'results'}
                        {searchQuery ? <> for “{searchQuery}”</> : activeCategoryName ? <> in {activeCategoryName}</> : null}
                      </span>
                    )}
                  </div>
                  <label className="srch-m-sort">
                    <select value={sortBy} onChange={(e) => handleSortChange(e.target.value)} aria-label="Sort by">
                      <option value="newest">Newest</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="name-asc">Name: A to Z</option>
                      <option value="name-desc">Name: Z to A</option>
                      <option value="oldest">Oldest</option>
                    </select>
                    <ChevronDown size={13} weight="bold" />
                  </label>
                </div>
              )}

              {isPhone && !imageSearch && (
                <>
                  <div className="srch-m-filters" role="toolbar" aria-label="Filters">
                    <button
                      type="button"
                      className={`srch-m-chip srch-m-price-chip${priceActive || priceOpen ? ' is-active' : ''}`}
                      onClick={() => setPriceOpen((v) => !v)}
                      aria-expanded={priceOpen}
                    >
                      <SlidersHorizontal size={14} />
                      {priceLabel}
                    </button>
                    <button
                      type="button"
                      className={`srch-m-chip${!selectedCategory ? ' is-active' : ''}`}
                      onClick={() => handleCategoryChange('')}
                    >
                      All
                    </button>
                    {categories.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`srch-m-chip${selectedCategory === c.id ? ' is-active' : ''}`}
                        onClick={() => handleCategoryChange(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {priceOpen && (
                    <form
                      className="srch-m-price"
                      onSubmit={(e) => { e.preventDefault(); handlePriceFilter(); setPriceOpen(false); }}
                    >
                      <div className="srch-m-price-inputs">
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="₱ Min"
                          value={priceRange.min}
                          onChange={(e) => setPriceRange((prev) => ({ ...prev, min: e.target.value }))}
                          aria-label="Minimum price"
                        />
                        <span aria-hidden="true">–</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="₱ Max"
                          value={priceRange.max}
                          onChange={(e) => setPriceRange((prev) => ({ ...prev, max: e.target.value }))}
                          aria-label="Maximum price"
                        />
                      </div>
                      <div className="srch-m-price-actions">
                        <button type="button" className="srch-m-price-reset" onClick={clearPrice}>Reset</button>
                        <button type="submit" className="srch-m-price-apply">Apply</button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {/* Results Info */}
              <div className="products-results-info">
                {isLoading ? (
                  <Skeleton height={11} width={180} />
                ) : (
                  <span>
                    Showing {products.length} of {pagination.total} products
                  </span>
                )}
              </div>

              {/* Products Grid/List */}
              {isLoading ? (
                <Skeleton.Cards count={12} />
              ) : loadError ? (
                <div className="products-empty products-error" role="alert">
                  <WarningCircle size={64} weight="fill" />
                  <h3>Couldn't load products</h3>
                  <p>{loadError}</p>
                  <button onClick={fetchProducts} className="empty-clear-btn">
                    Try again
                  </button>
                </div>
              ) : products.length === 0 && isPhone ? (
                <div className="srch-m-empty">
                  <EmptyArt name="search" size={96} />
                  <h3>{searchQuery ? <>No results for “{searchQuery}”</> : 'No products found'}</h3>
                  <p>
                    {searchQuery
                      ? 'Check the spelling, or try a shorter or more general word.'
                      : 'Try another category or price range.'}
                  </p>
                  {(selectedCategory || priceActive) && (
                    <button type="button" className="srch-m-empty-btn" onClick={clearFilters}>Clear filters</button>
                  )}
                  <div className="srch-m-empty-try">
                    <span>Try searching for</span>
                    <div className="srch-m-chips-wrap">
                      {POPULAR_SUGGESTIONS.map((term) => (
                        <button type="button" key={term} className="srch-m-chip" onClick={() => runSearch(term)}>{term}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : products.length === 0 ? (
                <div className="products-empty">
                  <EmptyArt name="search" size={104} />
                  <h3>No products found</h3>
                  <p>Try adjusting your filters or search terms</p>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="empty-clear-btn">
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className={`products-grid ${viewMode === 'list' ? 'products-list' : ''}`}>
                  {products.map((product) => (
                    <Link
                      key={product.id}
                      to={`/product/${product.slug}`}
                      className="product-card"
                    >
                      <div className="product-image">
                        <ProductImage src={product.images?.[0]} alt={product.name} />
                        {product.stock === 0 && (
                          <div className="product-badge out-of-stock">Out of Stock</div>
                        )}
                        {product.isFeatured && (
                          <div className="product-badge featured">Featured</div>
                        )}
                        <button
                          type="button"
                          className="product-cart-fab"
                          onClick={(e) => handleAddToCart(e, product)}
                          aria-label="Add to cart"
                        >
                          <ShoppingCart size={16} />
                        </button>
                      </div>
                      <div className="product-info">
                        <h3 className="product-name">{product.name}</h3>
                        <span className="product-price">₱{Number(product.price).toFixed(2)}</span>
                        {renderRating(product)}
                        {Number(product.soldCount) > 0 && (
                          <span className="product-review-count">{product.soldCount} sold</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {!isLoading && products.length > 0 && pagination.totalPages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="pagination-btn"
                  >
                    Previous
                  </button>

                  <div className="pagination-pages">
                    {[...Array(pagination.totalPages)].map((_, index) => {
                      const page = index + 1;
                      // Show first, last, current, and 2 pages around current
                      if (
                        page === 1 ||
                        page === pagination.totalPages ||
                        (page >= pagination.page - 2 && page <= pagination.page + 2)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`pagination-btn ${page === pagination.page ? 'active' : ''}`}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === pagination.page - 3 ||
                        page === pagination.page + 3
                      ) {
                        return <span key={page} className="pagination-ellipsis">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="pagination-btn"
                  >
                    Next
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Products;
