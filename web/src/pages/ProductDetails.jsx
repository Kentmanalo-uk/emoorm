import { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import useSeo, { productSchema, breadcrumbs, clampText } from '../lib/seo';
import {
  Heart, ShareNetwork as Share2, Storefront as Store, MapPin,
  Star, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Minus, Plus, Package, Truck, Info, CalendarCheck,
  CaretRight as ChevronRightSm, ChatCircle as MessageCircle, Money, QrCode, Flag,
  MagnifyingGlass, ShoppingCart, ShoppingCartSimple, CaretDown, Clock,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ReportModal from '../components/ReportModal';
import Skeleton from '../components/ui/Skeleton';
import ProductImage from '../components/ProductImage';
import { BusyLabel } from '../components/ui/Spinner';
import { readCache, writeCache } from '../lib/pageCache';
import axios from '../lib/axios';
import { resolveImg, parseImages } from '../lib/media';
import useCartStore, { cartKeyFor } from '../store/cartStore';
import useAuthStore from '../store/authStore';
import LivestockDeal from '../components/offers/LivestockDeal';
import ShippingEstimate from '../components/orders/ShippingEstimate';
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
import {
  pricedVariation, priceForSelection, priceRange, stockedVariation, stockForSelection, unitPriceFor, priceTiersOf,
} from '../lib/variantPricing';
import { awayUntil, shortDate } from '../lib/shopHours';
import { saleInfo } from '../lib/variantPricing';
import { recordView } from '../lib/recentlyViewed';
import {
  estimate, orderEta, readyDay, rangeLabel, dayLabel,
} from '../lib/eta';
import {
  isTodayProduct, isOpen as windowOpen, windowState, spanLabel, dayName, clockLabel, fulfillmentLabel,
} from '../lib/availability';
import TimeLeft from '../components/ui/TimeLeft';
import TodayTag, { ProductTodayTag } from '../components/today/TodayTag';
import ProductQuestions from '../components/product/ProductQuestions';
import { SaleWas, SaleEnds, BulkPrices } from '../components/ui/SaleTag';
import {
  productKind, isStockless, minOrder, priceUnit, cookReady, packageSavings, headsLabel,
} from '../lib/productKinds';
import KindRows from '../components/product/kinds/KindRows';
import KindPrice from '../components/product/kinds/KindPrice';
import {
  quantityBounds, countLabel, soldOutLabel, startsFrom, pageUnit, receiveMode,
} from '../components/product/kinds/buying';

const peso =(n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A package's saving: what the items cost one by one, crossed out, and how much less it is. */
const shortPeso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
function PackageSave({ savings }) {
  return (
    <div className="pdp-price-save">
      <s title="Bought one by one">{shortPeso(savings.value)}</s>
      <em>Save {shortPeso(savings.saved)}</em>
    </div>
  );
}

// The DB stores `images` as JSON; some rows come back stringified. Normalize.

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

// Fulfilment / payment lines come from the store record, never hardcoded;
// `mode` narrows them to a pickup-only or delivery-only product.
const storeServiceLines = (store, mode = store?.fulfillmentMode) => {
  if (!store) return [];
  const lines = [];
  if (mode === 'DELIVERY' || mode === 'BOTH') lines.push({ icon: Truck, text: 'Delivery available' });
  if (mode === 'PICKUP' || mode === 'BOTH') lines.push({ icon: Store, text: 'Pickup available' });
  if (store.acceptsCod) lines.push({ icon: Money, text: 'Cash on delivery accepted' });
  if (store.paymentQrType === 'GCASH') lines.push({ icon: QrCode, text: 'GCash accepted' });
  else if (store.paymentQrType === 'QRPH') lines.push({ icon: QrCode, text: 'QR Ph accepted' });
  return lines;
};

// Phones: the section tabs (key, element id, label).
const PHONE_SECTIONS = [
  ['overview', 'pdp-overview', 'Overview'],
  ['reviews', 'pdp-reviews', 'Reviews'],
  ['details', 'pdp-details', 'Details'],
  ['foryou', 'pdp-foryou', 'For you'],
];

// The phone header's height, counting the section tabs that hang under it.
const phoneHeadHeight = () => {
  const head = document.querySelector('.pdp-m-head');
  return head ? head.offsetHeight + (head.querySelector('.pdp-m-tabs')?.offsetHeight || 0) : 100;
};

const ProductDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { addItem, getItemCount } = useCartStore();
  const cartCount = getItemCount();

  // Phone layout (≤768px): its own top bar, gallery and action bar.
  const isPhone = usePhoneLayout();
  // The picture tapped to open this product (see lib/productTransition), shown while it loads.
  const previewImage = useLocation().state?.previewImage || null;
  // Keyed to the product, so opening another product starts on its first
  // image — no reset effect needed.
  const [slideState, setSlideState] = useState({ slug: null, index: 0 });
  const activeSlide = slideState.slug === slug ? slideState.index : 0;
  const setActiveSlide = (index) => setSlideState({ slug, index });

  // The page brings its own top and bottom bars on phones, so the site header
  // and bottom navigation step aside while it is open. Before the page shows
  // (a layout effect), so the page it goes back to is not laid out without
  // its header, and not scrolled back to the wrong spot.
  useLayoutEffect(() => {
    if (!isPhone) return undefined;
    document.body.classList.add('pdp-phone-mode');
    return () => document.body.classList.remove('pdp-phone-mode');
  }, [isPhone]);

  // Phones: section tabs under the top bar once the photos are scrolled past,
  // marking the section being read; a tap scrolls to it.
  const [phoneTab, setPhoneTab] = useState({ on: false, key: 'overview' });
  const [descOpen, setDescOpen] = useState(false);
  const [shelfTab, setShelfTab] = useState('same');
  useEffect(() => {
    if (!isPhone) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const head = phoneHeadHeight();
        const gallery = document.querySelector('.pdp-m-gallery')?.offsetHeight || 300;
        let key = 'overview';
        for (const [k, id] of PHONE_SECTIONS) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top - head - 12 <= 0) key = k;
        }
        const on = window.scrollY > gallery * 0.6;
        setPhoneTab((cur) => (cur.on === on && cur.key === key ? cur : { on, key }));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isPhone, slug]);
  const goToSection = (key) => {
    const id = PHONE_SECTIONS.find(([k]) => k === key)?.[1];
    const el = id && document.getElementById(id);
    const head = phoneHeadHeight();
    window.scrollTo({ top: key === 'overview' || !el ? 0 : el.getBoundingClientRect().top + window.scrollY - head + 1, behavior: 'smooth' });
  };

  const { toggleItem, isInWishlist } = useWishlistStore();
  const { requireVerifiedIdentity, identityDialog } = useIdentityGate();

  // A product seen before shows at once while it is asked for again.
  const [product, setProduct] = useState(() => readCache(`product:${slug}`) || null);
  const [isLoading, setIsLoading] = useState(() => !readCache(`product:${slug}`));
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState({});
  const [variationError, setVariationError] = useState('');
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [sameShopProducts, setSameShopProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [ratingStats, setRatingStats] = useState(null);

  // Phones' action bar: unread messages from this shop on Chat, the shop's
  // logo on Shop (the icon when it has none or it fails to load), and the
  // shipping quote for "Free shipping" under Buy now.
  const shopId = product?.store?.id;
  const [shopUnread, setShopUnread] = useState({ shopId: null, count: 0 });
  const [failedLogo, setFailedLogo] = useState('');
  const [shipQuote, setShipQuote] = useState(null);
  useEffect(() => {
    if (!isPhone || !isAuthenticated || !shopId) return undefined;
    let cancelled = false;
    axios.get('/messages/conversations', { quiet: true })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const convo = list.find((c) => c.role === 'buyer' && c.store?.id === shopId);
        if (!cancelled) setShopUnread({ shopId, count: Number(convo?.unreadCount || 0) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isPhone, isAuthenticated, shopId]);
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

  // Recently viewed (Home): a product buyers can see, once it has loaded.
  useEffect(() => {
    if (product?.slug === slug && product.status === 'APPROVED') recordView(user?.id, product);
  }, [product, slug, user?.id]);

  // A page view for the shop's analytics (the server counts a visitor once
  // per half hour, and not the shop itself).
  const viewedId = product?.status === 'APPROVED' && product.slug === slug ? product.id : null;
  useEffect(() => {
    if (viewedId) axios.post(`/views/product/${viewedId}`).catch(() => {});
  }, [viewedId]);

  // Where the page opens (its top, or where it was left on Back) is up to
  // ScrollMemory.
  useEffect(() => {
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchProduct = async () => {
    // Another product: its own start (first photo, one piece or a paluto's
    // minimum order, nothing picked), from its saved copy when it has one.
    // The fresh copy then only updates it, so a choice already made is kept.
    const kept = readCache(`product:${slug}`);
    setSelectedImage(0);
    setQuantity(minOrder(kept));
    setSelectedVariations({});
    setVariationError('');
    const loadAround = (item) => {
      if (item?.categoryId) fetchRelated(item.categoryId, item.id);
      if (item?.storeId) fetchSameShop(item.storeId, item.id);
      if (item?.id) fetchReviews(item.id);
    };
    if (kept) {
      setProduct(kept);
      setIsLoading(false);
      loadAround(kept);
    } else {
      setProduct(null);
      setIsLoading(true);
    }
    try {
      const res = await axios.get(`/products/slug/${slug}`);
      setProduct(res.data);
      setQuantity((q) => Math.max(q, minOrder(res.data)));
      writeCache(`product:${slug}`, res.data);
      if (!kept) loadAround(res.data);
    } catch (error) {
      console.error('Failed to fetch product:', error);
      if (error.status === 404) {
        // Gone (or hidden now): forget the saved copy too.
        writeCache(`product:${slug}`, null);
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
        price: priceForSelection(product, selectedVariations),
        priceTiers: product.priceTiers,
        image: parseImages(product.images)[0] || '/placeholder-product.png',
        storeId: product.storeId,
        storeName: product.store?.name,
        storeLogo: product.store?.logoUrl || product.store?.logo || null,
        stock: stockForSelection(product, selectedVariations),
        listingKind: product.listingKind,
        availability: product.availability,
        // The kind, so the cart knows a paluto has no stock but a minimum
        // order, and checkout which ways it can be received.
        productType: product.productType,
        details: product.details,
        fulfillment: product.fulfillment,
        weightGrams: product.weightGrams,
        packageItems: product.packageItems,
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

  // Buy Now: straight to checkout with just this item (and its options).
  const goToCheckout = () => {
    const variationDefinitions = Array.isArray(product.variations) ? product.variations : [];
    const key = cartKeyFor({ id: product.id, selectedVariations: variationDefinitions.length ? selectedVariations : null });
    navigate('/checkout', { state: { selectedIds: [key] } });
  };

  const handleBuyNow = async () => {
    if (isAuthenticated && !(await requireVerifiedIdentity())) return;
    if (handleAddToCart() !== false) goToCheckout();
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
    if (mode === 'buy') goToCheckout();
  };

  // From one (a paluto: its minimum order) up to the stock for the choices
  // (a paluto: no stock to cap it).
  const changeQty = (delta) => {
    const next = quantity + delta;
    if (!product) return;
    const { least, most } = quantityBounds(product, selectedVariations);
    if (next >= least && next <= most) setQuantity(next);
  };

  const setQtyDirect = (raw) => {
    if (!product) return;
    const { least, most } = quantityBounds(product, selectedVariations);
    const n = Math.max(least, Math.min(most || 1, parseInt(raw || '1', 10) || 1));
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
    text: `${product.name} — ${startsFrom(product) ? 'from ' : ''}${peso(product.price)}${priceUnit(product)} on E-MOORM`,
    url: `${window.location.origin}/product/${product.slug}`,
  });

  const soldCount = useMemo(() => Number(product?.soldCount ?? 0), [product]);

  // The product's own pickup / delivery when it has one, else the shop's.
  const serviceLines = useMemo(() => storeServiceLines(product?.store, product?.store && receiveMode(product)), [product]);
  // When it would come: from the shop's preparation days and week (lib/eta);
  // a paluto from its cooking time, a package no sooner than its notice.
  const etaLines = useMemo(() => {
    const st = product?.store;
    if (!st || st.readyToSell === false || awayUntil(st)) return [];
    if (isTodayProduct(product)) {
      const w = product.availability;
      return w ? [`Ready ${spanLabel(w.readyFrom, w.readyUntil)}`] : [];
    }
    const lower = (t) => t.replace(/Today|Tomorrow/g, (w) => w.toLowerCase());
    if (isStockless(product)) {
      const r = cookReady(product.details);
      // One cooking time (no longest): one moment, not "8:30 AM – 8:30 AM".
      const when = new Date(r.to) - new Date(r.from) > 60e3 ? spanLabel(r.from, r.to) : `${dayName(r.from)} at ${clockLabel(r.from)}`;
      return [`Ready ${lower(when)} if you order now`];
    }
    const mode = receiveMode(product);
    const town = user?.municipalityId;
    if (productKind(product) === 'PACKAGE') {
      const eta = (method) => orderEta(st, [product], { method, townId: town });
      return [
        ...(mode !== 'PICKUP' ? [`Arrives ${lower(rangeLabel(eta('DELIVERY')))} if delivered by the shop`] : []),
        ...(mode !== 'DELIVERY' ? [`Ready for pickup ${lower(rangeLabel(eta('PICKUP')))}`] : []),
      ];
    }
    return [
      ...(mode !== 'PICKUP' ? [`Arrives ${lower(rangeLabel(estimate(st, { method: 'DELIVERY', townId: town })))} if delivered by the shop`] : []),
      ...(mode !== 'DELIVERY' ? [`Ready for pickup ${lower(dayLabel(readyDay(st)))}`] : []),
    ];
  }, [product, user?.municipalityId]);

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
          inStock: isStockless(product) || Number(product.stock) > 0,
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
        <div className={`pdp${isPhone && previewImage ? ' pdp-is-phone' : ''}`}>
          <div className="container">
            {isPhone && previewImage && (
              <div className="pdp-m-gallery">
                <div className="pdp-m-track">
                  <div className="pdp-m-slide"><img src={previewImage} alt="" /></div>
                </div>
              </div>
            )}
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
                {previewImage && !isPhone ? (
                  <div className="pdp-gallery-main">
                    <img src={previewImage} alt="" className="pdp-gallery-image" />
                  </div>
                ) : (
                  <Skeleton width="100%" height={460} radius={6} />
                )}
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
  // A paluto is cooked when ordered: never out of stock.
  const isOutOfStock = !isStockless(product) && product.stock === 0;
  const kind = productKind(product);
  const { least: leastQty, most: mostQty } = quantityBounds(product, selectedVariations);
  // The shop is still setting up (shopReadiness on the API): its products
  // are on show, but checkout refuses them until it is ready to sell.
  const away = awayUntil(product.store);
  // Available Today: orderable only while its window takes orders.
  const todayItem = isTodayProduct(product);
  const todayWindow = product.availability || null;
  const todayClosed = todayItem && !windowOpen(todayWindow);
  const notTakingOrders = product.store?.readyToSell === false || Boolean(away) || todayClosed;
  const closedLabel = away
    ? `Shop away until ${shortDate(away)}`
    : todayClosed ? windowState(todayWindow).text : 'Not taking orders yet';
  const cannotBuy = isOutOfStock || notTakingOrders;
  // Per-option pricing: the chosen option's price, or the range until one is chosen.
  const pricedGroup = pricedVariation(product.variations);
  const range = priceRange(product);
  const optionPriced = !!pricedGroup && range.min !== range.max;
  const optionChosen = !!(pricedGroup && selectedVariations[pricedGroup.name]);
  // Options, a sale, and a bulk price for the quantity chosen.
  const unitPrice = unitPriceFor(product, selectedVariations, quantity);
  const tiers = priceTiersOf(product);
  const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // A paluto's sizes read as where they start: "from ₱350".
  const fromPrice = startsFrom(product) && !optionChosen;
  const priceLabel = () => (fromPrice ? fmt(range.min)
    : optionPriced && !optionChosen ? `${fmt(range.min)} – ₱${fmt(range.max)}` : fmt(unitPrice));
  const unitWords = pageUnit(product);
  // Computers: a kind's own rows make the page long, so the delivery lines join up.
  const compactRows = !isPhone && kind !== 'REGULAR';
  const savings = packageSavings(product);
  const wishlisted = isInWishlist(product.id);
  const toggleWishlist = () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    const wasIn = wishlisted;
    toggleItem(product);
    toast.success(wasIn ? 'Removed from wishlist' : 'Added to wishlist');
  };
  const place = product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro';
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  // The row under the shop: straight into the cart, or to the product to
  // choose its options first.
  const quickAdd = (p) => {
    if (Array.isArray(p.variations) && p.variations.length) {
      navigate(`/product/${p.slug}`);
      return;
    }
    try {
      addItem({
        id: p.id,
        productId: p.id,
        name: p.name,
        price: saleInfo(p).price,
        priceTiers: p.priceTiers,
        image: parseImages(p.images)[0] || '/placeholder-product.png',
        storeId: p.storeId || p.store?.id,
        storeName: p.store?.name,
        storeLogo: p.store?.logo || null,
        readyToSell: p.store?.readyToSell,
        vacationUntil: p.store?.vacationUntil,
        stock: p.stock,
        listingKind: p.listingKind,
        availability: p.availability,
        productType: p.productType,
        details: p.details,
        fulfillment: p.fulfillment,
        weightGrams: p.weightGrams,
        packageItems: p.packageItems,
        slug: p.slug,
        categoryId: p.categoryId,
        selectedVariations: null,
      }, minOrder(p));
      toast.success('Added to cart');
    } catch (err) {
      toast.error(err.message || 'Could not add to cart');
    }
  };
  const avgRating = Number(product.averageRating ?? ratingStats?.averageRating ?? 0);
  const reviewCount = Number(product.reviewCount ?? ratingStats?.totalReviews ?? reviews.length);
  const shopLogo = product.store && (product.store.logoUrl || product.store.logo)
    ? resolveImg(product.store.logoUrl || product.store.logo) : '';
  const chatUnread = isAuthenticated && shopUnread.shopId === product.store?.id ? shopUnread.count : 0;
  // Under Buy now: free shipping only when the shop's own delivery quote is
  // free, otherwise cash on delivery when the shop takes it.
  const sellerQuote = shipQuote?.productId === product.id && shipQuote.seller?.offered ? shipQuote.seller : null;
  const freeShipping = Boolean(sellerQuote && sellerQuote.covered !== false && sellerQuote.fee != null && Number(sellerQuote.fee) === 0);
  const buyNote = freeShipping ? 'Free shipping' : product.store?.acceptsCod ? 'Cash on delivery' : '';

  return (
    <Layout phoneBar={false} showFooter={!isPhone}>
      <div className={`pdp${isPhone ? ' pdp-is-phone' : ''}`}>
        <div className="container">
          {isPhone && (
            <>
              <div className="pdp-m-head">
              <div className="pdp-m-topbar">
                <button type="button" className="pdp-m-icon" onClick={goBack} aria-label="Back">
                  <ChevronLeft size={22} weight="bold" />
                </button>
                <Link to="/products" className="pdp-m-search" aria-label="Search products">
                  <MagnifyingGlass size={17} />
                  <span>{product.category?.name || 'Search products'}</span>
                </Link>
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
              <nav className={`pdp-m-tabs${phoneTab.on ? ' is-on' : ''}`} aria-label="Sections" aria-hidden={!phoneTab.on}>
                {PHONE_SECTIONS.map(([key, , label]) => (
                  <button
                    type="button"
                    key={key}
                    tabIndex={phoneTab.on ? 0 : -1}
                    className={phoneTab.key === key ? 'is-active' : ''}
                    onClick={() => goToSection(key)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              </div>

              <div className="pdp-m-gallery" id="pdp-overview">
                <div
                  key={slug}
                  className="pdp-m-track"
                  role="region"
                  aria-label="Product photos"
                  tabIndex={0}
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
                <div className="pdp-m-price-col">
                <div className="pdp-m-price-main">
                  {fromPrice && <span className="pdp-price-from">from</span>}
                  <span className="pdp-m-peso">₱</span>
                  {priceLabel(false)}
                  {unitWords && <span className="pdp-price-unit">{unitWords}</span>}
                  <SaleWas product={product} />
                </div>
                {kind === 'LIVESTOCK' && <span className="pdp-price-nego">Asking price · negotiable</span>}
                {savings && <PackageSave savings={savings} />}
                </div>
                <SaleEnds product={product} />
                {tiers.length > 0 && <BulkPrices tiers={tiers} />}
                <div className="pdp-m-price-side">
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
              <h1 className="pdp-title">
                {isTodayProduct(product) && product.availability && <TodayTag mode={product.availability.mode} className="pdp-title-tag" />}
                {product.name}
              </h1>
              {isPhone && (
                <div className="pdp-m-title-tools">
                  <button
                    type="button"
                    className={`pdp-m-bookmark${wishlisted ? ' is-active' : ''}`}
                    onClick={toggleWishlist}
                    aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
                    aria-pressed={wishlisted}
                  >
                    <Heart size={23} weight={wishlisted ? 'fill' : 'regular'} />
                  </button>
                  <button type="button" className="pdp-m-bookmark" onClick={handleShare} aria-label="Share">
                    <Share2 size={22} />
                  </button>
                </div>
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
              <div className={`pdp-price-band${compactRows ? ' pdp-price-band--compact' : ''}`}>
                <div className="pdp-price">
                  {fromPrice && <span className="pdp-price-from">from </span>}
                  ₱{priceLabel(false)}
                  {unitWords && <span className="pdp-price-unit">{unitWords}</span>}
                  {' '}<SaleWas product={product} />
                  {kind === 'LIVESTOCK' && <span className="pdp-price-nego">Asking price · negotiable</span>}
                </div>
                {savings && <PackageSave savings={savings} />}
                <SaleEnds product={product} />
                {tiers.length > 0 && <BulkPrices tiers={tiers} />}
              </div>

              {/* Row attributes */}
              <div className={`pdp-rows${compactRows ? ' pdp-rows--compact' : ''}`}>
                <KindRows product={product} compact={compactRows} />
                {todayItem && (
                  <div className="pdp-row pdp-today">
                    <div className="pdp-row-label">Available today:</div>
                    <div className="pdp-row-content">
                      {todayWindow ? (
                        <>
                          <div className="pdp-row-line">
                            <TodayTag mode={todayWindow.mode} className="pdp-today-tag" />
                            <span className={`pdp-today-state is-${windowState(todayWindow, product.stock).tone}`}>
                              {windowState(todayWindow, product.stock).text}
                            </span>
                            {windowOpen(todayWindow) && <TimeLeft until={todayWindow.ordersCloseAt} prefix="· ends in" className="pdp-today-left" />}
                          </div>
                          {todayWindow.prepMinutes ? (
                            <div className="pdp-row-line">
                              <Clock size={14} className="pdp-row-icon" />
                              <span>Made in about {todayWindow.prepMinutes} min after you order</span>
                            </div>
                          ) : null}
                          <div className="pdp-row-line">
                            <Truck size={14} className="pdp-row-icon" />
                            <span>{fulfillmentLabel(todayWindow.fulfillment)}</span>
                          </div>
                          {todayWindow.note && <div className="pdp-row-line pdp-today-note">{todayWindow.note}</div>}
                        </>
                      ) : (
                        <div className="pdp-row-line"><span className="pdp-today-state is-ended">Not available now. The shop posts it on the days it has it.</span></div>
                      )}
                    </div>
                  </div>
                )}
                {/* Livestock is not delivered or checked out: the price is agreed
                    in chat and the animals are paid for at the meetup. */}
                {kind === 'LIVESTOCK' ? (
                <div className="pdp-row">
                  <div className="pdp-row-label">How to buy:</div>
                  <div className="pdp-row-content">
                    <div className="pdp-row-line">
                      <MapPin size={14} className="pdp-row-icon" />
                      <span className="pdp-row-strong">
                        {product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro'}
                      </span>
                    </div>
                    <div className="pdp-row-line">
                      <MessageCircle size={14} className="pdp-row-icon" />
                      <span>Make an offer and agree on the price in chat</span>
                    </div>
                    <div className="pdp-row-line">
                      <Store size={14} className="pdp-row-icon" />
                      <span>Meet the seller, see the animals, and pay in person</span>
                    </div>
                  </div>
                </div>
                ) : (
                <div className="pdp-row">
                  <div className="pdp-row-label">Delivery Options:</div>
                  <div className="pdp-row-content">
                    {compactRows ? (
                      <div className="pdp-row-line pdp-row-joined pdp-eta">
                        <span className="pdp-row-strong">
                          <MapPin size={14} className="pdp-row-icon" /> {product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro'}
                        </span>
                        {etaLines.map((text) => <span key={text}>{text}</span>)}
                      </div>
                    ) : (
                    <div className="pdp-row-line">
                      <MapPin size={14} className="pdp-row-icon" />
                      <span className="pdp-row-strong">
                        {product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro'}
                      </span>
                    </div>
                    )}
                    {!compactRows && etaLines.map((text) => (
                      <div className="pdp-row-line pdp-eta" key={text}>
                        <CalendarCheck size={14} className="pdp-row-icon" />
                        <span>{text}</span>
                      </div>
                    ))}
                    {serviceLines.length > 0 && compactRows ? (
                      <div className="pdp-row-line pdp-row-joined">
                        {serviceLines.map(({ text }) => <span key={text}>{text}</span>)}
                      </div>
                    ) : serviceLines.length > 0 ? serviceLines.map(({ icon: Icon, text }) => (
                      <div className="pdp-row-line" key={text}>
                        <Icon size={14} className="pdp-row-icon" />
                        <span>{text}</span>
                      </div>
                    )) : (
                      <div className="pdp-row-line pdp-row-muted">Fulfilment and payment options are shown at checkout</div>
                    )}
                  </div>
                </div>
                )}

                {/* Delivery by the seller and by couriers, priced for the buyer's town
                    (none for a product that is pickup only, nor for livestock). */}
                {product.fulfillment !== 'PICKUP' && kind !== 'LIVESTOCK' && (
                <div className="pdp-row pdp-row--shipping">
                  <div className="pdp-row-label">Shipping:</div>
                  <div className="pdp-row-content">
                    <ShippingEstimate
                      product={product}
                      unitPrice={unitPrice}
                      compact={compactRows}
                      municipalityId={isAuthenticated ? user?.municipalityId : undefined}
                      onQuote={setShipQuote}
                    />
                  </div>
                </div>
                )}

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

                {isPhone && kind !== 'LIVESTOCK' && (
                  <button type="button" className="pdp-row pdp-m-options-row" onClick={() => setSheetMode('cart')}>
                    <span className="pdp-row-label">
                      {Array.isArray(product.variations) && product.variations.length > 0 ? 'Options' : 'Quantity'}
                    </span>
                    <span className="pdp-m-options-value">
                      {(() => {
                        const defs = Array.isArray(product.variations) ? product.variations : [];
                        const picked = defs.filter((v) => selectedVariations[v.name]).map((v) => `${v.name}: ${selectedVariations[v.name]}`);
                        const qty = kind === 'LIVESTOCK' || kind === 'PACKAGE' ? countLabel(product, quantity)
                          : `Qty ${quantity}${leastQty > 1 ? ` (min. ${leastQty})` : ''}`;
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
                                disabled={stockedVariation(product.variations)?.name === variation.name
                                  && Number(stockedVariation(product.variations).stocks?.[option] || 0) <= 0}
                                className={selectedVariations[variation.name] === option ? 'is-selected' : ''}
                                onClick={() => {
                                  setSelectedVariations((current) => ({ ...current, [variation.name]: option }));
                                  if (variationError === variation.name) setVariationError('');
                                }}
                                key={option}
                              >
                                {option}
                                {stockedVariation(product.variations)?.name === variation.name
                                  && Number(stockedVariation(product.variations).stocks?.[option] || 0) <= 0 && (
                                  <small className="pdp-option-soldout">Sold out</small>
                                )}
                                {pricedGroup?.name === variation.name && Number(pricedGroup.prices?.[option]) > 0 && (
                                  <small className="pdp-option-price">{peso(pricedGroup.prices[option])}</small>
                                )}
                              </button>
                            ))}
                          </div>
                          {variationError === variation.name && <small>Please select {variation.name}.</small>}
                        </fieldset>
                      ))}
                    </div>
                  </div>
                )}

                {!isPhone && kind === 'LIVESTOCK' && cannotBuy && (
                <div className="pdp-row">
                  <div className="pdp-row-label">Heads:</div>
                  <div className="pdp-row-content">
                    <span className="pdp-stock is-out">
                      {notTakingOrders
                        ? (away ? `This shop is away until ${shortDate(away)}` : "This shop isn't taking orders yet")
                        : soldOutLabel(product)}
                    </span>
                  </div>
                </div>
                )}
                {!isPhone && kind !== 'LIVESTOCK' && (
                <div className="pdp-row">
                  <div className="pdp-row-label">Quantity:</div>
                  <div className="pdp-row-content pdp-row-qty">
                    <div className="pdp-qty-controls">
                      <button type="button" onClick={() => changeQty(-1)} disabled={quantity <= leastQty} className="pdp-qty-btn" aria-label="Decrease quantity">
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
                      <button type="button" onClick={() => changeQty(1)} disabled={quantity >= mostQty} className="pdp-qty-btn" aria-label="Increase quantity">
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className={`pdp-stock ${cannotBuy ? 'is-out' : ''}`} aria-live="polite">
                      {notTakingOrders
                        ? (away ? `This shop is away until ${shortDate(away)}` : "This shop isn't taking orders yet")
                        : isOutOfStock ? soldOutLabel(product) : `${countLabel(product, quantity)} selected`}
                      {!cannotBuy && leastQty > 1 && <span className="pdp-stock-min"> · minimum order {leastQty}</span>}
                    </span>
                  </div>
                </div>
                )}
              </div>

              {/* Livestock: no cart and no fixed price. Make an offer, then talk
                  it over in chat. */}
              {kind === 'LIVESTOCK' && !isPhone && (
                <LivestockDeal
                  product={product}
                  listPrice={unitPrice}
                  cannotBuy={cannotBuy}
                  closedLabel={notTakingOrders ? closedLabel : soldOutLabel(product)}
                />
              )}

              {/* CTAs */}
              <div className="pdp-cta-row">
                {kind !== 'LIVESTOCK' && (
                <>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={cannotBuy || isAddingToCart}
                  className="pdp-btn pdp-btn-outline"
                >
                  Buy Now
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={cannotBuy || isAddingToCart}
                  className="pdp-btn pdp-btn-primary"
                >
                  {isAddingToCart ? <BusyLabel>Adding…</BusyLabel> : 'Add to Cart'}
                </button>
                </>
                )}
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
                  {storeFollow.count !== null && (
                    <div className="pdp-store-followers">
                      {storeFollow.count} {storeFollow.count === 1 ? 'follower' : 'followers'}
                    </div>
                  )}
                  <div className="pdp-store-meta">
                    {product.store.municipality?.name && (
                      <span><MapPin size={12} /> {product.store.municipality.name}</span>
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
          <div className="pdp-detail-card pdp-card-desc">
            <div className="pdp-section-head">
              <h2 className="pdp-section-title">Product Description</h2>
            </div>
            <div className="pdp-section-body">
              <div className={`pdp-desc${isPhone && !descOpen && (product.description || '').length > 260 ? ' is-clamped' : ''}`}>
                {product.description
                  ? product.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)
                  : <p className="pdp-empty">No description provided by the seller.</p>}
              </div>
              {isPhone && (product.description || '').length > 260 && (
                <button type="button" className="pdp-m-seemore" onClick={() => setDescOpen((v) => !v)} aria-expanded={descOpen}>
                  {descOpen ? 'See less' : 'See more'} <CaretDown size={14} className={descOpen ? 'is-up' : ''} />
                </button>
              )}
            </div>
          </div>

          {/* Specifications */}
          <div className="pdp-detail-card pdp-card-specs" id="pdp-details">
            <div className="pdp-section-head">
              <h2 className="pdp-section-title">Specifications</h2>
            </div>
            <div className="pdp-section-body">
              <dl className="pdp-specs" tabIndex={0}>
                <div><dt>Category</dt><dd>{product.category?.name || '—'}</dd></div>
                <div><dt>Origin</dt><dd>{product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro'}</dd></div>
                <div><dt>Sold by</dt><dd>{product.store?.name || '—'}</dd></div>
                <div>
                  <dt>{kind === 'LIVESTOCK' ? 'Heads available' : kind === 'PACKAGE' ? 'Packages available' : 'Stock'}</dt>
                  <dd>{isStockless(product) ? 'Cooked when ordered' : product.stock}</dd>
                </div>
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
            {isPhone && reviewCount > 0 && (
              <div className="pdp-m-rating-sum">
                <strong>{avgRating.toFixed(1)}</strong>
                <span className="pdp-rating-stars">{renderStars(avgRating)}</span>
                <span>{reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'}</span>
              </div>
            )}
            {product.status === 'APPROVED' && (
              <button
                type="button"
                className="pdp-ask-link"
                onClick={() => document.getElementById('pdp-questions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <MessageCircle size={15} /> Ask the shop about this product <ChevronRightSm size={14} />
              </button>
            )}
            <div className="pdp-section-body">
              <div className="pdp-reviews">
                {reviews.length === 0 ? (
                  <div className="pdp-empty">
                    <EmptyArt name="reviews" size={72} />
                    <span>No reviews yet. Be the first to review this product.</span>
                  </div>
                ) : reviews.slice(0, 10).map((r) => <ReviewItem key={r.id} review={r} />)}
              </div>
            </div>
          </div>

          {/* Questions and the shop's answers */}
          {product.status === 'APPROVED' && (
            <ProductQuestions product={product} isOwnProduct={Boolean(user?.id && product.store?.owner?.id === user.id)} />
          )}

          {/* Phones: the same shop's products, or similar ones, in a row. */}
          {isPhone && (sameShopProducts.length > 0 || relatedProducts.length > 0) && (
            <div className="pdp-m-shelf">
              <div className="pdp-m-shelf-tabs" role="tablist">
                {[['same', 'Same store', sameShopProducts], ['similar', 'Similar items', relatedProducts]]
                  .filter(([, , list]) => list.length > 0)
                  .map(([key, label], i, all) => {
                    const active = shelfTab === key || (all.length === 1) || (!all.some(([k]) => k === shelfTab) && i === 0);
                    return (
                      <button type="button" role="tab" key={key} aria-selected={active} className={active ? 'is-active' : ''} onClick={() => setShelfTab(key)}>
                        {label}
                      </button>
                    );
                  })}
              </div>
              <div className="pdp-m-shelf-row">
                {((shelfTab === 'similar' && relatedProducts.length) || !sameShopProducts.length ? relatedProducts : sameShopProducts).slice(0, 12).map((p) => (
                  <div key={p.id} className="pdp-m-shelf-card">
                    <Link to={`/product/${p.slug}`} className="pdp-m-shelf-img"><ProductImage src={parseImages(p.images)[0]} alt={p.name} /></Link>
                    <Link to={`/product/${p.slug}`} className="pdp-m-shelf-name">{p.name}</Link>
                    <span className="pdp-m-shelf-foot">
                      <b><KindPrice product={p}>{peso(saleInfo(p).price)}</KindPrice></b>
                      <button type="button" aria-label={`Add ${p.name} to cart`} onClick={() => quickAdd(p)}><Plus size={14} weight="bold" /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* From the same shop */}
          {!isPhone && sameShopProducts.length > 0 && product.store && (
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
                      <span className="product-name"><ProductTodayTag product={p} />{p.name}</span>
                      <span className="product-price"><KindPrice product={p}>{peso(saleInfo(p).price)}</KindPrice> <SaleWas product={p} compact /></span>
                      {renderShelfRating(p)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* You may also like */}
          {relatedProducts.length > 0 && (
            <div className="pdp-shelf pdp-shelf-related" id="pdp-foryou">
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
                      <span className="product-name"><ProductTodayTag product={p} />{p.name}</span>
                      <span className="product-price"><KindPrice product={p}>{peso(saleInfo(p).price)}</KindPrice> <SaleWas product={p} compact /></span>
                      {renderShelfRating(p)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isPhone && kind === 'LIVESTOCK' && (
        <LivestockDeal
          variant="bar"
          product={product}
          listPrice={unitPrice}
          cannotBuy={cannotBuy}
          closedLabel={notTakingOrders ? closedLabel : soldOutLabel(product)}
          shopLogo={shopLogo && failedLogo !== shopLogo ? shopLogo : null}
          chatUnread={chatUnread}
        />
      )}

      {isPhone && kind !== 'LIVESTOCK' && (
        <div className="pdp-m-actionbar">
          <Link to={product.store ? `/store/${product.store.slug}` : '/stores'} className="pdp-m-action">
            {shopLogo && failedLogo !== shopLogo
              ? <img className="pdp-m-shoplogo" src={shopLogo} alt="" onError={() => setFailedLogo(shopLogo)} />
              : <Store size={21} />}
            <span>Shop</span>
          </Link>
          <Link to={product.store ? `/messages?store=${product.store.id}` : '/messages'} className="pdp-m-action">
            <span className="pdp-m-action-icon">
              <MessageCircle size={21} />
              {chatUnread > 0 && <b className="pdp-m-action-badge">{chatUnread > 99 ? '99+' : chatUnread}</b>}
            </span>
            <span>Chat</span>
          </Link>
          {cannotBuy ? (
            <button type="button" className="pdp-m-buy pdp-m-closed" disabled>
              <span>{notTakingOrders ? closedLabel : soldOutLabel(product)}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="pdp-m-addcart"
                onClick={() => setSheetMode('cart')}
                disabled={isAddingToCart}
                aria-label="Add to cart"
              >
                <ShoppingCartSimple size={26} />
                <Plus size={11} weight="bold" className="pdp-m-plus" />
              </button>
              <button
                type="button"
                className="pdp-m-buy"
                onClick={() => setSheetMode('buy')}
                disabled={isAddingToCart}
              >
                <span>Buy now</span>
                <small>
                  {optionPriced && !optionChosen ? `from ${peso(range.min)}` : peso(unitPrice * quantity)}
                  {buyNote && <><i aria-hidden="true" />{buyNote}</>}
                </small>
              </button>
            </>
          )}
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
          limits={{ least: leastQty, most: mostQty }}
          stockText={isStockless(product) ? 'Cooked when you order' : kind === 'LIVESTOCK' ? headsLabel(product.stock) : null}
          soldOutText={soldOutLabel(product)}
          priceFrom={startsFrom(product)}
          priceUnit={priceUnit(product)}
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
