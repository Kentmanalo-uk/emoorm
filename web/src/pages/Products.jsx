import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, ChevronDown, Grid, List, Package, ShoppingCart, Star } from 'lucide-react';
import Layout from '../components/layout/Layout';
import useCartStore from '../store/cartStore';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import './Products.css';

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');
  const addItem = useCartStore((s) => s.addItem);

  const handleAddToCart = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stock === 0) {
      toast.error('Out of stock');
      return;
    }
    addItem(product, 1);
    toast.success(`${product.name} added to cart`);
  };

  // Filters
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [priceRange, setPriceRange] = useState({
    min: searchParams.get('minPrice') || '',
    max: searchParams.get('maxPrice') || '',
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: parseInt(searchParams.get('page')) || 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchQuery, sortBy, priceRange, pagination.page]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/categories');
      setCategories(response.data || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
      };

      if (selectedCategory) params.categoryId = selectedCategory;
      if (searchQuery) params.search = searchQuery;
      if (priceRange.min) params.minPrice = priceRange.min;
      if (priceRange.max) params.maxPrice = priceRange.max;

      // API expects separate sortBy and sortOrder params
      const sortMapping = {
        newest: { sortBy: 'createdAt', sortOrder: 'desc' },
        oldest: { sortBy: 'createdAt', sortOrder: 'asc' },
        'price-low': { sortBy: 'price', sortOrder: 'asc' },
        'price-high': { sortBy: 'price', sortOrder: 'desc' },
        'name-asc': { sortBy: 'name', sortOrder: 'asc' },
        'name-desc': { sortBy: 'name', sortOrder: 'desc' },
      };
      if (sortBy && sortMapping[sortBy]) {
        params.sortBy = sortMapping[sortBy].sortBy;
        params.sortOrder = sortMapping[sortBy].sortOrder;
      }

      const response = await axios.get('/products', { params });
      setProducts(response.data || []);
      if (response.pagination) {
        setPagination(prev => ({
          ...prev,
          total: response.pagination.total,
          totalPages: response.pagination.totalPages,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setPagination(prev => ({ ...prev, page: 1 }));
    updateURL({ category: categoryId, page: 1 });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    updateURL({ q: searchQuery, page: 1 });
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
    setPagination(prev => ({ ...prev, page: 1 }));
    setSearchParams({});
  };

  const hasActiveFilters = selectedCategory || searchQuery || priceRange.min || priceRange.max || sortBy !== 'newest';

  return (
    <Layout>
      <div className="products-page">
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
                <form onSubmit={handleSearch} className="products-search">
                  <Search size={20} />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button type="submit">Search</button>
                </form>

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

              {/* Results Info */}
              <div className="products-results-info">
                {isLoading ? (
                  <span>Loading...</span>
                ) : (
                  <span>
                    Showing {products.length} of {pagination.total} products
                  </span>
                )}
              </div>

              {/* Products Grid/List */}
              {isLoading ? (
                <div className="products-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading products...</p>
                </div>
              ) : products.length === 0 ? (
                <div className="products-empty">
                  <Package size={64} />
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
                        <img
                          src={product.images?.[0] || '/placeholder-product.png'}
                          alt={product.name}
                        />
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
                        <div className="product-rating-row">
                          <div className="product-stars">
                            {[0, 1, 2, 3, 4].map((i) => (
                              <Star
                                key={i}
                                size={14}
                                fill="#f59e0b"
                                strokeWidth={0}
                              />
                            ))}
                          </div>
                          <span className="product-review-count">({product.reviewCount ?? 0})</span>
                        </div>
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
