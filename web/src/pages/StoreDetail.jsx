import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { Link, useParams, useNavigate } from 'react-router-dom';
import useSeo, { storeSchema, breadcrumbs, clampText } from '../lib/seo';
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
  SealCheck,
  ShareNetwork,
  Truck,
  Storefront,
  Money,
  Clock,
  User,
  Rows,
  GridFour,
  ArrowUp,
  ArrowDown,
  SquaresFour,
  Info,
  Plus,
  AirplaneTilt,
  Ticket,
  Copy,
} from '../lib/icons';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import LoadFailed from '../components/ui/LoadFailed';
import ReportModal from '../components/ReportModal';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ProductImage from '../components/ProductImage';
import {
  followStore as apiFollowStore,
  unfollowStore as apiUnfollowStore,
  getFollowStatus,
  subscribeToFollowChanges,
} from '../lib/follow';
import useCartStore, { standaloneLine } from '../store/cartStore';
import { startBuyNow } from '../lib/buyNow';
import useAuthStore from '../store/authStore';
import { usePhoneLayout } from '../hooks/useMobileNav';
import useEntryState from '../hooks/useEntryState';
import { readCache, writeCache } from '../lib/pageCache';
import MoreMenu from '../components/MoreMenu';
import { useShare } from '../components/ShareSheet';
import './StoreDetail.css';
import ShopHome from '../components/shop/ShopHome';
import { awayUntil, shortDate, nowLabel, weekLines } from '../lib/shopHours';
import { saleInfo } from '../lib/variantPricing';
import { voucherSummary } from '../lib/vouchers';
import { SaleWas } from '../components/ui/SaleTag';
import KindPrice from '../components/product/kinds/KindPrice';
import { isStockless, productKind } from '../lib/productKinds';
import { StoreSkeleton } from '../components/ui/PageSkeletons';
import Spinner, { BusyLabel } from '../components/ui/Spinner';
import { ProductTodayTag } from '../components/today/TodayTag';
import { notTakingOrders, opensLabel } from '../lib/availability';
import Select from '../components/ui/Select';
import useProductPeek from '../components/peek/useProductPeek';

const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'price_asc', label: 'Price: Low to High', sortBy: 'price', sortOrder: 'asc' },
  { key: 'price_desc', label: 'Price: High to Low', sortBy: 'price', sortOrder: 'desc' },
  { key: 'best', label: 'Best Selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'popular', label: 'Most Popular', sortBy: 'orderCount', sortOrder: 'desc' },
];

const PAGE_SIZE = 16;
// A shop as it showed last time, and each list of its products.
const storeKey = (slug) => `store:${slug}`;
const productsKey = (storeId, page, category, sort, search) => (
  `store-products:${storeId}:${JSON.stringify([page, category, sort, search.trim()])}`
);
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
  const { addItem, getItemCount } = useCartStore();
  const cartCount = getItemCount();
  const isPhone = usePhoneLayout();
  // Phones: the top bar lies over the cover photo, and turns white (smoothly)
  // once the page is scrolled past it.
  const [barSolid, setBarSolid] = useState(false);
  useEffect(() => {
    if (!isPhone) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBarSolid(window.scrollY > 120));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isPhone]);
  // The shop's own voucher codes buyers can use now.
  const [shopVouchers, setShopVouchers] = useState([]);
  // What was picked on this visit of the shop, so Back finds it as it was
  // left. Phones: Products / Categories / About, list or grid, product search.
  const [mobileTab, setMobileTab] = useEntryState('tab', 'home');
  // Computers: Home (the seller's sections) or the product list.
  const [deskTab, setDeskTab] = useEntryState('view', 'home');
  // The shop's Home tab: null while it loads, [] when the seller made none.
  const [home, setHome] = useState(null);
  const [mobileLayout, setMobileLayout] = useEntryState('layout', 'list');
  const [searchOpen, setSearchOpen] = useEntryState('searchOpen', false);
  // Only a search opened just now takes the keyboard, not one Back reopens.
  const [focusSearch, setFocusSearch] = useState(false);
  const [page, setPage] = useEntryState('page', 1);
  const [activeCategory, setActiveCategory] = useEntryState('category', 'all');
  const [sortKey, setSortKey] = useEntryState('sort', 'newest');
  const [rawSearch, setRawSearch] = useEntryState('search', '');
  const search = useDebounce(rawSearch, 350);

  // The shop and its products as they showed last time: shown at once while
  // they are asked for again.
  const [store, setStore] = useState(() => readCache(storeKey(slug)) || null);
  const [keptProducts] = useState(() => (store
    ? readCache(productsKey(store.id, page, activeCategory, sortKey, search))
    : undefined));
  const [products, setProducts] = useState(() => keptProducts?.products || []);
  const [pagination, setPagination] = useState(() => keptProducts?.pagination || { total: 0, totalPages: 0 });
  const [isLoadingStore, setIsLoadingStore] = useState(() => !store);
  // The shop could not be asked for (offline, the server busy) and no copy
  // of it is saved: say so, with Try again, rather than a blank page.
  const [storeFailed, setStoreFailed] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(() => !keptProducts);
  const [showReport, setShowReport] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const { share, shareSheet } = useShare();
  // Only the latest request is shown: an earlier one can answer after it.
  const storeRequest = useRef(0);
  const productsRequest = useRef(0);

  // Changes the shop shown, and what is remembered of it.
  const updateStore = useCallback((change) => setStore((cur) => {
    const next = typeof change === 'function' ? change(cur) : change;
    if (next?.slug) writeCache(storeKey(next.slug), next);
    return next;
  }), []);

  useEffect(() => {
    fetchStore();
  }, [slug]);

  useEffect(() => {
    if (store) fetchProducts();
    // Keyed on the store id: following it must not reload the products.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, page, activeCategory, sortKey, search]);

  const fetchStore = async () => {
    const request = ++storeRequest.current;
    const kept = readCache(storeKey(slug));
    setStoreFailed(false);
    if (kept) {
      setStore(kept);
      setIsLoadingStore(false);
    } else {
      // Not the shop of the page before.
      setStore(null);
      setIsLoadingStore(true);
    }
    try {
      const res = await axios.get(`/stores/slug/${slug}/storefront`);
      if (request !== storeRequest.current) return;
      const fresh = res.data;
      // The storefront is cached for everyone, so it carries no "you follow
      // this" and its count can lag; the live values come just below (until
      // then, what this account saw last time).
      updateStore((cur) => {
        const seen = cur && cur.id === fresh?.id ? cur : null;
        return {
          ...fresh,
          isFollowing: seen ? !!seen.isFollowing : false,
          followerCount: seen ? seen.followerCount : (fresh?.stats?.followerCount ?? 0),
        };
      });
      if (fresh?.id) {
        getFollowStatus(fresh.id)
          .then((st) => updateStore((cur) => (cur && cur.id === fresh.id
            ? { ...cur, isFollowing: !!st.following, followerCount: st.followerCount ?? cur.followerCount }
            : cur)))
          .catch(() => { /* keep the cached count */ });
      }
    } catch (err) {
      if (request !== storeRequest.current) return;
      if (err.status === 404) {
        // Gone (or hidden now): forget the saved copy too.
        writeCache(storeKey(slug), null);
        navigate('/stores');
      } else if (kept) {
        toast.error('Could not refresh this shop. Showing what was saved.');
      } else {
        setStoreFailed(true);
      }
    } finally {
      if (request === storeRequest.current) setIsLoadingStore(false);
    }
  };

  const fetchProducts = async () => {
    const request = ++productsRequest.current;
    const key = productsKey(store.id, page, activeCategory, sortKey, search);
    const kept = readCache(key);
    if (kept) {
      setProducts(kept.products || []);
      if (kept.pagination) setPagination(kept.pagination);
      setIsLoadingProducts(false);
    } else {
      setIsLoadingProducts(true);
    }
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
      if (request !== productsRequest.current) return;
      const list = res.data || [];
      setProducts(list);
      if (res.pagination) setPagination(res.pagination);
      // The shop's first page is saved on the device; a category, a search
      // or another page, for this visit.
      const firstView = page === 1 && activeCategory === 'all' && sortKey === 'newest' && !search.trim();
      writeCache(key, {
        products: list,
        pagination: res.pagination || { total: list.length, totalPages: 1 },
      }, { visitOnly: !firstView });
    } catch {
      if (request === productsRequest.current) toast.error('Failed to load products');
    } finally {
      if (request === productsRequest.current) setIsLoadingProducts(false);
    }
  };

  const handleAddToCart = (e, product) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    // Live animals are bought by making an offer on their page.
    if (productKind(product) === 'LIVESTOCK') { navigate(`/product/${product.slug}`); return; }
    if (!isAuthenticated) {
      toast.error('Please login to add items to cart');
      return;
    }
    try {
      addItem({ ...product, readyToSell: store.readyToSell, vacationUntil: store.vacationUntil, quantity: 1 });
      toast.success(`${product.name} added to cart`);
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
    }
  };

  // Phones: the same rules as the product list (options and animals are
  // chosen on the product page), and guests may fill a cart, as on the
  // product page.
  const needsProductPage = (product) => {
    if (productKind(product) === 'LIVESTOCK' || (Array.isArray(product.variations) && product.variations.length > 0)) {
      navigate(`/product/${product.slug}`);
      return true;
    }
    return false;
  };
  const phoneLine = (product) => ({
    id: product.id,
    productId: product.id,
    name: product.name,
    price: saleInfo(product).price,
    image: (Array.isArray(product.images) ? product.images[0] : null) || '/placeholder-product.png',
    storeId: store.id,
    storeName: store.name,
    storeLogo: store.logo || null,
    readyToSell: store.readyToSell,
    vacationUntil: store.vacationUntil,
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
  });
  const addToCartPhone = (product) => {
    if (needsProductPage(product)) return false;
    try {
      addItem(phoneLine(product), 1);
      toast.success(`${product.name} added to cart`);
      return true;
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
      return false;
    }
  };

  // Straight to checkout with just this item (one, or a paluto's minimum
  // order), leaving the cart as it is (lib/buyNow).
  const buyNowPhone = (product) => {
    if (needsProductPage(product)) return;
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/store/${slug}`)}`);
      return;
    }
    try {
      startBuyNow(navigate, [standaloneLine(phoneLine(product), 1)]);
    } catch (error) {
      toast.error(error.message || 'This item can\'t be bought right now');
    }
  };

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/store/${slug}`)}`);
      return;
    }
    if (!store || store.ownerId === user?.id) return;
    setFollowBusy(true);
    try {
      const wasFollowing = !!store.isFollowing;
      const res = wasFollowing
        ? await apiUnfollowStore(store.id)
        : await apiFollowStore(store.id);
      updateStore((s) => (s ? { ...s, isFollowing: res.following, followerCount: res.followerCount } : s));
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
      updateStore((s) => (s ? {
        ...s,
        isFollowing: msg.type === 'follow' ? true : msg.type === 'unfollow' ? false : s.isFollowing,
        followerCount: msg.data?.followerCount ?? s.followerCount,
      } : s));
    });
  }, [store?.id, updateStore]);

  useEffect(() => {
    if (!store?.id) return undefined;
    let cancelled = false;
    axios.get('/vouchers/store/' + store.id)
      .then((res) => { if (!cancelled) setShopVouchers(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [store?.id]);

  const onCategoryChange = useCallback((id) => {
    setActiveCategory(id);
    setPage(1);
  }, [setActiveCategory, setPage]);

  const onSortChange = (key) => {
    setSortKey(key);
    setPage(1);
  };

  const onSearchChange = (val) => {
    setRawSearch(val);
    setPage(1);
  };

  useEffect(() => {
    if (!store?.slug) return undefined;
    let cancelled = false;
    axios.get(`/stores/slug/${store.slug}/home`)
      .then((res) => { if (!cancelled) setHome(res.data?.sections || []); })
      .catch(() => { if (!cancelled) setHome([]); });
    return () => { cancelled = true; };
  }, [store?.slug]);
  const hasHome = Array.isArray(home) && home.length > 0;
  // Home while it loads; a shop without one opens on its products.
  const phoneTab = mobileTab === 'home' ? (home === null || hasHome ? 'home' : 'products') : mobileTab;
  const deskView = deskTab === 'home' && hasHome ? 'home' : 'products';
  // Home's product tiles: options are picked on the product page.
  const addFromHome = (e, product) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    addToCartPhone(product);
  };

  const themeStyle = useMemo(() => {
    const primary = store?.primaryColor || DEFAULT_PRIMARY;
    const secondary = store?.secondaryColor || DEFAULT_SECONDARY;
    return {
      '--shop-primary': primary,
      '--shop-secondary': secondary,
    };
  }, [store?.primaryColor, store?.secondaryColor]);

  // Above every early return, so the hook order is the same whether the
  // shop is loading, missing or loaded.
  useSeo({
    ready: Boolean(store),
    title: store
      ? `${store.name} — Local shop in ${store.municipality?.name || 'Oriental Mindoro'}`
      : '',
    description: store
      ? clampText(store.description
        || `${store.name} sells locally made products on E-MOORM`
        + `${store.municipality?.name ? `, based in ${store.municipality.name}` : ''}.`)
      : '',
    image: store
      ? resolveImg(store.bannerImage || store.coverImage || store.logo)
      : undefined,
    path: store ? `/store/${store.slug}` : undefined,
    jsonLd: store
      ? [
        storeSchema({
          name: store.name,
          description: clampText(store.description),
          image: resolveImg(store.bannerImage || store.coverImage || store.logo),
          slug: store.slug,
          municipality: store.municipality?.name,
        }),
        breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Shops', path: '/stores' },
          { name: store.name, path: `/store/${store.slug}` },
        ]),
      ]
      : undefined,
  });

  if (isLoadingStore) {
    return (
      <Layout>
        <StoreSkeleton />
      </Layout>
    );
  }

  if (!store) {
    return storeFailed
      ? <Layout><LoadFailed what="this shop" onRetry={fetchStore} page /></Layout>
      : null;
  }

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
  // Away: products on show, no orders until the date (Shop Settings).
  const away = awayUntil(store);
  const hoursNow = nowLabel(store);
  const week = weekLines(store);
  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).then(() => toast.success(code + ' copied. Paste it at checkout.')).catch(() => toast(code));
  };
  const voucherStrip = shopVouchers.length > 0 && (
    <div className="shop-vouchers" aria-label="Shop vouchers">
      {shopVouchers.map((v) => (
        <button type="button" key={v.id} className="shop-voucher" onClick={() => copyCode(v.code)}>
          <Ticket size={18} weight="fill" />
          <span>
            <b>{voucherSummary(v)}</b>
            <small>{v.code} · Tap to copy</small>
          </span>
        </button>
      ))}
    </div>
  );
  const awayNotice = away && (
    <div className="shop-away" role="status">
      <AirplaneTilt size={18} weight="fill" />
      <div>
        <strong>Away until {shortDate(away)}</strong>
        <span>{store.vacationNote || 'You can look around and follow the shop. Ordering opens when they are back.'}</span>
      </div>
    </div>
  );
  const categories = Array.isArray(store.categories) ? store.categories : [];
  const offersDelivery = store.fulfillmentMode === 'DELIVERY' || store.fulfillmentMode === 'BOTH';
  const offersPickup = store.fulfillmentMode === 'PICKUP' || store.fulfillmentMode === 'BOTH';

  const openReport = () => {
    if (!isAuthenticated) {
      toast.error('Please login to report');
      return;
    }
    setShowReport(true);
  };

  const openChat = () => {
    if (!isAuthenticated) {
      toast.error('Please login to chat');
      return;
    }
    navigate(`/messages?store=${store.id}`);
  };

  // The device's share menu where there is one, otherwise the app list.
  const shareStore = () => share({
    title: store.name,
    text: `Shop local at ${store.name} on E-MOORM`,
    url: `${window.location.origin}/store/${store.slug}`,
  });

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/stores'));
  const perkLabels = [
    offersDelivery && 'Delivery',
    offersPickup && 'Pickup',
    store.acceptsCod && 'COD',
  ].filter(Boolean);
  const activeCategoryName = categories.find((c) => c.id === activeCategory)?.name;
  const priceSort = sortKey === 'price_asc' || sortKey === 'price_desc';
  const openSearch = () => {
    setMobileTab('products');
    setSearchOpen(true);
    setFocusSearch(true);
  };
  const pickCategory = (id) => {
    onCategoryChange(id);
    setMobileTab('products');
  };

  return (
    <Layout phoneBar={false}>
      <div className={`shop-page${isPhone ? ' is-phone' : ''}`} style={themeStyle}>
        {isPhone && (
          <>
            {/* Solid, and held at the top while the page scrolls. */}
            <div className={`shop-m-topbar${barSolid ? ' is-solid' : ''}`}>
              <button type="button" className="shop-m-icon" onClick={goBack} aria-label="Back">
                <ChevronLeft size={24} weight="bold" />
              </button>
              <div className="shop-m-topbar-right">
                <button type="button" className="shop-m-icon" onClick={openSearch} aria-label="Search this shop">
                  <Search size={22} />
                </button>
                <button type="button" className="shop-m-icon" onClick={shareStore} aria-label="Share shop">
                  <ShareNetwork size={22} />
                </button>
                <Link to="/cart" className="shop-m-icon shop-m-cart" aria-label={`Cart, ${cartCount} items`}>
                  <ShoppingCart size={22} />
                  {cartCount > 0 && <b>{cartCount > 99 ? '99+' : cartCount}</b>}
                </Link>
                <MoreMenu
                  className="shop-m-more"
                  buttonClassName="shop-m-icon"
                  label="Shop options"
                  iconSize={22}
                  items={[
                    { key: 'about', icon: <Info size={17} />, label: 'About this shop', onClick: () => setMobileTab('about') },
                    { key: 'all', icon: <Storefront size={17} />, label: 'All stores', to: '/stores' },
                    !isOwnStore && { key: 'report', icon: <Flag size={17} />, label: 'Report shop', onClick: openReport },
                  ]}
                />
              </div>
            </div>

            <div className="shop-m-hero">
              <div className="shop-m-backdrop" aria-hidden="true">
                {banner ? <img src={resolveImg(banner)} alt="" /> : null}
              </div>

              <div className="shop-m-card">
                <button type="button" className="shop-m-band" onClick={() => setMobileTab('about')}>
                  <span className="shop-m-band-brand">
                    <Storefront size={15} weight="fill" /> Local shop
                    {store.owner?.identityVerified && <SealCheck size={14} weight="fill" className="shop-m-band-seal" />}
                  </span>
                  <span className="shop-m-band-perks">
                    {perkLabels.length ? perkLabels.join(' · ') : (store.municipality?.name || 'Oriental Mindoro')}
                    <ChevronRight size={13} weight="bold" />
                  </span>
                </button>

                <div className="shop-m-main">
                  <div className="shop-m-logo">
                    {store.logo ? <img src={resolveImg(store.logo)} alt="" /> : <span>{initials}</span>}
                  </div>
                  <div className="shop-m-id-text">
                    <button type="button" className="shop-m-name" onClick={() => setMobileTab('about')}>
                      <h1>{store.name}</h1>
                      <ChevronRight size={15} weight="bold" />
                    </button>
                    <div className="shop-m-rating-row">
                      {rating > 0 ? (
                        <span className="shop-m-rating"><Star size={12} weight="fill" /> {rating.toFixed(1)}</span>
                      ) : (
                        <span className="shop-m-rating is-new">New</span>
                      )}
                      <span className="shop-m-counts">
                        {productCount} {productCount === 1 ? 'product' : 'products'} · {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
                      </span>
                    </div>
                  </div>
                  <div className="shop-m-cta">
                    {!isOwnStore && (
                      <button
                        type="button"
                        className={`shop-m-follow${isFollowing ? ' is-following' : ''}`}
                        onClick={handleToggleFollow}
                        disabled={followBusy}
                      >
                        {followBusy
                          ? <BusyLabel size={14}>{isFollowing ? 'Following' : 'Follow'}</BusyLabel>
                          : isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                    <button type="button" className="shop-m-message" onClick={openChat}>Message</button>
                  </div>
                </div>

                {(store.description || store.municipality?.name) && (
                  <div className="shop-m-note">
                    <div className="shop-m-note-text">
                      <strong>
                        <MapPin size={13} weight="fill" /> {store.municipality?.name || 'Oriental Mindoro'}
                      </strong>
                      {store.description && <span>{store.description}</span>}
                    </div>
                    <button type="button" onClick={() => setMobileTab('about')}>View</button>
                  </div>
                )}
              </div>

              {awayNotice}
              {voucherStrip}

              <div className="shop-m-tabs" role="tablist">
                {[
                  ...(home === null || hasHome ? [['home', 'Home']] : []),
                  ['products', 'Products'],
                  ['categories', 'Categories'],
                  ['about', 'About'],
                ].map(([key, label]) => (
                  <button
                    type="button"
                    role="tab"
                    key={key}
                    aria-selected={phoneTab === key}
                    className={`shop-m-tab${phoneTab === key ? ' is-active' : ''}`}
                    onClick={() => setMobileTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {phoneTab === 'home' && (
                <div className="shop-m-panel shop-m-home">
                  {home === null
                    ? <div className="shop-m-home-loading" aria-hidden="true"><span /><span /><span /></div>
                    : <ShopHome sections={home} onAddToCart={addFromHome} />}
                </div>
              )}

              {phoneTab === 'categories' && (
                <div className="shop-m-panel">
                  {categories.length === 0 ? (
                    <div className="shop-m-muted shop-m-empty-cats">
                      <EmptyArt name="categories" size={72} />
                      <p>This shop hasn&rsquo;t sorted its products into categories yet.</p>
                    </div>
                  ) : (
                    <div className="shop-m-cats">
                      <button type="button" className="shop-m-cat" onClick={() => pickCategory('all')}>
                        <span className="shop-m-cat-all"><SquaresFour size={26} weight="fill" /></span>
                        <strong>All products</strong>
                        <small>{productCount}</small>
                      </button>
                      {categories.map((c) => (
                        <button type="button" key={c.id} className="shop-m-cat" onClick={() => pickCategory(c.id)}>
                          <span className="shop-m-cat-img">
                            {c.image ? <img src={resolveImg(c.image)} alt="" /> : <Package size={24} />}
                          </span>
                          <strong>{c.name}</strong>
                          <small>{c.count ?? ''}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {phoneTab === 'about' && (
                <div className="shop-m-panel">
                  {store.description && <p className="shop-m-about-desc">{store.description}</p>}
                  <div className="shop-m-about-stats">
                    <div><strong>{rating > 0 ? rating.toFixed(1) : '—'}</strong><span>{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</span></div>
                    <div><strong>{productCount}</strong><span>{productCount === 1 ? 'product' : 'products'}</span></div>
                    <div><strong>{followerCount}</strong><span>{followerCount === 1 ? 'follower' : 'followers'}</span></div>
                  </div>
                  {(offersDelivery || offersPickup || store.acceptsCod) && (
                    <div className="shop-m-perks">
                      {offersDelivery && <span><Truck size={14} /> Delivery</span>}
                      {offersPickup && <span><Storefront size={14} /> Pickup</span>}
                      {store.acceptsCod && <span><Money size={14} /> Cash on delivery</span>}
                    </div>
                  )}
                  <ul className="shop-m-details">
                    {store.owner?.fullName && (
                      <li><User size={15} /><span className="shop-m-details-label">Seller</span><span>{store.owner.fullName}</span></li>
                    )}
                    {store.owner?.identityVerified && (
                      <li><SealCheck size={15} /><span className="shop-m-details-label">ID</span><span>Seller identity verified</span></li>
                    )}
                    {store.municipality?.name && (
                      <li><MapPin size={15} /><span className="shop-m-details-label">Town</span><span>{store.municipality.name}</span></li>
                    )}
                    {store.pickupAddress && (
                      <li><Storefront size={15} /><span className="shop-m-details-label">Pickup</span><span>{store.pickupAddress}</span></li>
                    )}
                    {week.length > 0 ? (
                      <li>
                        <Clock size={15} /><span className="shop-m-details-label">Hours</span>
                        <span className="shop-hours">
                          {hoursNow && <b className={hoursNow.startsWith('Open') ? 'is-open' : ''}>{hoursNow}</b>}
                          {week.map((line) => <span key={line}>{line}</span>)}
                        </span>
                      </li>
                    ) : store.businessHours && (
                      <li><Clock size={15} /><span className="shop-m-details-label">Hours</span><span>{store.businessHours}</span></li>
                    )}
                    {store.createdAt && (
                      <li><Package size={15} /><span className="shop-m-details-label">Joined</span><span>{new Date(store.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></li>
                    )}
                  </ul>
                  {!isOwnStore && (
                    <button type="button" className="shop-m-report" onClick={openReport}>
                      <Flag size={15} /> Report this shop
                    </button>
                  )}
                </div>
              )}

              {phoneTab === 'products' && (
                <div className="shop-m-sortbar">
                  <div className="shop-m-sorts" role="toolbar" aria-label="Sort products">
                    <button
                      type="button"
                      className={sortKey === 'newest' ? 'is-active' : ''}
                      onClick={() => onSortChange('newest')}
                    >
                      Newest
                    </button>
                    <button
                      type="button"
                      className={sortKey === 'popular' || sortKey === 'best' ? 'is-active' : ''}
                      onClick={() => onSortChange('popular')}
                    >
                      Popular
                    </button>
                    <button
                      type="button"
                      className={priceSort ? 'is-active' : ''}
                      onClick={() => onSortChange(sortKey === 'price_asc' ? 'price_desc' : 'price_asc')}
                      aria-label={sortKey === 'price_desc' ? 'Price, high to low' : 'Price, low to high'}
                    >
                      Price
                      {priceSort && (sortKey === 'price_desc' ? <ArrowDown size={12} weight="bold" /> : <ArrowUp size={12} weight="bold" />)}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="shop-m-layout"
                    onClick={() => setMobileLayout((v) => (v === 'list' ? 'grid' : 'list'))}
                    aria-label={mobileLayout === 'list' ? 'Show as grid' : 'Show as list'}
                  >
                    {mobileLayout === 'list' ? <GridFour size={20} /> : <Rows size={20} />}
                  </button>
                </div>
              )}

              {phoneTab === 'products' && (searchOpen || rawSearch || activeCategory !== 'all') && (
                <div className="shop-m-filters">
                  {(searchOpen || rawSearch) && (
                    <div className="shop-m-search">
                      <Search size={17} />
                      <input
                        type="search"
                        enterKeyHint="search"
                        value={rawSearch}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={`Search ${store.name}`}
                        aria-label="Search this shop"
                        autoFocus={focusSearch && !rawSearch}
                      />
                      <button
                        type="button"
                        onClick={() => { onSearchChange(''); setSearchOpen(false); }}
                        aria-label="Close search"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  )}
                  {activeCategory !== 'all' && activeCategory !== 'new' && activeCategoryName && (
                    <button type="button" className="shop-m-activecat" onClick={() => onCategoryChange('all')}>
                      {activeCategoryName} <X size={12} weight="bold" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Hero (computers; phones have their own header above): the cover,
            then the shop's logo, name, one line of numbers and its actions,
            then a short about. */}
        <div className="shop-hero">
          <div className="shop-container">
            <nav className="shop-breadcrumbs">
              <Link to="/">Home</Link>
              <ChevronRight size={12} />
              <Link to="/stores">Stores</Link>
              <ChevronRight size={12} />
              <span>{store.name}</span>
            </nav>

            <div className="shop-profile">
            <div className="shop-hero-banner">
              {banner ? (
                <img src={resolveImg(banner)} alt="" />
              ) : (
                <div className="shop-hero-banner-fallback" />
              )}
            </div>

            <div className="shop-profile-body">
            <div className="shop-hero-card">
              <div className="shop-avatar">
                {store.logo ? (
                  <img src={resolveImg(store.logo)} alt={store.name} />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div className="shop-hero-title">
                <h1>
                  {store.name}
                  {store.owner?.identityVerified && (
                    <span className="shop-verified" title="Seller verified: identity checked with a government ID">
                      <SealCheck size={22} weight="fill" aria-label="Seller verified" />
                    </span>
                  )}
                </h1>
                {store.description && (
                  <p className="shop-tagline" title={store.description}>{store.description}</p>
                )}
              </div>

              <div className="shop-hero-actions">
                {!isOwnStore && (
                  <button
                    type="button"
                    className={`shop-btn ${isFollowing ? 'shop-btn-outline is-following' : 'shop-btn-primary'}`}
                    onClick={handleToggleFollow}
                    disabled={followBusy}
                  >
                    {followBusy ? <Spinner size={15} /> : <Heart size={15} weight={isFollowing ? 'fill' : 'regular'} />}
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                <button type="button" className="shop-btn shop-btn-outline" onClick={openChat}>
                  <MessageCircle size={15} /> Message
                </button>
                <MoreMenu
                  label="More for this shop"
                  className="shop-hero-more"
                  buttonClassName="shop-btn shop-btn-outline shop-btn-icon"
                  iconSize={18}
                  items={[
                    { key: 'share', icon: <ShareNetwork />, label: 'Share shop', onClick: shareStore },
                    { key: 'report', icon: <Flag />, label: 'Report shop', onClick: openReport, danger: true },
                  ]}
                />
              </div>
            </div>

            {/* One line under it all: the numbers, the shop's facts as icon
                chips (details on hover), and its vouchers. */}
            <div className="shop-profile-foot">
              <ul className="shop-stats">
                <li title={reviewCount > 0 ? `${rating.toFixed(1)} from ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}>
                  <b><Star size={15} weight="fill" className="shop-meta-star" />{rating > 0 ? rating.toFixed(1) : 'New'}</b>
                  <span>{reviewCount > 0 ? `${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'Rating'}</span>
                </li>
                <li>
                  <b>{productCount}</b>
                  <span>{productCount === 1 ? 'Product' : 'Products'}</span>
                </li>
                <li>
                  <b>{followerCount}</b>
                  <span>{followerCount === 1 ? 'Follower' : 'Followers'}</span>
                </li>
              </ul>

              <ul className="shop-facts">
                {store.municipality?.name && (
                  <li title={store.pickupAddress ? `${store.pickupAddress}, ${store.municipality.name}` : store.municipality.name}>
                    <MapPin size={15} weight="fill" /> {store.municipality.name}
                  </li>
                )}
                {(hoursNow || store.businessHours) && (
                  <li
                    className={hoursNow?.startsWith('Open') ? 'is-open' : undefined}
                    title={week.length > 0 ? week.join('\n') : store.businessHours}
                  >
                    <Clock size={15} weight="fill" /> {hoursNow || 'Hours'}
                  </li>
                )}
                {offersDelivery && <li><Truck size={15} weight="fill" /> Delivery</li>}
                {offersPickup && <li><Storefront size={15} weight="fill" /> Pickup</li>}
                {store.acceptsCod && <li title="Cash on delivery"><Money size={15} weight="fill" /> COD</li>}
                {store.owner?.fullName && (
                  <li title="Seller"><User size={15} weight="fill" /> {store.owner.fullName}</li>
                )}
              </ul>

              {shopVouchers.length > 0 && (
                <div className="shop-tickets" aria-label="Shop vouchers">
                  {shopVouchers.map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      className="shop-ticket"
                      onClick={() => copyCode(v.code)}
                      title={`Copy ${v.code}`}
                    >
                      <Ticket size={15} weight="fill" />
                      <b>{voucherSummary(v)}</b>
                      <code>{v.code}</code>
                      <Copy size={13} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            </div>
            </div>
          </div>
        </div>

        {/* Away notice (computers) */}
        {!isPhone && awayNotice && (
          <div className="shop-container">
            {awayNotice}
          </div>
        )}

        {/* Products */}
        <div className={`shop-container shop-products-section${isPhone && phoneTab !== 'products' ? ' is-hidden-phone' : ''}`}>
          {/* One row: the tabs, then search and sort (computers). */}
          <div className="shop-toolbar">
            <div className="shop-tabs">
              {hasHome && !isPhone && (
                <button
                  type="button"
                  className={`shop-tab shop-tab-home ${deskView === 'home' ? 'is-active' : ''}`}
                  onClick={() => setDeskTab('home')}
                >
                  Home
                </button>
              )}
              <button
                type="button"
                className={`shop-tab ${deskView !== 'home' && activeCategory === 'all' ? 'is-active' : ''}`}
                onClick={() => { setDeskTab('products'); onCategoryChange('all'); }}
              >
                All Products
              </button>
              <button
                type="button"
                className={`shop-tab ${deskView !== 'home' && activeCategory === 'new' ? 'is-active' : ''}`}
                onClick={() => { setDeskTab('products'); onCategoryChange('new'); }}
              >
                New Listings
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`shop-tab ${deskView !== 'home' && activeCategory === c.id ? 'is-active' : ''}`}
                  onClick={() => { setDeskTab('products'); onCategoryChange(c.id); }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="shop-toolbar-right">
              <div className="shop-search">
                <Search size={16} />
                <input
                  type="text"
                  value={rawSearch}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={`Search ${store.name}`}
                  aria-label="Search this shop's products"
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
                <Select value={sortKey} onChange={(e) => onSortChange(e.target.value)} aria-label="Sort products">
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {/* Home (computers), or the grid */}
          {!isPhone && deskView === 'home' ? (
            <div className="shop-desk-home">
              <ShopHome sections={home} onAddToCart={addFromHome} />
            </div>
          ) : isLoadingProducts ? (
            <div className="shop-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="shop-product-skeleton" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="shop-empty">
              <EmptyArt name={search ? 'search' : 'products'} size={isPhone ? 88 : 104} />
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
          ) : isPhone && mobileLayout === 'list' ? (
            <div className="shop-m-list">
              {products.map((product) => (
                <PhoneProductRow
                  key={product.id}
                  product={product}
                  store={store}
                  onAdd={() => addToCartPhone(product)}
                  onBuy={() => buyNowPhone(product)}
                  closed={store.readyToSell === false || Boolean(away)}
                />
              ))}
            </div>
          ) : (
            <div className="shop-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  store={store}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!(!isPhone && deskView === 'home') && pagination.totalPages > 1 && (
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
      {shareSheet}
    </Layout>
  );
}

function ProductCard({ product, store, onAddToCart }) {
  const peekProduct = useProductPeek();
  const { price } = saleInfo(product);
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images[0] || null;

  return (
    <Link to={`/product/${product.slug}`} className="product-card" {...peekProduct(product, { store })}>
      <div className="product-image">
        <ProductImage src={image} alt={product.name} />
        {/* On the shop's menu, not posted now: nothing to add yet. */}
        {!notTakingOrders(product) && (
        <button
          type="button"
          className="product-cart-fab"
          onClick={(e) => onAddToCart(e, product)}
          aria-label="Add to cart"
        >
          <ShoppingCart size={16} />
        </button>
        )}
      </div>
      <div className="product-info">
        <span className="product-name"><ProductTodayTag product={product} />{product.name}</span>
        <span className="product-price"><KindPrice product={product}>₱{price.toFixed(2)}</KindPrice> <SaleWas product={product} compact /></span>
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

/** Phones: one product per row, like the reference: photo, name, rating and
 *  sales, price, then add-to-cart and Buy (off while the shop is `closed`,
 *  i.e. not taking orders yet). */
function PhoneProductRow({
  product, store, onAdd, onBuy, closed = false,
}) {
  const peekProduct = useProductPeek();
  const { price } = saleInfo(product);
  const images = Array.isArray(product.images) ? product.images : [];
  const rating = Number(product.averageRating || 0);
  const reviews = Number(product.reviewCount || 0);
  const sold = Number(product.soldCount || 0);
  // On the shop's menu, not posted now: one grey button, not "Sold out".
  const waiting = notTakingOrders(product);
  const opens = waiting ? opensLabel(product.availability) : null;
  const soldOut = !waiting && Number(product.stock) === 0 && !isStockless(product);
  return (
    <div className="shop-m-row" {...peekProduct(product, { store })}>
      <Link to={`/product/${product.slug}`} className="shop-m-row-img">
        <ProductImage src={images[0] || null} alt={product.name} />
        {soldOut && <span className="shop-m-row-soldout">Sold out</span>}
      </Link>
      <div className="shop-m-row-body">
        <Link to={`/product/${product.slug}`} className="shop-m-row-name">{product.name}</Link>
        <div className="shop-m-row-meta">
          {reviews > 0 ? (
            <span className="shop-m-row-stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} size={12} weight={i < Math.round(rating) ? 'fill' : 'regular'} />
              ))}
              <em>{rating.toFixed(1)}</em>
            </span>
          ) : (
            <span className="shop-m-row-new">New</span>
          )}
          {sold > 0 && <span className="shop-m-row-sold">{sold} sold</span>}
        </div>
        <div className="shop-m-row-foot">
          <span className="shop-m-row-price"><KindPrice product={product}>₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</KindPrice> <SaleWas product={product} compact /></span>
          {waiting ? (
            <button type="button" className="shop-m-row-closed" disabled title={opens || undefined}>
              Not taking orders yet
            </button>
          ) : (
          <div className="shop-m-row-actions">
            <button type="button" className="shop-m-row-cart" onClick={onAdd} disabled={soldOut || closed} aria-label={`Add ${product.name} to cart`}>
              <ShoppingCart size={18} />
              <Plus size={9} weight="bold" className="shop-m-row-plus" />
            </button>
            <button type="button" className="shop-m-row-buy" onClick={onBuy} disabled={soldOut || closed} title={closed ? "This shop isn't taking orders yet" : undefined}>
              Buy
            </button>
          </div>
          )}
        </div>
        {opens && <p className="shop-m-row-opens">{opens}</p>}
      </div>
    </div>
  );
}
