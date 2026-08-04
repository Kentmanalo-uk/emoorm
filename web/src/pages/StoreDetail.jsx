import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Store, MapPin, Phone, Package, Star, Heart,
  ShoppingCart, ChevronLeft, ChevronRight, Flag, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ReportModal from '../components/ReportModal';
import axios from '../lib/axios';
import useCartStore from '../store/cartStore';
import useWishlistStore from '../store/wishlistStore';
import useAuthStore from '../store/authStore';
import './StoreDetail.css';

export default function StoreDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { addItem } = useCartStore();
  const { toggleItem, isInWishlist } = useWishlistStore();

  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoadingStore, setIsLoadingStore] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [sortBy, setSortBy] = useState('newest');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    fetchStore();
  }, [slug]);

  useEffect(() => {
    if (store) fetchProducts();
  }, [store, page, sortBy]);

  const fetchStore = async () => {
    setIsLoadingStore(true);
    try {
      const res = await axios.get(`/stores/slug/${slug}`);
      setStore(res.data);
    } catch (err) {
      if (err.status === 404) navigate('/stores');
      else console.error(err);
    } finally {
      setIsLoadingStore(false);
    }
  };

  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const res = await axios.get('/products', {
        params: { storeId: store.id, page, pageSize: 16, sort: sortBy },
      });
      setProducts(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleAddToCart = (product) => {
    if (!isAuthenticated) { toast.error('Please login to add items to cart'); return; }
    addItem({ ...product, quantity: 1 });
    toast.success(`${product.name} added to cart`);
  };

  const handleWishlist = (product) => {
    if (!isAuthenticated) { toast.error('Please login to save items'); return; }
    const wasIn = isInWishlist(product.id);
    toggleItem(product);
    toast.success(wasIn ? 'Removed from wishlist' : 'Saved to wishlist');
  };

  if (isLoadingStore) {
    return (
      <Layout>
        <div className="store-detail-loading">
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

  return (
    <Layout>
      <div className="store-detail-page">

        {/* Store banner / hero */}
        <div className="store-detail-hero">
          <div className="store-detail-container">
            <div className="store-detail-breadcrumbs">
              <Link to="/">Home</Link><span>/</span>
              <Link to="/stores">Stores</Link><span>/</span>
              <span>{store.name}</span>
            </div>

            <div className="store-detail-header">
              <div className="store-detail-avatar">
                {store.logoUrl
                  ? <img src={store.logoUrl} alt={store.name} />
                  : <span>{initials}</span>}
              </div>

              <div className="store-detail-info">
                <div className="store-detail-name-row">
                  <h1>{store.name}</h1>
                  {store.isActive
                    ? <span className="store-badge-active">Active</span>
                    : <span className="store-badge-inactive">Inactive</span>}
                </div>
                {store.description && <p className="store-detail-desc">{store.description}</p>}
                <div className="store-detail-meta">
                  {store.address && (
                    <span><MapPin size={14} /> {store.address}</span>
                  )}
                  {store.contactNumber && (
                    <span><Phone size={14} /> {store.contactNumber}</span>
                  )}
                  <span><Package size={14} /> {store._count?.products ?? 0} products</span>
                </div>
              </div>

              <button
                className="store-report-btn"
                onClick={() => {
                  if (!isAuthenticated) { toast.error('Please login to report'); return; }
                  setShowReport(true);
                }}
                title="Report this seller"
              >
                <Flag size={14} /> Report Seller
              </button>
            </div>
          </div>
        </div>

        {/* Products section */}
        <div className="store-detail-container store-products-section">
          <div className="store-products-toolbar">
            <h2>Products <span>({pagination.total || products.length})</span></h2>
            <div className="store-sort-row">
              <label>Sort by:</label>
              <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>
          </div>

          {isLoadingProducts ? (
            <div className="store-products-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="store-product-skeleton" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="store-products-empty">
              <Package size={40} />
              <p>No products available yet</p>
            </div>
          ) : (
            <div className="store-products-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  onWishlist={handleWishlist}
                  wishlisted={isInWishlist(product.id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="store-pagination">
              <button
                className="store-page-btn"
                disabled={page <= 1}
                onClick={() => { setPage(page - 1); window.scrollTo({ top: 400, behavior: 'smooth' }); }}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span>Page {page} of {pagination.totalPages}</span>
              <button
                className="store-page-btn"
                disabled={page >= pagination.totalPages}
                onClick={() => { setPage(page + 1); window.scrollTo({ top: 400, behavior: 'smooth' }); }}
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

function ProductCard({ product, onAddToCart, onWishlist, wishlisted }) {
  const price = Number(product.price);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount = compareAt && compareAt > price
    ? Math.round(((compareAt - price) / compareAt) * 100)
    : null;

  const images = Array.isArray(product.images) ? product.images : [];
  const image = images[0] || null;

  return (
    <div className="store-product-card">
      <Link to={`/product/${product.slug}`} className="store-product-img-wrap">
        {image
          ? <img src={image} alt={product.name} />
          : <div className="store-product-img-placeholder"><Package size={32} /></div>}
        {discount && <span className="store-product-discount">-{discount}%</span>}
      </Link>

      <button
        className={`store-product-wishlist ${wishlisted ? 'active' : ''}`}
        onClick={() => onWishlist(product)}
      >
        <Heart size={16} fill={wishlisted ? '#ef4444' : 'none'} />
      </button>

      <div className="store-product-body">
        <Link to={`/product/${product.slug}`} className="store-product-name">
          {product.name}
        </Link>
        <div className="store-product-price-row">
          <span className="store-product-price">₱{price.toFixed(2)}</span>
          {compareAt && <span className="store-product-compare">₱{compareAt.toFixed(2)}</span>}
        </div>
        <button
          className="store-product-add-btn"
          onClick={() => onAddToCart(product)}
          disabled={product.stock === 0}
        >
          <ShoppingCart size={14} />
          {product.stock === 0 ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
