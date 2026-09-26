import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import useSeo, { productSchema, breadcrumbs, clampText } from '../lib/seo';
import {
  Heart, ShareNetwork as Share2, Storefront as Store, MapPin,
  Star, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Minus, Plus, Package, Truck, Info,
  CaretRight as ChevronRightSm, ChatCircle as MessageCircle, Money, QrCode, Flag,
  MagnifyingGlass, ShoppingCart, BookmarkSimple,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ReportModal from '../components/ReportModal';
import Skeleton from '../components/ui/Skeleton';
import ProductImage from '../components/ProductImage';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import useWishlistStore from '../store/wishlistStore';
import useIdentityGate from '../hooks/useIdentityGate';
import { usePhoneLayout } from '../hooks/useMobileNav';
import MoreMenu from '../components/MoreMenu';
import ReviewItem from '../components/reviews/ReviewItem';
import ProductOptionSheet from '../components/ProductOptionSheet';
import { useShare } from '../components/ShareSheet';
import {
  getFollowStatus, followStore as apiFollowStore, unfollowStore as apiUnfollowStore, subscribeToFollowChanges,
} from '../lib/follow';
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
      weight={i < Math.round(rating || 0) ? 'fill' : 'regular'}
      color={i < Math.round(rating || 0) ? 'var(--t-warning-500, #f59e0b)' : 'var(--t-neutral-300, #d1d5db)'}
    />
  ))
);

// Shelf-card rating: stars only from real review data, "New" when unreviewed.
const renderShelfRating = (p) => {
  const count = Number(p.reviewCount ?? 0);
  return (
    <div className="product-rating-row">
      {count > 0 ? (
        <>
          <div className="product-stars">{renderStars(p.averageRating, 11)}</div>
          <span className="product-review-count">({count})</span>
        </>
      ) : (
        <span className="product-review-count">New</span>
      )}
    </div>
  );
};

// Fulfilment / payment lines come from the store record, never hardcoded.
const storeServiceLines = (store) => {
  if (!store) return [];
  const lines = [];
  const mode = store.fulfillmentMode;
  if (mode === 'DELIVERY' || mode === 'BOTH') lines.push({ icon: Truck, text: 'Delivery available' });
  if (mode === 'PICKUP' || mode === 'BOTH') lines.push({ icon: Store, text: 'Pickup available' });
  if (store.acceptsCod) lines.push({ icon: Money, text: 'Cash on delivery accepted' });
  if (store.paymentQrType === 'GCASH') lines.push({ icon: QrCode, text: 'GCash accepted' });
  else if (store.paymentQrType === 'QRPH') lines.push({ icon: QrCode, text: 'QR Ph accepted' });
  return lines;
};

const ProductDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { addItem, getItemCount } = useCartStore();
  const cartCount = getItemCount();

  // Phone layout (≤768px): its own top bar, gallery and action bar.
  const isPhone = usePhoneLayout();
  // Keyed to the product, so opening another product starts on its first
  // image — no reset effect needed.
  const [slideState, setSlideState] = useState({ slug: null, index: 0 });
  const activeSlide = slideState.slug === slug ? slideState.index : 0;
  const setActiveSlide = (index) => setSlideState({ slug, index });

  // The page brings its own top and bottom bars on phones, so the site header
  // and bottom navigation step aside while it is open.
  useEffect(() => {
    if (!isPhone) return undefined;
    document.body.classList.add('pdp-phone-mode');
    return () => document.body.classList.remove('pdp-phone-mode');
  }, [isPhone]);

  // The top bar floats see-through over the image, then turns solid once the
  // page scrolls past it, so text never shows through the buttons.
  const [barSolid, setBarSolid] = useState(false);
  useEffect(() => {
    if (!isPhone) return undefined;
    const onScroll = () => setBarSolid(window.scrollY > window.innerWidth * 0.75);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isPhone]);
  const { toggleItem, isInWishlist } = useWishlistStore();
  const { requireVerifiedIdentity, identityDialog } = useIdentityGate();

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState({});
  const [variationError, setVariationError] = useState('');
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [sameShopProducts, setSameShopProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [ratingStats, setRatingStats] = useState(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // Phone: 'cart' | 'buy' while the options sheet is open.
  const [sheetMode, setSheetMode] = useState(null);
  const { share, shareSheet } = useShare();
  // The shop's live follow state (the product payload carries none).
  const [storeFollow, setStoreFollow] = useState({ following: false, count: null, busy: false });
  const closeSheet = useCallback(() => setSheetMode(null), []);
  const [zoom, setZoom] = useState({ active: false, x: 50, y: 50 });

  const handleZoomMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoom({ active: true, x, y });
  };
  const handleZoomLeave = () => setZoom((z) => ({ ...z, active: false }));

  const followStoreId = product?.store?.id || null;
  useEffect(() => {
    if (!followStoreId) return undefined;
    let cancelled = false;
    setStoreFollow({ following: false, count: null, busy: false });
    getFollowStatus(followStoreId)
      .then((st) => { if (!cancelled) setStoreFollow((cur) => ({ ...cur, following: !!st.following, count: st.followerCount ?? 0 })); })
      .catch(() => {});
    const unsub = subscribeToFollowChanges((msg) => {
      if (!msg || msg.storeId !== followStoreId) return;
      setStoreFollow((cur) => ({
        ...cur,
        following: msg.type === 'follow' ? true : msg.type === 'unfollow' ? false : cur.following,
        count: msg.data?.followerCount ?? cur.count,
      }));
    });
    return () => { cancelled = true; unsub(); };
  }, [followStoreId, isAuthenticated]);

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
      setSelectedVariations({});
      setVariationError('');
      if (res.data?.categoryId) fetchRelated(res.data.categoryId, res.data.id);
      if (res.data?.storeId) fetchSameShop(res.data.storeId, res.data.id);
      if (res.data?.id) fetchReviews(res.data.id);
    } catch (error) {
      console.error('Failed to fetch product:', error);
      if (error.status === 404) {
        toast.error('Product not found');
        navigate('/products', { replace: true });
      }
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
      // axios unwraps to the body, so the sibling `ratingStats` survives.
      setRatingStats(res.ratingStats || null);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    }
  };

  const loginRedirect = () => navigate(`/login?redirect=${encodeURIComponent(`/product/${slug}`)}`);

  const toggleStoreFollow = async () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    if (!product?.store || storeFollow.busy) return;
    setStoreFollow((cur) => ({ ...cur, busy: true }));
    try {
      const res = storeFollow.following
        ? await apiUnfollowStore(product.store.id)
        : await apiFollowStore(product.store.id);
      setStoreFollow({ following: !!res.following, count: res.followerCount ?? 0, busy: false });
      toast.success(res.following ? `You now follow ${product.store.name}` : `Unfollowed ${product.store.name}`);
    } catch (err) {
      setStoreFollow((cur) => ({ ...cur, busy: false }));
      toast.error(err.message || 'Could not update follow');
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    const variationDefinitions = Array.isArray(product.variations) ? product.variations : [];
    const missingVariation = variationDefinitions.find((variation) => !selectedVariations[variation.name]);
    if (missingVariation) {
      setVariationError(missingVariation.name);
      document.querySelector('.pdp-variations-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setIsAddingToCart(true);
    try {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: parseImages(product.images)[0] || '/placeholder-product.png',
        storeId: product.storeId,
        storeName: product.store?.name,
        storeLogo: product.store?.logoUrl || product.store?.logo || null,
        stock: product.stock,
        slug: product.slug,
        categoryId: product.categoryId,
        productId: product.id,
        selectedVariations: variationDefinitions.length ? selectedVariations : null,
      }, quantity);
      toast.success('Added to cart');
      return true;
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
      return false;
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (isAuthenticated && !(await requireVerifiedIdentity())) return;
    if (handleAddToCart() !== false) setTimeout(() => navigate('/cart'), 250);
  };

  // Phone sheet: the sheet has already checked every option group.
  const confirmSheet = async () => {
    const mode = sheetMode;
    if (!isAuthenticated) { setSheetMode(null); loginRedirect(); return; }
    // The identity dialog shows in place of the sheet.
    if (mode === 'buy' && !(await requireVerifiedIdentity())) { setSheetMode(null); return; }
    // On failure (e.g. more than the stock) the sheet stays open with the toast.
    if (handleAddToCart() === false) return;
    setSheetMode(null);
    if (mode === 'buy') setTimeout(() => navigate('/cart'), 250);
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

  // The device's share menu where there is one, otherwise the app list.
  const handleShare = () => share({
    title: product.name,
    text: `${product.name} — ${peso(product.price)} on E-MOORM`,
    url: `${window.location.origin}/product/${product.slug}`,
  });

  const soldCount = useMemo(() => Number(product?.soldCount ?? 0), [product]);

  const serviceLines = useMemo(() => storeServiceLines(product?.store), [product]);

  // Tab title follows the product while this page is mounted.
  useEffect(() => {
    if (!product?.name) return undefined;
    const previous = document.title;
    document.title = `${product.name} · Emoorm`;
    return () => { document.title = previous; };
  }, [product?.name]);

  // The server already put these tags in the HTML; this keeps them right
  // when the shopper arrives from another page inside the app.
  const seoImage = product ? parseImages(product.images)[0] : null;
  useSeo({
    ready: Boolean(product),
    title: product ? `${product.name}${product.store?.name ? ` from ${product.store.name}` : ''}` : '',
    description: product
      ? clampText(product.description
        || `Buy ${product.name} from local sellers in Oriental Mindoro on E-MOORM.`)
      : '',
    image: seoImage ? resolveImg(seoImage) : undefined,
    path: product ? `/product/${product.slug}` : undefined,
    jsonLd: product
      ? [
        productSchema({
          name: product.name,
          description: clampText(product.description),
          image: seoImage ? resolveImg(seoImage) : undefined,
          price: product.price,
          inStock: Number(product.stock) > 0,
          storeName: product.store?.name,
          slug: product.slug,
          rating: Number(product.averageRating) || undefined,
          reviewCount: Number(product.reviewCount) || undefined,
        }),
        breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Products', path: '/products' },
          { name: product.name, path: `/product/${product.slug}` },
        ]),
      ]
      : undefined,
  });

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
  const toggleWishlist = () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    const wasIn = wishlisted;
    toggleItem(product);
    toast.success(wasIn ? 'Removed from wishlist' : 'Added to wishlist');
  };
  const place = product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro';
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const avgRating = Number(product.averageRating ?? ratingStats?.averageRating ?? 0);
  const reviewCount = Number(product.reviewCount ?? ratingStats?.totalReviews ?? reviews.length);

  return (
    <Layout phoneBar={false} showFooter={!isPhone}>
      <div className={`pdp${isPhone ? ' pdp-is-phone' : ''}`}>
        <div className="container">
          {isPhone && (
            <>
              <div className={`pdp-m-topbar${barSolid ? ' is-solid' : ''}`}>
                <button type="button" className="pdp-m-icon" onClick={goBack} aria-label="Back">
                  <ChevronLeft size={22} weight="bold" />
                </button>
                <Link to="/products" className="pdp-m-search" aria-label="Search products">
                  <MagnifyingGlass size={17} />
                  <span>{product.category?.name || 'Search products'}</span>
                </Link>
                <button type="button" className="pdp-m-icon" onClick={handleShare} aria-label="Share">
                  <Share2 size={21} />
                </button>
                <Link to="/cart" className="pdp-m-icon pdp-m-cart" aria-label={`Cart, ${cartCount} items`}>
                  <ShoppingCart size={22} />
                  {cartCount > 0 && <b>{cartCount > 99 ? '99+' : cartCount}</b>}
                </Link>
                <MoreMenu
                  key={slug}
                  className="pdp-m-more"
                  buttonClassName="pdp-m-icon"
                  items={[
                    {
                      key: 'wish',
                      icon: <Heart size={17} weight={wishlisted ? 'fill' : 'regular'} />,
                      label: wishlisted ? 'Saved to wishlist' : 'Save to wishlist',
                      onClick: toggleWishlist,
                    },
                    product.store && {
                      key: 'shop',
                      icon: <Store size={17} />,
                      label: 'Visit shop',
                      to: `/store/${product.store.slug}`,
                    },
                    {
                      key: 'report',
                      icon: <Flag size={17} />,
                      label: 'Report listing',
                      onClick: () => {
                        if (!isAuthenticated) { loginRedirect(); return; }
                        setShowReport(true);
                      },
                    },
                  ]}
                />
              </div>

              <div className="pdp-m-gallery">
                <div
                  key={slug}
                  className="pdp-m-track"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const i = Math.round(el.scrollLeft / el.clientWidth);
                    if (i !== activeSlide) setActiveSlide(i);
                  }}
                >
                  {gallery.map((img, i) => (
                    <div className="pdp-m-slide" key={i}>
                      <img
                        src={resolveImg(img) || img}
                        alt={i === 0 ? product.name : `${product.name} ${i + 1}`}
                        loading={i === 0 ? 'eager' : 'lazy'}
                        onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }}
                      />
                    </div>
                  ))}
                </div>
                {gallery.length > 1 && (
                  <span className="pdp-m-counter">{activeSlide + 1}/{gallery.length}</span>
                )}
                {product.status === 'PENDING' && <span className="pdp-status-badge">Pending review</span>}
              </div>

              <div className="pdp-m-price">
                <div className="pdp-m-price-main">
                  <span className="pdp-m-peso">₱</span>
                  {Number(product.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="pdp-m-price-side">
                  <span className="pdp-m-badge"><Store size={13} weight="fill" /> Local seller</span>
                  <span className="pdp-m-place"><MapPin size={12} /> {place}</span>
                </div>
              </div>
            </>
          )}

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
                <img
                  src={resolveImg(gallery[selectedImage]) || gallery[selectedImage]}
                  alt={product.name}
                  className="pdp-gallery-image"
                  onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }}
                />
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
                    <img src={resolveImg(img) || img} alt={`${product.name} ${i + 1}`} onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }} />
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
                    backgroundImage: `url(${resolveImg(gallery[selectedImage]) || gallery[selectedImage]})`,
                    backgroundPosition: `${zoom.x}% ${zoom.y}%`,
                  }}
                  aria-hidden="true"
                />
              )}
              <h1 className="pdp-title">{product.name}</h1>
              {isPhone && (
                <button
                  type="button"
                  className={`pdp-m-bookmark${wishlisted ? ' is-active' : ''}`}
                  onClick={toggleWishlist}
                  aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
                  aria-pressed={wishlisted}
                >
                  <BookmarkSimple size={24} weight={wishlisted ? 'fill' : 'regular'} />
                </button>
              )}

              <div className="pdp-meta-row">
                <div className="pdp-rating">
                  {reviewCount > 0 ? (
                    <>
                      <span className="pdp-rating-stars">{renderStars(avgRating)}</span>
                      <span className="pdp-rating-score">{avgRating.toFixed(1)}</span>
                    </>
                  ) : (
                    <span className="pdp-meta-muted">New</span>
                  )}
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
                    </div>
                    {serviceLines.length > 0 ? serviceLines.map(({ icon: Icon, text }) => (
                      <div className="pdp-row-line" key={text}>
                        <Icon size={14} className="pdp-row-icon" />
                        <span>{text}</span>
                      </div>
                    )) : (
                      <div className="pdp-row-line pdp-row-muted">Fulfilment and payment options are shown at checkout</div>
                    )}
                  </div>
                </div>

                <div className="pdp-row">
                  <div className="pdp-row-label">Return &amp; Warranty:</div>
                  <div className="pdp-row-content">
                    <div className="pdp-row-line">
                      <Info size={14} className="pdp-row-icon" />
                      <span>{product.returnPolicy ? 'See seller policy below' : 'No seller return policy provided'}</span>
                    </div>
                  </div>
                </div>

                {product.returnPolicy && (
                  <div className="pdp-row pdp-return-policy">
                    <div className="pdp-row-label">Seller return policy:</div>
                    <div className="pdp-row-content pdp-row-policy-text">{product.returnPolicy}</div>
                  </div>
                )}

                {isPhone && (
                  <button type="button" className="pdp-row pdp-m-options-row" onClick={() => setSheetMode('cart')}>
                    <span className="pdp-row-label">
                      {Array.isArray(product.variations) && product.variations.length > 0 ? 'Options' : 'Quantity'}
                    </span>
                    <span className="pdp-m-options-value">
                      {(() => {
                        const defs = Array.isArray(product.variations) ? product.variations : [];
                        const picked = defs.filter((v) => selectedVariations[v.name]).map((v) => `${v.name}: ${selectedVariations[v.name]}`);
                        const qty = `Qty ${quantity}`;
                        if (!defs.length) return qty;
                        if (picked.length < defs.length) return `Select ${defs.map((v) => v.name).join(', ')}`;
                        return `${picked.join(', ')} · ${qty}`;
                      })()}
                    </span>
                    <ChevronRightSm size={16} className="pdp-m-options-caret" />
                  </button>
                )}

                {!isPhone && Array.isArray(product.variations) && product.variations.length > 0 && (
                  <div className={`pdp-row pdp-variations-row ${variationError ? 'is-error' : ''}`}>
                    <div className="pdp-row-label">Select options:</div>
                    <div className="pdp-row-content pdp-variation-selectors">
                      {product.variations.map((variation) => (
                        <fieldset className={`pdp-variation-field ${variationError === variation.name ? 'is-error' : ''}`} key={variation.name}>
                          <span>{variation.name}</span>
                          <div className="pdp-variation-options" role="radiogroup" aria-label={variation.name}>
                            {(variation.options || []).map((option) => (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={selectedVariations[variation.name] === option}
                                className={selectedVariations[variation.name] === option ? 'is-selected' : ''}
                                onClick={() => {
                                  setSelectedVariations((current) => ({ ...current, [variation.name]: option }));
                                  if (variationError === variation.name) setVariationError('');
                                }}
                                key={option}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          {variationError === variation.name && <small>Please select {variation.name}.</small>}
                        </fieldset>
                      ))}
                    </div>
                  </div>
                )}

                {!isPhone && (
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
                    <span className={`pdp-stock ${isOutOfStock ? 'is-out' : ''}`} aria-live="polite">
                      {isOutOfStock ? 'Out of stock' : `${quantity} ${quantity === 1 ? 'item' : 'items'} selected`}
                    </span>
                  </div>
                </div>
                )}
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
                  {isAddingToCart ? 'Adding…' : 'Add to Cart'}
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
                  onClick={toggleWishlist}
                  aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart size={20} weight={wishlisted ? 'fill' : 'regular'} color={wishlisted ? 'var(--t-accent-500, #ec4899)' : 'currentColor'} />
                  <span>{wishlisted ? 'Saved' : 'Like'}</span>
                </button>
                <button
                  type="button"
                  className="pdp-cta-icon"
                  onClick={() => {
                    if (!isAuthenticated) { loginRedirect(); return; }
                    setShowReport(true);
                  }}
                  aria-label="Report this listing"
                  title="Report this listing to the municipal admin"
                >
                  <Flag size={20} />
                  <span>Report</span>
                </button>
              </div>
            </div>
          </div>

          {/* Store panel */}
          {product.store && (
            <div className="pdp-store-card">
              <div className="pdp-store-left">
                <div className="pdp-store-avatar">
                  {product.store.logoUrl || product.store.logo
                    ? <img src={resolveImg(product.store.logoUrl || product.store.logo)} alt={product.store.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <Store size={22} />}
                </div>
                <div>
                  <div className="pdp-store-name">
                    {product.store.name}
                  </div>
                  <div className="pdp-store-meta">
                    {product.store.municipality?.name && (
                      <span><MapPin size={12} /> {product.store.municipality.name}</span>
                    )}
                    {storeFollow.count !== null && (
                      <span className="pdp-store-followers">
                        {storeFollow.count} {storeFollow.count === 1 ? 'follower' : 'followers'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="pdp-store-actions">
                {!(user?.id && (product.store.ownerId || product.store.owner?.id) === user.id) && (
                  <button
                    type="button"
                    className={`pdp-store-btn pdp-store-follow${storeFollow.following ? ' is-following' : ''}`}
                    onClick={toggleStoreFollow}
                    disabled={storeFollow.busy}
                    aria-pressed={storeFollow.following}
                  >
                    {storeFollow.following ? 'Following' : 'Follow'}
                  </button>
                )}
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
            <div className="pdp-section-head has-action">
              <h2 className="pdp-section-title">
                Reviews
                {reviewCount > 0 && <span className="pdp-section-count">{reviewCount}</span>}
              </h2>
              {reviews.length > 0 && (
                <Link to={`/product/${product.slug}/reviews`} className="pdp-shelf-more pdp-reviews-all">
                  View all <ChevronRightSm size={14} weight="bold" />
                </Link>
              )}
            </div>
            <div className="pdp-section-body">
              <div className="pdp-reviews">
                {reviews.length === 0 ? (
                  <div className="pdp-empty">No reviews yet. Be the first to review this product.</div>
                ) : reviews.slice(0, 10).map((r) => <ReviewItem key={r.id} review={r} />)}
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
                      <ProductImage src={parseImages(p.images)[0]} alt={p.name} />
                    </div>
                    <div className="product-info">
                      <span className="product-name">{p.name}</span>
                      <span className="product-price">{peso(p.price)}</span>
                      {renderShelfRating(p)}
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
                      <ProductImage src={parseImages(p.images)[0]} alt={p.name} />
                    </div>
                    <div className="product-info">
                      <span className="product-name">{p.name}</span>
                      <span className="product-price">{peso(p.price)}</span>
                      {renderShelfRating(p)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isPhone && (
        <div className="pdp-m-actionbar">
          <Link to={product.store ? `/store/${product.store.slug}` : '/stores'} className="pdp-m-action">
            <Store size={21} />
            <span>Shop</span>
          </Link>
          <Link to={product.store ? `/messages?store=${product.store.id}` : '/messages'} className="pdp-m-action">
            <MessageCircle size={21} />
            <span>Chat</span>
          </Link>
          <button
            type="button"
            className="pdp-m-addcart"
            onClick={() => setSheetMode('cart')}
            disabled={isOutOfStock || isAddingToCart}
            aria-label="Add to cart"
          >
            <ShoppingCart size={22} />
            <Plus size={11} weight="bold" className="pdp-m-plus" />
          </button>
          <button
            type="button"
            className="pdp-m-buy"
            onClick={() => setSheetMode('buy')}
            disabled={isOutOfStock || isAddingToCart}
          >
            <span>{isOutOfStock ? 'Out of stock' : 'Buy now'}</span>
            {!isOutOfStock && <small>{peso(Number(product.price || 0) * quantity)}</small>}
          </button>
        </div>
      )}

      {isPhone && (
        <ProductOptionSheet
          mode={sheetMode}
          product={product}
          image={gallery[0]}
          selected={selectedVariations}
          onSelect={(name, value) => {
            setSelectedVariations((current) => ({ ...current, [name]: value }));
            if (variationError === name) setVariationError('');
          }}
          quantity={quantity}
          onQuantity={setQuantity}
          onConfirm={confirmSheet}
          onClose={closeSheet}
          busy={isAddingToCart}
        />
      )}

      {showReport && (
        <ReportModal
          type="PRODUCT"
          productId={product.id}
          targetName={product.name}
          onClose={() => setShowReport(false)}
        />
      )}
      {shareSheet}
      {identityDialog}
    </Layout>
  );
};

export default ProductDetails;
