import { useState, useEffect, useMemo } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import {
  Link, useNavigate, useNavigationType, useParams, useSearchParams,
} from 'react-router-dom';
import {
  SlidersHorizontal, CaretDown as ChevronDown, GridFour as Grid, Rows as List, WarningCircle,
  CaretLeft, MagnifyingGlass, CaretUp, MapPin,
} from '../lib/icons';
import Layout from '../components/layout/Layout';
import ProductTile from '../components/product/ProductTile';
import useCartStore from '../store/cartStore';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { saleInfo } from '../lib/variantPricing';
import { isStockless, productKind } from '../lib/productKinds';
import Skeleton from '../components/ui/Skeleton';
import './Products.css';
import { useCategories, useMunicipalities } from '../hooks/useReferenceData';
import SearchFilterSheet from '../components/search/SearchFilterSheet';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { POPULAR_SUGGESTIONS, saveRecent } from '../lib/buyerSearch';
import { readCache, writeCache } from '../lib/pageCache';
import { parseImages } from '../lib/media';
import Select from '../components/ui/Select';
import ListEnd from '../components/ui/ListEnd';
import useInfiniteList from '../hooks/useInfiniteList';

// The DB stores `images` as JSON; some rows come back stringified. Normalize.

// The API's sortBy and sortOrder for each sort choice.
const SORTS = {
  // A search's default: the words in the name first (the API ranks them).
  relevance: { sortBy: 'relevance', sortOrder: 'desc' },
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc' },
  'price-low': { sortBy: 'price', sortOrder: 'asc' },
  'price-high': { sortBy: 'price', sortOrder: 'desc' },
  'top-sales': { sortBy: 'orderCount', sortOrder: 'desc' },
  'name-asc': { sortBy: 'name', sortOrder: 'asc' },
  'name-desc': { sortBy: 'name', sortOrder: 'desc' },
};

// Products per batch; the next comes on its own as the end of the grid
// nears. Fills whole rows of the grid (5 / 4 / 2 columns).
const BATCH = 20;

/** GET /products parameters for the list as filtered (each batch adds its page). */
const listParams = ({ pageSize, category, categorySlug, municipalityId, search, minPrice, maxPrice, sort }) => {
  const params = { pageSize };
  if (category) params.categoryId = category;
  else if (categorySlug) params.categorySlug = categorySlug;
  if (municipalityId) params.municipalityId = municipalityId;
  if (search) params.search = search;
  if (minPrice) params.minPrice = minPrice;
  if (maxPrice) params.maxPrice = maxPrice;
  if (sort && SORTS[sort]) Object.assign(params, SORTS[sort]);
  return params;
};

// Each filtered list remembers what it showed, every batch loaded so far
// (pageCache), so Back finds the whole list and the spot in it as left.
const listKey = (params) => `products-list:${JSON.stringify(params)}`;

const Products = () => {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  // Hold a result: its preview with quick actions.
  const [searchParams, setSearchParams] = useSearchParams();
  const isPhone = usePhoneLayout();
  const { categories } = useCategories();
  const [viewMode, setViewMode] = useState('grid');
  const addItem = useCartStore((s) => s.addItem);

  const handleAddToCart = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    // Live animals are bought by making an offer on their page.
    if (productKind(product) === 'LIVESTOCK') { navigate(`/product/${product.slug}`); return; }
    if (product.stock === 0 && !isStockless(product)) {
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
        price: saleInfo(product).price,
        image: parseImages(product.images)[0] || '/placeholder-product.png',
        storeId: product.storeId || product.store?.id,
        storeName: product.store?.name,
        storeLogo: product.store?.logoUrl || product.store?.logo || null,
        readyToSell: product.store?.readyToSell,
        stock: product.stock,
        listingKind: product.listingKind,
        availability: product.availability,
        productType: product.productType,
        details: product.details,
        fulfillment: product.fulfillment,
        weightGrams: product.weightGrams,
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
  // A category page (/category/<slug>, the address search engines list):
  // that category, until another filter is picked (which moves to /products).
  const { categorySlug } = useParams();
  const pathCategorySlug = categorySlug && !searchParams.get('category') ? categorySlug : '';
  const pathCategoryId = pathCategorySlug ? (categories.find((c) => c.slug === pathCategorySlug)?.id || '') : '';
  const activeCategory = selectedCategory || pathCategoryId;
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const municipalityId = searchParams.get('municipalityId') || '';
  const imageSearch = searchParams.get('imageSearch') === '1';
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || (searchParams.get('q') ? 'relevance' : 'newest'));
  const [priceRange, setPriceRange] = useState({
    min: searchParams.get('minPrice') || '',
    max: searchParams.get('maxPrice') || '',
  });

  // Sync local search state whenever the URL query string changes (e.g. header re-search).
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const cat = searchParams.get('category') || '';
    setSearchQuery((prev) => (prev === q ? prev : q));
    // No sort chosen: a search ranks by best match, browsing by newest.
    if (!searchParams.get('sort')) setSortBy(q ? 'relevance' : 'newest');
    setSelectedCategory((prev) => (prev === cat ? prev : cat));
  }, [searchParams]);

  // An image search: the results the image search page kept (not asked for here).
  const imageStored = useMemo(() => {
    if (!imageSearch) return null;
    try {
      const stored = JSON.parse(sessionStorage.getItem('emoorm.image-search') || '{}');
      return { results: Array.isArray(stored.results) ? stored.results : [], previewUrl: stored.previewUrl || '' };
    } catch {
      return { results: [], previewUrl: '' };
    }
  }, [imageSearch]);
  const imageSearchPreview = imageStored?.previewUrl || '';

  // The list, every product of it: one batch after another as the end of
  // the grid nears. Any change of filters or sort starts again from the
  // first batch. (An old link's ?page= is ignored: the list starts at the
  // top and the rest follows on scrolling.) The price is the one applied
  // (Apply, or the phone's sheet), not what is being typed.
  const appliedMin = searchParams.get('minPrice') || '';
  const appliedMax = searchParams.get('maxPrice') || '';
  const params = listParams({
    pageSize: BATCH,
    category: selectedCategory,
    // A category page asks by its slug (its address), so its list stays
    // the same one while the category names arrive.
    categorySlug: selectedCategory ? undefined : pathCategorySlug,
    municipalityId,
    search: searchQuery,
    minPrice: appliedMin,
    maxPrice: appliedMax,
    sort: sortBy,
  });
  const key = listKey(params);
  // All products, newest first, is saved on the device (its first batch);
  // a search or a filter, for this visit.
  const firstView = !params.categoryId && !params.municipalityId
    && !params.search && !params.minPrice && !params.maxPrice
    && params.sortBy === SORTS.newest.sortBy && params.sortOrder === SORTS.newest.sortOrder;
  const list = useInfiniteList({
    listKey: key,
    enabled: !imageSearch,
    loadPage: async (page) => {
      const response = await axios.get('/products', { params: { ...params, page } });
      return {
        items: response.data || [],
        total: response.pagination?.total ?? (response.data || []).length,
        totalPages: response.pagination?.totalPages ?? 1,
        extra: { corrected: response.correctedSearch || '' },
      };
    },
    readSaved: readCache,
    // Back to another filter of this page: all of it, as it was left.
    restoreAll: navigationType === 'POP',
    // Later batches are kept for this visit only: the device keeps the first.
    save: (k, saved) => writeCache(k, saved, { visitOnly: !firstView || saved.page > 1 }),
  });
  const products = imageStored ? imageStored.results : list.items;
  const total = imageStored ? imageStored.results.length : list.total;
  const isLoading = imageStored ? false : list.loading;
  const loadError = imageSearch ? '' : (list.error ? (list.error.message || 'Failed to load products') : '');
  const corrected = imageSearch ? '' : (list.extra?.corrected || '');

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    updateURL({ category: categoryId });
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
    updateURL({ sort });
  };

  const handlePriceFilter = () => {
    updateURL({
      minPrice: priceRange.min,
      maxPrice: priceRange.max,
    });
  };

  const updateURL = (params) => {
    // Another filter or sort starts the list over: back to its top (the
    // phone's bar stays on screen, so it can be changed far down the list).
    window.scrollTo(0, 0);
    const newParams = new URLSearchParams(searchParams);
    // No page numbers any more: the list loads on as it is scrolled.
    newParams.delete('page');
    // On a category page the category is part of the address: a change of
    // filters goes on from /products, carrying the category unless changed.
    if (categorySlug && pathCategoryId && !newParams.has('category') && !('category' in params)) {
      newParams.set('category', pathCategoryId);
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    if (categorySlug) {
      navigate(`/products${newParams.toString() ? `?${newParams}` : ''}`);
      return;
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setSearchQuery('');
    setSortBy('newest');
    setPriceRange({ min: '', max: '' });
    sessionStorage.removeItem('emoorm.image-search');
    window.scrollTo(0, 0);
    if (categorySlug) navigate('/products');
    else setSearchParams({});
  };

  const hasActiveFilters = activeCategory || searchQuery || priceRange.min || priceRange.max || sortBy !== 'newest';

  /* ── Phones: the page brings its own search bar (the site header is Home
     only), filter chips and a friendlier empty state. Tapping the bar opens
     the search page (SearchStart) with the words already in it. */
  // The filter sheet: null, or the chip that opened it ('all' | 'municipality' | 'category' | 'price').
  const [filterSheet, setFilterSheet] = useState(null);
  const { municipalities } = useMunicipalities({ enabled: isPhone });
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

  // Phones: a sort tab, and filters from the sheet; each starts the list over.
  const pickSort = (sort) => {
    setSortBy(sort);
    updateURL({ sort: sort === 'newest' ? '' : sort });
  };
  const applyFilters = (changes) => {
    const next = {};
    if ('category' in changes) {
      setSelectedCategory(changes.category);
      next.category = changes.category;
    }
    if ('municipalityId' in changes) next.municipalityId = changes.municipalityId;
    if ('minPrice' in changes || 'maxPrice' in changes) {
      setPriceRange({ min: changes.minPrice || '', max: changes.maxPrice || '' });
      next.minPrice = changes.minPrice || '';
      next.maxPrice = changes.maxPrice || '';
    }
    updateURL(next);
  };
  const resetFilters = () => applyFilters({ category: '', municipalityId: '', minPrice: '', maxPrice: '' });

  const activeCategoryName = categories.find((c) => c.id === activeCategory)?.name;
  const activeMunicipalityName = municipalities.find((m) => m.id === municipalityId)?.name;
  const filterCount = [activeCategory, municipalityId, priceActive].filter(Boolean).length;
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
                      checked={!activeCategory}
                      onChange={() => handleCategoryChange('')}
                    />
                    <span>All Categories</span>
                  </label>
                  {categories.map((category) => (
                    <label key={category.id} className="filter-option">
                      <input
                        type="radio"
                        name="category"
                        checked={activeCategory === category.id}
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
            <div className="products-main">
              <h1 className="sr-only">
                {searchQuery ? `Results for “${searchQuery}”` : activeCategoryName || 'Products'}
              </h1>
              <h2 className="sr-only">Product list</h2>
              {/* Search and Controls */}
              <div className="products-controls">
                <div className="products-results-context">
                  {imageSearch ? (
                    <span className="products-image-context"><img src={imageSearchPreview} alt="Image search" /> Results matching this image</span>
                  ) : searchQuery ? <>Results for <strong>“{corrected || searchQuery}”</strong>{corrected && <span className="srch-corrected"> (you searched “{searchQuery}”)</span>}</> : 'All products'}
                </div>

                <div className="products-actions">
                  <Select
                    aria-label="Sort products"
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="sort-select"
                  >
                    {searchQuery && <option value="relevance">Best match</option>}
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="name-asc">Name: A to Z</option>
                    <option value="name-desc">Name: Z to A</option>
                  </Select>

                  <div className="view-toggle">
                    <button
                      type="button"
                      className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                      aria-label="Grid view"
                      aria-pressed={viewMode === 'grid'}
                    >
                      <Grid size={18} />
                    </button>
                    <button
                      type="button"
                      className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                      aria-label="List view"
                      aria-pressed={viewMode === 'list'}
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {isPhone && !imageSearch && (
                <>
                  <div className="srch-m-controls">
                  <div className="srch-m-sorts" role="tablist" aria-label="Sort by">
                    {searchQuery && (
                      <button type="button" role="tab" aria-selected={sortBy === 'relevance'} className={sortBy === 'relevance' ? 'is-on' : ''} onClick={() => pickSort('relevance')}>
                        Best match
                      </button>
                    )}
                    <button type="button" role="tab" aria-selected={sortBy === 'newest'} className={sortBy === 'newest' ? 'is-on' : ''} onClick={() => pickSort('newest')}>
                      Newest
                    </button>
                    <button type="button" role="tab" aria-selected={sortBy === 'top-sales'} className={sortBy === 'top-sales' ? 'is-on' : ''} onClick={() => pickSort('top-sales')}>
                      Top Sales
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sortBy === 'price-low' || sortBy === 'price-high'}
                      aria-label={sortBy === 'price-low' ? 'Price, low to high' : sortBy === 'price-high' ? 'Price, high to low' : 'Price'}
                      className={sortBy === 'price-low' || sortBy === 'price-high' ? 'is-on' : ''}
                      onClick={() => pickSort(sortBy === 'price-low' ? 'price-high' : 'price-low')}
                    >
                      Price
                      <span className="srch-m-sort-dir" aria-hidden="true">
                        <CaretUp size={10} weight="bold" className={sortBy === 'price-low' ? 'is-on' : ''} />
                        <ChevronDown size={10} weight="bold" className={sortBy === 'price-high' ? 'is-on' : ''} />
                      </span>
                    </button>
                  </div>

                  <div className="srch-m-filters" role="toolbar" aria-label="Filters">
                    <button type="button" className={`srch-m-fchip${filterCount ? ' is-active' : ''}`} onClick={() => setFilterSheet('all')}>
                      <SlidersHorizontal size={15} /> Filter{filterCount ? ` (${filterCount})` : ''}
                    </button>
                    <button type="button" className={`srch-m-fchip${municipalityId ? ' is-active' : ''}`} onClick={() => setFilterSheet('municipality')}>
                      <MapPin size={15} /> {activeMunicipalityName || 'Municipality'} <ChevronDown size={12} />
                    </button>
                    <button type="button" className={`srch-m-fchip${activeCategory ? ' is-active' : ''}`} onClick={() => setFilterSheet('category')}>
                      {activeCategoryName || 'Category'} <ChevronDown size={12} />
                    </button>
                    <button type="button" className={`srch-m-fchip${priceActive ? ' is-active' : ''}`} onClick={() => setFilterSheet('price')}>
                      {priceLabel} <ChevronDown size={12} />
                    </button>
                  </div>
                  </div>

                  <p className="srch-m-count">
                    {isLoading ? <Skeleton height={11} width={140} /> : (
                      <>
                        <strong>{total}</strong> {total === 1 ? 'result' : 'results'}
                        {searchQuery ? <> for “{corrected || searchQuery}”</> : null}
                        {corrected ? <span className="srch-corrected"> (you searched “{searchQuery}”)</span> : null}
                        {activeMunicipalityName ? <> in {activeMunicipalityName}</> : null}
                      </>
                    )}
                  </p>

                  <SearchFilterSheet
                    focus={filterSheet}
                    onClose={() => setFilterSheet(null)}
                    municipalities={municipalities}
                    categories={categories}
                    value={{ municipalityId, category: activeCategory, minPrice: minParam || '', maxPrice: maxParam || '' }}
                    onChange={applyFilters}
                    onReset={resetFilters}
                  />
                </>
              )}

              {isPhone && imageSearch && (
                <div className="srch-m-tools">
                  <div className="srch-m-summary">
                    {isLoading ? <Skeleton height={12} width={150} /> : (
                      <span className="srch-m-image">
                        {imageSearchPreview && <img src={imageSearchPreview} alt="" />}
                        <span><strong>{total}</strong> matching this photo</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Results Info */}
              <div className="products-results-info">
                {isLoading ? (
                  <Skeleton height={11} width={180} />
                ) : (
                  <span>
                    Showing {products.length} of {total} products
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
                  <button onClick={list.reload} className="empty-clear-btn">
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
                  {(activeCategory || priceActive || municipalityId) && (
                    <button type="button" className="srch-m-empty-btn" onClick={resetFilters}>Clear filters</button>
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
                    <ProductTile key={product.id} product={product} onAddToCart={handleAddToCart}>
                      {product.isFeatured && <div className="product-badge featured">Featured</div>}
                    </ProductTile>
                  ))}
                </div>
              )}

              {/* Under the grid: the next batch as the end nears, "Try again", or the end. */}
              {!imageSearch && !isLoading && !loadError && products.length > 0 && <ListEnd list={list} done={total > BATCH ? 'You’ve seen everything for now' : ''} />}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Products;
