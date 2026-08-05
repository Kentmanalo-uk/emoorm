import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Heart, Share2, Store, MapPin, ShieldCheck,
  Star, ChevronLeft, ChevronRight, Minus, Plus, Package, Truck,
  ChevronRight as ChevronRightSm, MessageCircle, RotateCcw, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ReportModal from '../components/ReportModal';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import useWishlistStore from '../store/wishlistStore';
import './ProductDetails.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const renderStars = (rating, size = 14) => (
  [...Array(5)].map((_, i) => (
    <Star
      key={i}
      size={size}
      fill={i < Math.round(rating || 0) ? '#f59e0b' : 'none'}
      stroke={i < Math.round(rating || 0) ? '#f59e0b' : '#d1d5db'}
    />
  ))
);

const ProductDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { addItem } = useCartStore();
  const { toggleItem, isInWishlist } = useWishlistStore();

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [sameShopProducts, setSameShopProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [zoom, setZoom] = useState({ active: false, x: 50, y: 50 });

  const handleZoomMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoom({ active: true, x, y });
  };
  const handleZoomLeave = () => setZoom((z) => ({ ...z, active: false }));

  useEffect(() => {
    fetchProduct();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchProduct = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`/products/slug/${slug}`);
      setProduct(res.data);
      setSelectedImage(0);
      setQuantity(1);
      if (res.data?.categoryId) fetchRelated(res.data.categoryId, res.data.id);
      if (res.data?.storeId) fetchSameShop(res.data.storeId, res.data.id);
      if (res.data?.id) fetchReviews(res.data.id);
    } catch (error) {
      console.error('Failed to fetch product:', error);
      if (error.status === 404) navigate('/products');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRelated = async (categoryId, productId) => {
    try {
      const res = await axios.get('/products', { params: { categoryId, pageSize: 8 } });
      setRelatedProducts((res.data || []).filter((p) => p.id !== productId).slice(0, 6));
    } catch (err) {
      console.error('Failed to fetch related products:', err);
    }
  };

  const fetchSameShop = async (storeId, productId) => {
    try {
      const res = await axios.get('/products', { params: { storeId, pageSize: 8 } });
      setSameShopProducts((res.data || []).filter((p) => p.id !== productId).slice(0, 6));
    } catch (err) {
      console.error('Failed to fetch same-shop products:', err);
    }
  };

  const fetchReviews = async (productId) => {
    try {
      const res = await axios.get(`/reviews/product/${productId}`);
      setReviews(res.data || []);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    setIsAddingToCart(true);
    try {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: parseImages(product.images)[0] || '/placeholder-product.png',
        storeId: product.storeId,
        storeName: product.store?.name,
        stock: product.stock,
        slug: product.slug,
      }, quantity);
      toast.success('Added to cart');
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = () => {
    handleAddToCart();
    setTimeout(() => navigate('/cart'), 250);
  };

  const changeQty = (delta) => {
    const next = quantity + delta;
    if (product && next >= 1 && next <= product.stock) setQuantity(next);
  };

  const setQtyDirect = (raw) => {
    if (!product) return;
    const n = Math.max(1, Math.min(product.stock || 1, parseInt(raw || '1', 10) || 1));
    setQuantity(n);
  };

  const nextImage = () => {
    const list = parseImages(product?.images);
    if (list.length) setSelectedImage((p) => (p + 1) % list.length);
  };
  const prevImage = () => {
    const list = parseImages(product?.images);
    if (list.length) setSelectedImage((p) => (p - 1 + list.length) % list.length);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
      }
    } catch {
      // user cancelled — no-op
    }
  };

  const soldCount = useMemo(() => {
    // Backend may return orderCount or _count.orderItems depending on include shape.
    return product?.orderCount ?? product?._count?.orderItems ?? 0;
  }, [product]);

  if (isLoading) {
    return (
      <Layout>
        <div className="pdp">
          <div className="container">
            {/* breadcrumbs */}
            <div className="pdp-skel-crumbs">
              <Skeleton width={40} height={12} />
              <Skeleton width={12} height={12} />
              <Skeleton width={70} height={12} />
              <Skeleton width={12} height={12} />
              <Skeleton width={90} height={12} />
              <Skeleton width={12} height={12} />
              <Skeleton width={220} height={12} />
            </div>

            {/* hero card */}
            <div className="pdp-hero pdp-hero-skel">
              <div className="pdp-hero-gallery">
                <Skeleton width="100%" height={460} radius={6} />
                <div className="pdp-thumbs-skel">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} width={68} height={68} radius={4} />
                  ))}
                </div>
              </div>

              <div className="pdp-hero-info">
                {/* title lines */}
                <Skeleton width="92%" height={18} />
                <Skeleton width="72%" height={18} />
                {/* rating row */}
                <div className="pdp-skel-meta-row">
                  <Skeleton width={100} height={14} />
                  <Skeleton width={1} height={14} radius={0} />
                  <Skeleton width={80} height={14} />
                  <Skeleton width={1} height={14} radius={0} />
                  <Skeleton width={60} height={14} />
                </div>
                {/* price band */}
                <div className="pdp-skel-price">
                  <Skeleton width={180} height={34} radius={4} />
                  <Skeleton width={220} height={12} />
                </div>
                {/* attribute rows */}
                <div className="pdp-skel-attr">
                  <Skeleton width={110} height={13} />
                  <div className="pdp-skel-attr-content">
                    <Skeleton width="60%" height={13} />
                    <Skeleton width="80%" height={12} />
                  </div>
                </div>
                <div className="pdp-skel-attr">
                  <Skeleton width={110} height={13} />
                  <div className="pdp-skel-attr-content">
                    <Skeleton width="90%" height={13} />
                    <Skeleton width="55%" height={12} />
                  </div>
                </div>
                {/* quantity row */}
                <div className="pdp-skel-attr">
                  <Skeleton width={110} height={13} />
                  <Skeleton width={120} height={32} radius={4} />
                </div>
                {/* CTAs */}
                <div className="pdp-skel-cta">
                  <Skeleton width="100%" height={46} radius={4} />
                  <Skeleton width="100%" height={46} radius={4} />
                </div>
              </div>
            </div>

            {/* store card */}
            <div className="pdp-store-card pdp-store-skel">
              <div className="pdp-store-left">
                <Skeleton width={52} height={52} circle />
                <div className="pdp-skel-store-text">
                  <Skeleton width={160} height={15} />
                  <Skeleton width={220} height={12} />
                </div>
              </div>
              <div className="pdp-store-actions">
                <Skeleton width={92} height={34} radius={4} />
                <Skeleton width={120} height={34} radius={4} />
              </div>
            </div>

            {/* description */}
            <div className="pdp-detail-card">
              <div className="pdp-section-head">
                <Skeleton width={140} height={16} />
              </div>
              <div className="pdp-section-body">
                <Skeleton.Text lines={4} />
              </div>
            </div>
            {/* specifications */}
            <div className="pdp-detail-card">
              <div className="pdp-section-head">
                <Skeleton width={140} height={16} />
              </div>
              <div className="pdp-section-body">
                <Skeleton.Text lines={3} lastWidth="55%" />
              </div>
            </div>
            {/* reviews */}
            <div className="pdp-detail-card">
              <div className="pdp-section-head">
                <Skeleton width={100} height={16} />
              </div>
              <div className="pdp-section-body">
                <Skeleton.Text lines={3} lastWidth="65%" />
              </div>
            </div>

            {/* from the same shop */}
            <div className="pdp-shelf">
              <div className="pdp-shelf-head">
                <Skeleton width={180} height={16} />
                <Skeleton width={80} height={12} />
              </div>
              <div className="pdp-shelf-row">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="product-card pdp-shelf-skel-card">
                    <Skeleton width="100%" height={160} radius={0} />
                    <div className="product-info">
                      <Skeleton width="90%" height={12} />
                      <Skeleton width="55%" height={14} />
                      <Skeleton width="40%" height={11} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* you may also like */}
            <div className="pdp-shelf">
              <div className="pdp-shelf-head">
                <Skeleton width={160} height={16} />
                <Skeleton width={80} height={12} />
              </div>
              <div className="pdp-shelf-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="product-card pdp-shelf-skel-card">
                    <Skeleton width="100%" height={160} radius={0} />
                    <div className="product-info">
                      <Skeleton width="90%" height={12} />
                      <Skeleton width="55%" height={14} />
                      <Skeleton width="40%" height={11} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="pdp-notfound">
          <Package size={56} />
          <h2>Product not found</h2>
          <Link to="/products" className="pdp-back-btn">Browse products</Link>
        </div>
      </Layout>
    );
  }

  const images = parseImages(product.images);
  const gallery = images.length ? images : ['/placeholder-product.png'];
  const isOutOfStock = product.stock === 0;
  const wishlisted = isInWishlist(product.id);
  const avgRating = Number(product.averageRating || 0);
  const reviewCount = product.reviewCount ?? reviews.length;

  return (
    <Layout>
      <div className="pdp">
        <div className="container">
          {/* Breadcrumbs */}
          <nav className="pdp-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <ChevronRightSm size={14} />
            <Link to="/products">Products</Link>
            {product.category && (
              <>
                <ChevronRightSm size={14} />
                <Link to={`/products?category=${product.categoryId}`}>{product.category.name}</Link>
              </>
            )}
            <ChevronRightSm size={14} />
            <span className="pdp-breadcrumb-current">{product.name}</span>
          </nav>

          {/* Hero — gallery + info in a single card */}
          <div className="pdp-hero">
            {/* Gallery column */}
            <div className="pdp-hero-gallery">
              <div
                className="pdp-gallery-main"
                onMouseEnter={handleZoomMove}
                onMouseMove={handleZoomMove}
                onMouseLeave={handleZoomLeave}
              >
                <img src={gallery[selectedImage]} alt={product.name} className="pdp-gallery-image" />
                {gallery.length > 1 && (
                  <>
                    <button onClick={prevImage} className="pdp-gallery-nav pdp-gallery-nav-prev" aria-label="Previous image">
                      <ChevronLeft size={22} />
                    </button>
                    <button onClick={nextImage} className="pdp-gallery-nav pdp-gallery-nav-next" aria-label="Next image">
                      <ChevronRight size={22} />
                    </button>
                  </>
                )}
                {product.status === 'PENDING' && (
                  <span className="pdp-status-badge">Pending review</span>
                )}
              </div>
              <div className="pdp-thumbs">
                {gallery.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(i)}
                    className={`pdp-thumb ${selectedImage === i ? 'is-active' : ''}`}
                    aria-label={`View image ${i + 1}`}
                  >
                    <img src={img} alt={`${product.name} ${i + 1}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Info column */}
            <div className={`pdp-hero-info ${zoom.active ? 'is-zoom' : ''}`}>
              {zoom.active && (
                <div
                  className="pdp-zoom-preview"
                  style={{
                    backgroundImage: `url(${gallery[selectedImage]})`,
                    backgroundPosition: `${zoom.x}% ${zoom.y}%`,
                  }}
                  aria-hidden="true"
                />
              )}
              <h1 className="pdp-title">{product.name}</h1>

              <div className="pdp-meta-row">
                <div className="pdp-rating">
                  <span className="pdp-rating-stars">{renderStars(avgRating)}</span>
                  <span className="pdp-rating-score">{avgRating > 0 ? avgRating.toFixed(1) : 'New'}</span>
                </div>
                <span className="pdp-meta-divider" />
                <button
                  type="button"
                  className="pdp-meta-link"
                  onClick={() => document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'}
                </button>
                {soldCount > 0 && (
                  <>
                    <span className="pdp-meta-divider" />
                    <span className="pdp-meta-muted">{soldCount} sold</span>
                  </>
                )}
                {product.store?.name && (
                  <span className="pdp-meta-brand">
                    Brand: <Link to={`/store/${product.store.slug}`}>{product.store.name}</Link>
                    <span className="pdp-meta-brand-sep">|</span>
                    <Link to={`/store/${product.store.slug}`}>More from this seller</Link>
                  </span>
                )}
              </div>

              {/* Price band */}
              <div className="pdp-price-band">
                <div className="pdp-price">{peso(product.price)}</div>
              </div>

              {/* Row attributes */}
              <div className="pdp-rows">
                <div className="pdp-row">
                  <div className="pdp-row-label">Delivery Options:</div>
                  <div className="pdp-row-content">
                    <div className="pdp-row-line">
                      <MapPin size={14} className="pdp-row-icon" />
                      <span className="pdp-row-strong">
                        {product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro'}
                      </span>
                      <button type="button" className="pdp-row-link">CHANGE</button>
                    </div>
                    <div className="pdp-row-line">
                      <Truck size={14} className="pdp-row-icon" />
                      <span>Standard delivery · Ships within 2–3 business days</span>
                    </div>
                    <div className="pdp-row-line pdp-row-muted">Cash on delivery available</div>
                  </div>
                </div>

                <div className="pdp-row">
                  <div className="pdp-row-label">Return &amp; Warranty:</div>
                  <div className="pdp-row-content">
                    <div className="pdp-row-line">
                      <CheckCircle2 size={14} className="pdp-row-icon pdp-row-icon-ok" />
                      <span>100% Authentic</span>
                      <span className="pdp-row-dot">·</span>
                      <RotateCcw size={14} className="pdp-row-icon" />
                      <span>7 Days Free Return</span>
                      <span className="pdp-row-dot">·</span>
                      <ShieldCheck size={14} className="pdp-row-icon" />
                      <span>Damage guarantee</span>
                    </div>
                  </div>
                </div>

                <div className="pdp-row">
                  <div className="pdp-row-label">Quantity:</div>
                  <div className="pdp-row-content pdp-row-qty">
                    <div className="pdp-qty-controls">
                      <button type="button" onClick={() => changeQty(-1)} disabled={quantity <= 1} className="pdp-qty-btn" aria-label="Decrease quantity">
                        <Minus size={14} />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={quantity}
                        onChange={(e) => setQtyDirect(e.target.value)}
                        className="pdp-qty-input"
                        aria-label="Quantity"
                      />
                      <button type="button" onClick={() => changeQty(1)} disabled={quantity >= product.stock} className="pdp-qty-btn" aria-label="Increase quantity">
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className={`pdp-stock ${isOutOfStock ? 'is-out' : product.stock < 10 ? 'is-low' : ''}`}>
                      {isOutOfStock ? 'Out of stock' : product.stock < 10 ? `Only ${product.stock} left` : `${product.stock} available`}
                    </span>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="pdp-cta-row">
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={isOutOfStock || isAddingToCart}
                  className="pdp-btn pdp-btn-outline"
                >
                  Buy Now
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock || isAddingToCart}
                  className="pdp-btn pdp-btn-primary"
                >
                  <ShoppingCart size={18} /> {isAddingToCart ? 'Adding…' : 'Add to Cart'}
                </button>
                <button
                  type="button"
                  className="pdp-cta-icon"
                  onClick={handleShare}
                  aria-label="Share"
                >
                  <Share2 size={20} />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  className={`pdp-cta-icon ${wishlisted ? 'is-active' : ''}`}
                  onClick={() => {
                    if (!isAuthenticated) { navigate('/login'); return; }
                    const wasIn = wishlisted;
                    toggleItem(product);
                    toast.success(wasIn ? 'Removed from wishlist' : 'Added to wishlist');
                  }}
                  aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart size={20} fill={wishlisted ? '#ef4444' : 'none'} stroke={wishlisted ? '#ef4444' : 'currentColor'} />
                  <span>{wishlisted ? 'Saved' : 'Like'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Store panel */}
          {product.store && (
            <div className="pdp-store-card">
              <div className="pdp-store-left">
                <div className="pdp-store-avatar">
                  {product.store.logoUrl
                    ? <img src={product.store.logoUrl} alt={product.store.name} />
                    : <Store size={22} />}
                </div>
                <div>
                  <div className="pdp-store-name">
                    {product.store.name}
                    {product.store.isVerified && <span className="pdp-store-verified" title="Verified"><ShieldCheck size={14} /></span>}
                  </div>
                  <div className="pdp-store-meta">
                    {product.store.municipality?.name && (
                      <span><MapPin size={12} /> {product.store.municipality.name}</span>
                    )}
                    {product.store.ratingAverage > 0 && (
                      <span><Star size={12} fill="#f59e0b" stroke="#f59e0b" /> {Number(product.store.ratingAverage).toFixed(1)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="pdp-store-actions">
                <Link to={`/messages?store=${product.store.id}`} className="pdp-store-btn pdp-store-btn-ghost">
                  <MessageCircle size={15} /> Chat
                </Link>
                <Link to={`/store/${product.store.slug}`} className="pdp-store-btn">
                  Visit Store
                </Link>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="pdp-detail-card">
            <div className="pdp-section-head">
              <h2 className="pdp-section-title">Product Description</h2>
            </div>
            <div className="pdp-section-body">
              <div className="pdp-desc">
                {product.description
                  ? product.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)
                  : <p className="pdp-empty">No description provided by the seller.</p>}
              </div>
            </div>
          </div>

          {/* Specifications */}
          <div className="pdp-detail-card">
            <div className="pdp-section-head">
              <h2 className="pdp-section-title">Specifications</h2>
            </div>
            <div className="pdp-section-body">
              <dl className="pdp-specs">
                <div><dt>Category</dt><dd>{product.category?.name || '—'}</dd></div>
                <div><dt>Origin</dt><dd>{product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro'}</dd></div>
                <div><dt>Sold by</dt><dd>{product.store?.name || '—'}</dd></div>
                <div><dt>Stock</dt><dd>{product.stock}</dd></div>
                <div><dt>SKU</dt><dd>{product.id?.slice(0, 8).toUpperCase()}</dd></div>
                <div><dt>Listed</dt><dd>{new Date(product.createdAt).toLocaleDateString()}</dd></div>
              </dl>
            </div>
          </div>

          {/* Reviews */}
          <div className="pdp-detail-card" id="pdp-reviews">
            <div className="pdp-section-head">
              <h2 className="pdp-section-title">
                Reviews
                {reviewCount > 0 && <span className="pdp-section-count">{reviewCount}</span>}
              </h2>
            </div>
            <div className="pdp-section-body">
              <div className="pdp-reviews">
                {reviews.length === 0 ? (
                  <div className="pdp-empty">No reviews yet. Be the first to review this product.</div>
                ) : reviews.slice(0, 10).map((r) => (
                  <div key={r.id} className="pdp-review">
                    <div className="pdp-review-head">
                      <div className="pdp-review-avatar">{r.buyer?.fullName?.charAt(0) || 'U'}</div>
                      <div>
                        <div className="pdp-review-name">{r.buyer?.fullName || 'Anonymous'}</div>
                        <div className="pdp-review-stars">{renderStars(r.rating, 12)}</div>
                      </div>
                      <div className="pdp-review-date">{new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <p className="pdp-review-comment">{r.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* From the same shop */}
          {sameShopProducts.length > 0 && product.store && (
            <div className="pdp-shelf pdp-shelf-card">
              <div className="pdp-shelf-head">
                <h2>From the Same Store</h2>
                <Link to={`/store/${product.store.slug}`} className="pdp-shelf-more">
                  Visit shop <ChevronRightSm size={14} />
                </Link>
              </div>
              <div className="pdp-shelf-row">
                {sameShopProducts.map((p) => (
                  <Link key={p.id} to={`/product/${p.slug}`} className="product-card">
                    <div className="product-image">
                      <img
                        src={parseImages(p.images)[0] || '/placeholder-product.png'}
                        alt={p.name}
                      />
                    </div>
                    <div className="product-info">
                      <span className="product-name">{p.name}</span>
                      <span className="product-price">{peso(p.price)}</span>
                      <div className="product-rating-row">
                        <div className="product-stars">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <Star key={i} size={11} fill="#f59e0b" strokeWidth={0} />
                          ))}
                        </div>
                        <span className="product-review-count">({p.reviewCount ?? 0})</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* You may also like */}
          {relatedProducts.length > 0 && (
            <div className="pdp-shelf">
              <div className="pdp-shelf-head">
                <h2>You may also like</h2>
                <Link to={`/products?category=${product.categoryId}`} className="pdp-shelf-more">
                  See more <ChevronRightSm size={14} />
                </Link>
              </div>
              <div className="pdp-shelf-grid">
                {relatedProducts.map((p) => (
                  <Link key={p.id} to={`/product/${p.slug}`} className="product-card">
                    <div className="product-image">
                      <img
                        src={parseImages(p.images)[0] || '/placeholder-product.png'}
                        alt={p.name}
                      />
                    </div>
                    <div className="product-info">
                      <span className="product-name">{p.name}</span>
                      <span className="product-price">{peso(p.price)}</span>
                      <div className="product-rating-row">
                        <div className="product-stars">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <Star key={i} size={11} fill="#f59e0b" strokeWidth={0} />
                          ))}
                        </div>
                        <span className="product-review-count">({p.reviewCount ?? 0})</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReport && (
        <ReportModal
          type="PRODUCT"
          productId={product.id}
          targetName={product.name}
          onClose={() => setShowReport(false)}
        />
      )}
    </Layout>
  );
};

export default ProductDetails;
