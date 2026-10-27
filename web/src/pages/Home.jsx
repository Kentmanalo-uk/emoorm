import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productKind } from '../lib/productKinds';
import useSeo from '../lib/seo';
import { ArrowRight, CaretLeft as ChevronLeft, CaretRight as ChevronRight, MapTrifold, ShoppingCart, Star, Storefront, X } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import HomeStoresMap from '../components/home/HomeStoresMapLazy';
import StartSellingSticker from '../components/home/StartSellingSticker';
import Spinner from '../components/ui/Spinner';
import ChatDock from '../components/chat/ChatDock';
import { readCache, patchCache } from '../lib/pageCache';
import EmptyArt from '../components/ui/EmptyArt';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useLanguageIntro } from '../lib/languageIntro';
import axios from '../lib/axios';
import { saleInfo } from '../lib/variantPricing';
import { SaleWas } from '../components/ui/SaleTag';
import KindPrice from '../components/product/kinds/KindPrice';
import { resolveImg } from '../lib/media';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './Home.css';
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';
import useAppSettings from '../hooks/useAppSettings';
import useFocusTrap from '../hooks/useFocusTrap';
import { POPULAR_SUGGESTIONS, loadRecent, saveRecent } from '../lib/buyerSearch';
import CategoryIcon, { CategoryIconGradients } from '../components/CategoryIcon';
import TodayRail from '../components/today/TodayRail';
import { ProductTodayTag } from '../components/today/TodayTag';
import { notTakingOrders } from '../lib/availability';
import useProductPeek from '../components/peek/useProductPeek';
import useStorePeek from '../components/peek/useStorePeek';

const EXPLORE_ROWS = 5;
const EXPLORE_QUERY = { sortBy: 'createdAt', sortOrder: 'desc' };

// Matches the .home-explore-grid columns in Home.css (6 / 4 / 2).
const exploreColumns = () => {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  if (width <= 768) return 2;
  if (width <= 1024) return 4;
  return 6;
};

const Home = () => {
  useSeo({
    title: 'E-MOORM — Shop local from Oriental Mindoro',
    description: 'Buy directly from verified local sellers across Oriental Mindoro, Philippines. '
      + 'Handcrafted goods, fresh produce and island-made products, delivered or ready for pickup.',
    path: '/',
  });

  // Phones get illustrated empty states; wider screens keep the plain line.
  const isPhone = usePhoneLayout();

  const fallbackBanners = [
    { id: 'fallback-1', imageUrl: '/assets/banners/banner-qoute.webp', linkUrl: null, title: 'Emoorm' },
    { id: 'fallback-2', imageUrl: '/assets/banners/buy-now-qoute.webp', linkUrl: null, title: 'Buy now' },
    { id: 'fallback-3', imageUrl: '/assets/banners/discover-mindoro.webp', linkUrl: null, title: 'Discover Mindoro' },
  ];
  // What Home showed last time: shown at once, then refreshed.
  const [homeCache] = useState(() => readCache('home') || {});
  const [bannerData, setBannerData] = useState(() => homeCache.banners || fallbackBanners);
  const [sideBanners, setSideBanners] = useState(() => homeCache.sideBanners || { top: null, bottom: null });
  const [sideBannersReady, setSideBannersReady] = useState(() => Boolean(homeCache.sideBanners));
  const [promotionPopup, setPromotionPopup] = useState(null);
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/banners');
        const list = Array.isArray(res.data) ? res.data : [];
        if (!cancelled && list.length > 0) {
          const mapBanner = (b) => ({
            id: b.id,
            imageUrl: resolveImg(b.imageUrl) || b.imageUrl,
            linkUrl: b.linkUrl || null,
            title: b.title || 'Banner',
            subtitle: b.subtitle || '',
            updatedAt: b.updatedAt,
          });
          const carousel = list.filter((b) => (b.placement || 'HOME_CAROUSEL') === 'HOME_CAROUSEL');
          const top = list.find((b) => b.placement === 'HOME_SIDEBAR_TOP');
          const bottom = list.find((b) => b.placement === 'HOME_SIDEBAR_BOTTOM');
          const popup = list.find((b) => b.placement === 'HOME_POPUP');
          const side = { top: top ? mapBanner(top) : null, bottom: bottom ? mapBanner(bottom) : null };
          if (carousel.length > 0) setBannerData(carousel.map(mapBanner));
          setSideBanners(side);
          patchCache('home', { banners: carousel.length > 0 ? carousel.map(mapBanner) : null, sideBanners: side });
          if (popup) {
            const mappedPopup = mapBanner(popup);
            const sessionKey = `emoorm.promotion-popup.${mappedPopup.id}.${mappedPopup.updatedAt || ''}`;
            if (sessionStorage.getItem(sessionKey) !== 'seen') {
              setPromotionPopup({ ...mappedPopup, sessionKey });
              setPopupOpen(true);
            }
          }
        }
      } catch {
        // keep fallback banners
      } finally {
        if (!cancelled) setSideBannersReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // The promotion waits for the first-visit language card and its pointer,
  // and counts as seen only once it has shown (choosing Tagalog reloads).
  const languageIntro = useLanguageIntro();
  const showPromotion = popupOpen && promotionPopup && !languageIntro.asking && !languageIntro.tip;
  useEffect(() => {
    if (showPromotion) sessionStorage.setItem(promotionPopup.sessionKey, 'seen');
  }, [showPromotion, promotionPopup]);

  // Selectors: Home re-renders only when these change, not on every cart or
  // session update.
  const addItem = useCartStore((st) => st.addItem);
  const user = useAuthStore((st) => st.user);
  // Hold a card: its preview with quick actions.
  const peekProduct = useProductPeek();

  const [featuredProducts, setFeaturedProducts] = useState(() => homeCache.featured || []);
  // One batch fills 5 rows of the grid at the current width; fixed per visit so pages line up.
  const [exploreBatch] = useState(() => EXPLORE_ROWS * exploreColumns());
  // Everything "Load more" had brought in, so coming back finds the same
  // long list (and the spot in it). Only with the same batch size: the pages
  // must line up with the next one asked for.
  const [exploreSaved] = useState(() => (homeCache.exploreBatch === exploreBatch ? homeCache : {}));
  const [exploreProducts, setExploreProducts] = useState(() => exploreSaved.explore || homeCache.explore || []);
  const [explorePage, setExplorePage] = useState(() => exploreSaved.explorePage || 1);
  const [exploreHasMore, setExploreHasMore] = useState(() => Boolean(exploreSaved.exploreHasMore ?? homeCache.exploreHasMore));
  const [exploreLoading, setExploreLoading] = useState(false);
  const [nearbyStores, setNearbyStores] = useState(() => homeCache.nearbyStores || []);
  const [mappedStores, setMappedStores] = useState(() => homeCache.mappedStores || []);
  const { municipalities } = useMunicipalities();
  const { categories: sharedCategories } = useCategories();
  const { settings: appSettings } = useAppSettings();
  const categoryIcons = appSettings.categoryStyle === 'ICON';

  // Phones: quick search words under the header (your recent searches first,
  // then popular ones and the category names). They scroll away with the page.
  const navigate = useNavigate();
  const [recentTerms] = useState(loadRecent);
  const quickTerms = [...new Set([
    ...recentTerms,
    ...POPULAR_SUGGESTIONS,
    ...(sharedCategories || []).map((c) => c.name).filter(Boolean),
  ])].slice(0, 16);
  const searchFor = (term) => {
    saveRecent(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  // Each section loads on its own and shows as soon as its answer arrives: a
  // slow or failed store list must not keep the products off the page (they
  // used to wait for all four requests, and one failure blanked them all).
  useEffect(() => {
    let cancelled = false;
    const load = (request, show) => request
      .then((res) => { if (!cancelled) show(res); })
      .catch((err) => console.error('Failed to load home data:', err));

    load(
      axios.get('/products', { params: { pageSize: 6, sortBy: 'createdAt', sortOrder: 'desc' } }),
      (res) => {
        setFeaturedProducts(res.data || []);
        patchCache('home', { featured: res.data || [] });
      },
    );
    load(
      axios.get('/products', { params: { ...EXPLORE_QUERY, page: 1, pageSize: exploreBatch } }),
      (res) => {
        const fresh = res.data || [];
        if ((exploreSaved.explorePage || 1) > 1) {
          // More was loaded last time: the first batch is refreshed in
          // place and the rest stays, so the list keeps its length.
          const freshIds = new Set(fresh.map((p) => p.id));
          setExploreProducts((prev) => {
            const merged = [...fresh, ...prev.slice(fresh.length).filter((p) => !freshIds.has(p.id))];
            patchCache('home', { explore: merged });
            return merged;
          });
          return;
        }
        setExploreProducts(fresh);
        setExplorePage(1);
        setExploreHasMore(Boolean(res.pagination?.hasNext));
        patchCache('home', {
          explore: fresh, explorePage: 1, exploreHasMore: Boolean(res.pagination?.hasNext), exploreBatch,
        });
      },
    );
    load(
      axios.get('/stores', {
        params: {
          pageSize: 6,
          municipalityId: user?.municipalityId || undefined,
        },
      }),
      (res) => {
        setNearbyStores(res.data || []);
        patchCache('home', { nearbyStores: res.data || [] });
      },
    );
    // Every public shop with a spot: its pin, or placed from its address
    // (pinned: false, drawn with a dashed ring).
    load(
      axios.get('/stores/map'),
      (res) => {
        const mapped = Array.isArray(res.data) ? res.data : [];
        setMappedStores(mapped);
        patchCache('home', { mappedStores: mapped });
      },
    );
    return () => { cancelled = true; };
  }, [user?.municipalityId, exploreBatch, exploreSaved]);

  // Explore Products loads its next batch on its own as the page nears the
  // bottom, one request at a time. A failure waits for "Try again" (no
  // retry loop).
  const [exploreFailed, setExploreFailed] = useState(false);
  const exploreBusy = useRef(false);
  const exploreEndRef = useRef(null);
  const loadMoreExplore = useCallback(async () => {
    if (exploreBusy.current || !exploreHasMore) return;
    exploreBusy.current = true;
    setExploreLoading(true);
    setExploreFailed(false);
    try {
      const nextPage = explorePage + 1;
      const res = await axios.get('/products', {
        params: { ...EXPLORE_QUERY, page: nextPage, pageSize: exploreBatch },
      });
      const seen = new Set(exploreProducts.map((p) => p.id));
      const next = [...exploreProducts, ...(res.data || []).filter((p) => !seen.has(p.id))];
      const hasNext = Boolean(res.pagination?.hasNext);
      setExploreProducts(next);
      setExplorePage(nextPage);
      setExploreHasMore(hasNext);
      // Remembered, so coming back finds everything loaded so far.
      patchCache('home', {
        explore: next, explorePage: nextPage, exploreHasMore: hasNext, exploreBatch,
      });
    } catch {
      setExploreFailed(true);
    } finally {
      exploreBusy.current = false;
      setExploreLoading(false);
    }
  }, [exploreHasMore, explorePage, exploreProducts, exploreBatch]);

  // About a screen and a half before the grid runs out: the next batch. A
  // fresh observer after each batch reports at once whether the end is still
  // that close (a tall screen can need two batches in a row). The end counts
  // when it is up to a screen and a half below, or anywhere above: already
  // scrolled past (a jump to the bottom of a tall page skips over it).
  useEffect(() => {
    const end = exploreEndRef.current;
    if (!end || !exploreHasMore || exploreFailed || exploreLoading || exploreProducts.length === 0) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreExplore();
    }, { rootMargin: `100000px 0px ${Math.round(window.innerHeight * 1.5)}px 0px` });
    observer.observe(end);
    return () => observer.disconnect();
  }, [exploreHasMore, exploreFailed, exploreLoading, exploreProducts.length, loadMoreExplore]);

  // Stable, so the memoised cards below do not all re-render with Home.
  const handleAddToCart = useCallback((e, product) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    // Live animals are bought by making an offer on their page.
    if (productKind(product) === 'LIVESTOCK') { navigate(`/product/${product.slug}`); return; }
    try {
      addItem(product, 1);
      toast.success(`${product.name} added to cart!`);
    } catch (err) {
      toast.error(err.message);
    }
  }, [addItem, navigate]);

  return (
    <Layout>
      <h1 className="sr-only">Emoorm, Oriental Mindoro&apos;s local online marketplace</h1>
      {showPromotion && (
        <PromotionPopup banner={promotionPopup} onClose={() => setPopupOpen(false)} />
      )}
      {isPhone && quickTerms.length > 0 && (
        <nav className="home-quick-search" aria-label="Search suggestions">
          {quickTerms.map((term) => (
            <button key={term} type="button" onClick={() => searchFor(term)}>{term}</button>
          ))}
        </nav>
      )}
      {/* Banner Section */}
      <section className="banner-section">
        <div className="container">
          <div className="banner-grid">
            {/* Left: Carousel */}
            <HomeBannerCarousel bannerData={bannerData} />

            {/* Right: Two Cards */}
            <div className="banner-sidebar">
              {!sideBannersReady ? (
                <SideBannerSkeleton />
              ) : sideBanners.top ? (
                <HomepageSideBanner banner={sideBanners.top} />
              ) : null}

              {!sideBannersReady ? (
                <SideBannerSkeleton />
              ) : sideBanners.bottom ? (
                <HomepageSideBanner banner={sideBanners.bottom} />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section: pictures, or gradient icons (Settings › Branding) */}
      <section className={`categories-section${categoryIcons ? ' is-icons' : ''}`}>
        <div className="container">
          <h2 className="section-title title-medium">Shop by Category</h2>
          {(categoryIcons || sharedCategories.some((c) => !c.image)) && <CategoryIconGradients />}
          <div className="categories-grid">
            {sharedCategories.map((cat) => (
              <Link
                to={`/products?category=${cat.id}`}
                key={cat.id}
                className="category-card"
              >
                {/* A category without a picture shows its icon. */}
                {categoryIcons || !cat.image ? (
                  <div className="category-image category-image--icon">
                    <CategoryIcon category={cat} className="category-icon" />
                  </div>
                ) : (
                  <div className="category-image">
                    <img src={resolveImg(cat.image)} alt={cat.name} loading="lazy" />
                  </div>
                )}
                <span className="category-name">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Available Today: fresh items for a limited time (hidden when none). */}
      <TodayRail />

      {/* Featured Products Section */}
      <section className="products-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title title-medium">Suggested for You</h2>
          </div>
          {featuredProducts.length > 0 ? (
            <div className="products-grid">
              {featuredProducts.map((product) => (
                <Link key={product.id} to={`/product/${product.slug}`} className="product-card" {...peekProduct(product)}>
                  <div className="product-image">
                    <ProductImage src={product.images?.[0]} alt={product.name} />
                    {!notTakingOrders(product) && (
                    <button
                      type="button"
                      className="product-cart-fab"
                      onClick={(e) => handleAddToCart(e, product)}
                      aria-label="Add to cart"
                    >
                      <ShoppingCart size={16} />
                    </button>
                    )}
                  </div>
                  <div className="product-info">
                    <span className="product-name"><ProductTodayTag product={product} />{product.name}</span>
                    <span className="product-price"><KindPrice product={product}>₱{saleInfo(product).price.toFixed(2)}</KindPrice> <SaleWas product={product} compact /></span>
                    <ProductStats product={product} />
                  </div>
                </Link>
              ))}
            </div>
          ) : isPhone ? (
            <div className="home-empty">
              <EmptyArt name="products" size={120} />
              <p className="home-empty-title">No suggestions yet</p>
              <p className="home-empty-body">Browse local products and we’ll suggest more like them.</p>
              <Link to="/products" className="home-empty-btn">Browse products</Link>
            </div>
          ) : (
            <div className="products-message">
              <p>Browse local products from Oriental Mindoro sellers</p>
              <Link to="/products" className="section-arrow-link" aria-label="View all products" title="View all products"><ArrowRight size={19} /></Link>
            </div>
          )}
        </div>
      </section>

      {/* Stores Section */}
      <section className="stores-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title title-medium">Stores Near You</h2>
            <Link to="/stores" className="section-arrow-link" aria-label="View all stores" title="View all stores"><ArrowRight size={19} /></Link>
          </div>
          {nearbyStores.length > 0 ? (
            <div className="home-stores-grid">
              {nearbyStores.map((store) => <HomeStoreCard key={store.id} store={store} />)}
            </div>
          ) : isPhone ? (
            <div className="home-empty">
              <EmptyArt name="stores" size={120} />
              <p className="home-empty-title">No stores near you yet</p>
              <p className="home-empty-body">Shops in your municipality will show up here as they open.</p>
              <Link to="/stores" className="home-empty-btn">See all stores</Link>
            </div>
          ) : (
            <div className="stores-message">
              <EmptyArt name="stores" size={64} />
              <p>No active stores are available in this area yet.</p>
              <Link to="/stores" className="section-arrow-link" aria-label="Browse all stores" title="Browse all stores"><ArrowRight size={19} /></Link>
            </div>
          )}
        </div>
      </section>

      {/* Municipality discovery */}
      <section className="municipalities-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title title-medium">Explore Municipals</h2>
            <Link to="/stores" className="section-arrow-link" aria-label="View all municipalities" title="View all municipalities"><ArrowRight size={19} /></Link>
          </div>
          {municipalities.length > 0 ? (
            <div className="municipality-rail">
              {municipalities.map((municipality) => (
                <Link key={municipality.id} to={`/municipality/${municipality.id}`} className="municipality-tile">
                  <div className="municipality-tile-logo">
                    {municipality.logo ? (
                      <img src={resolveImg(municipality.logo)} alt={`${municipality.name} logo`} />
                    ) : (
                      <span>{municipality.name?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span>{municipality.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="municipalities-empty">
              <EmptyArt name="places" size={80} />
              <span>Municipality showcases are coming soon.</span>
            </div>
          )}
        </div>
      </section>

      {/* Discover Stores Map */}
      <section className="stores-section discover-stores-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title title-medium">Discover Stores</h2>
            <Link to="/stores/map" className="section-arrow-link" aria-label="Open the stores map" title="Open the stores map"><ArrowRight size={19} /></Link>
          </div>
          {/* A tapped pin, or the button, opens the full stores map. */}
          <div className="discover-stores-map">
            <HomeStoresMap
              stores={mappedStores}
              height={440}
              onSelect={(store) => navigate(`/stores/map?focus=${encodeURIComponent(store.id)}`)}
            />
            {mappedStores.length === 0 && (
              <div className="discover-stores-empty">No shops on the map yet.</div>
            )}
            <Link to="/stores/map" className="discover-stores-open">
              <MapTrifold size={16} weight="fill" aria-hidden="true" />
              Open full map
            </Link>
          </div>
        </div>
      </section>

      {/* Explore Products Section */}
      <section className="products-section home-explore-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title title-medium">Explore Products</h2>
            <Link to="/products" className="section-arrow-link" aria-label="View all products" title="View all products"><ArrowRight size={19} /></Link>
          </div>
          {exploreProducts.length > 0 && (
            <div className="products-grid home-explore-grid">
              {exploreProducts.map((product) => <HomeProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />)}
            </div>
          )}
          {/* Under the grid: a spinner while the next batch loads, "Try again", or the end. */}
          <div className="home-explore-end" ref={exploreEndRef} aria-live="polite">
            {exploreLoading && <Spinner size={20} label="Loading more products" />}
            {!exploreLoading && exploreFailed && (
              <button type="button" className="home-explore-retry" onClick={loadMoreExplore}>
                Couldn’t load more · <span>Try again</span>
              </button>
            )}
            {!exploreHasMore && exploreProducts.length > 0 && (
              <p className="home-explore-done">You’ve seen everything for now</p>
            )}
          </div>
        </div>
      </section>

      {/* Phones: the floating "Start selling" sticker (guests and buyers). */}
      {isPhone && <StartSellingSticker />}

      <ChatDock />
    </Layout>
  );
};

/** Placeholder with the card's shape while banners (or their images) load. */
/**
 * The banner carousel: its own component, so a slide moving every five
 * seconds re-renders the carousel alone, not the whole of Home (the product
 * grid used to re-render with every slide).
 */
function HomeBannerCarousel({ bannerData }) {
  const [currentIndex, setCurrentIndex] = useState(1); // Start at 1 (first real slide)
  const [isTransitioning, setIsTransitioning] = useState(false);

  const banners = bannerData.map((b) => b.imageUrl);

  // Create extended slides array: [last, ...real slides, first]
  const extendedSlides = banners.length > 0
    ? [banners[banners.length - 1], ...banners, banners[0]]
    : [];

  // Restart autoplay from the first real slide whenever the banner set changes.
  useEffect(() => {
    setCurrentIndex(1);
    setIsTransitioning(false);
  }, [banners.length]);

  // Auto-advance carousel without depending on the render-scoped click handler.
  useEffect(() => {
    if (banners.length <= 1 || isTransitioning) return undefined;
    const timer = setTimeout(() => {
      setIsTransitioning(true);
      setCurrentIndex((previous) => previous + 1);
    }, 5000);
    return () => clearTimeout(timer);
  }, [banners.length, currentIndex, isTransitioning]);

  // Handle transition end - reset position without animation
  const handleTransitionEnd = () => {
    setIsTransitioning(false);

    // If we're at the clone of the first slide (index 0), jump to real first slide (index 1)
    if (currentIndex === 0) {
      setCurrentIndex(banners.length);
    }
    // If we're at the clone of the last slide (last index), jump to real last slide
    else if (currentIndex === extendedSlides.length - 1) {
      setCurrentIndex(1);
    }
  };

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  };

  // Phones: a sideways swipe moves a slide (the arrows are hidden there).
  const swipeRef = useRef(null);
  const onSwipeStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  };
  const onSwipeEnd = (e) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(t.clientY - start.y) * 1.5) return;
    if (dx < 0) handleNext(); else handlePrev();
  };

  const goToSlide = (index) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex(index + 1); // +1 because of cloned slide at start
  };

  // Get current real slide index for pagination
  const getRealIndex = () => {
    if (currentIndex === 0) return banners.length - 1;
    if (currentIndex === extendedSlides.length - 1) return 0;
    return currentIndex - 1;
  };

  return (
    <div className="banner-carousel" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
      <div
        className="banner-carousel-inner"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
          transition: isTransitioning ? 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {extendedSlides.map((banner, index) => {
          const realIndex = index === 0
            ? bannerData.length - 1
            : index === extendedSlides.length - 1
              ? 0
              : index - 1;
          const info = bannerData[realIndex] || {};
          const img = <img src={banner} alt={info.title || `Banner ${index}`} />;
          return (
            <div key={`${info.id || 'slide'}-${index}`} className="banner-slide">
              {info.linkUrl ? (
                info.linkUrl.startsWith('http') ? (
                  <a href={info.linkUrl} target="_blank" rel="noopener noreferrer">{img}</a>
                ) : (
                  <Link to={info.linkUrl}>{img}</Link>
                )
              ) : img}
            </div>
          );
        })}
      </div>

      {/* Carousel Controls */}
      <button type="button" className="banner-control banner-control-prev" onClick={handlePrev} aria-label="Previous banner">
        <ChevronLeft size={20} />
      </button>
      <button type="button" className="banner-control banner-control-next" onClick={handleNext} aria-label="Next banner">
        <ChevronRight size={20} />
      </button>

      {/* Carousel Dots */}
      <div className="banner-dots">
        {banners.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`banner-dot ${getRealIndex() === index ? 'banner-dot-active' : ''}`}
            onClick={() => goToSlide(index)}
            aria-label={`Show banner ${index + 1} of ${banners.length}`}
            aria-current={getRealIndex() === index ? 'true' : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SideBannerSkeleton() {
  return <div className="banner-card banner-card-skeleton" aria-hidden="true" />;
}

function HomepageSideBanner({ banner }) {
  const [loaded, setLoaded] = useState(false);
  const content = (
    <div className={`banner-card banner-card-image${loaded ? '' : ' is-loading'}`}>
      <img
        src={banner.imageUrl}
        alt={banner.title || 'Homepage banner'}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
  if (!banner.linkUrl) return content;
  return banner.linkUrl.startsWith('http')
    ? <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="banner-card-image-link">{content}</a>
    : <Link to={banner.linkUrl} className="banner-card-image-link">{content}</Link>;
}

const PROMO_CLOSE_MS = 240;

function PromotionPopup({ banner, onClose }) {
  const [closing, setClosing] = useState(false);
  const image = <img src={banner.imageUrl} alt={banner.title || 'Promotion'} />;

  // Let the shrink animation finish before the popup is removed.
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, PROMO_CLOSE_MS);
  };
  const trapRef = useFocusTrap(true, { onClose: close });

  return (
    <div
      ref={trapRef}
      className={`home-promo-backdrop${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={banner.title || 'Promotion'}
      onClick={close}
    >
      <div className="home-promo-dialog" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="home-promo-close" onClick={close} aria-label="Close promotion"><X size={18} /></button>
        {banner.linkUrl ? (
          banner.linkUrl.startsWith('http')
            ? <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" onClick={close}>{image}</a>
            : <Link to={banner.linkUrl} onClick={close}>{image}</Link>
        ) : image}
      </div>
    </div>
  );
}

/** Stars only from real reviews; sold only from settled orders; else "New". */
function ProductStats({ product }) {
  const reviews = Number(product.reviewCount || 0);
  const rating = Number(product.averageRating || 0);
  const sold = Number(product.soldCount || 0);
  if (reviews === 0 && sold === 0) {
    return (
      <div className="product-rating-row">
        <span className="product-review-count product-new">New</span>
      </div>
    );
  }
  return (
    <div className="product-rating-row">
      {reviews > 0 && (
        <>
          <div className="product-stars" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star
                key={i}
                size={11}
                weight={i < Math.round(rating) ? 'fill' : 'regular'}
                color={i < Math.round(rating) ? 'var(--t-warning-500, #f59e0b)' : 'var(--t-neutral-300, #d1d5db)'}
              />
            ))}
          </div>
          <span className="product-review-count">({reviews})</span>
        </>
      )}
      {sold > 0 && <span className="product-review-count product-sold">{sold} sold</span>}
    </div>
  );
}

const HomeProductCard = memo(function HomeProductCard({ product, onAddToCart }) {
  const peekProduct = useProductPeek();
  return (
    <Link to={`/product/${product.slug}`} className="product-card" {...peekProduct(product)}>
      <div className="product-image">
        <ProductImage src={product.images?.[0]} alt={product.name} />
        {!notTakingOrders(product) && (
        <button type="button" className="product-cart-fab" onClick={(e) => onAddToCart(e, product)} aria-label="Add to cart">
          <ShoppingCart size={16} />
        </button>
        )}
      </div>
      <div className="product-info">
        <span className="product-name"><ProductTodayTag product={product} />{product.name}</span>
        <span className="product-price"><KindPrice product={product}>₱{saleInfo(product).price.toFixed(2)}</KindPrice> <SaleWas product={product} compact /></span>
        <ProductStats product={product} />
      </div>
    </Link>
  );
});

const HomeStoreCard = memo(function HomeStoreCard({ store }) {
  const peekStore = useStorePeek();
  const initials = store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const productImages = (store.products || [])
    .map((product) => {
      const image = Array.isArray(product.images) ? product.images[0] : product.images;
      return image ? { id: product.id, name: product.name, src: resolveImg(image) || image } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  const cover = store.coverImage || store.bannerImage;
  const town = store.municipality?.name;
  const address = store.pickupAddress || '';
  // The town once, even when the address already ends with it.
  const place = (town && address.toLowerCase().includes(town.toLowerCase())
    ? address
    : [address, town].filter(Boolean).join(', ')) || 'Oriental Mindoro';
  const count = store._count?.products || 0;
  const to = `/store/${store.slug}`;
  const fallback = (e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder-product.png'; };

  return (
    <article className="home-store-card" {...peekStore(store)}>
      <Link to={to} className={`home-store-media is-${productImages.length || 1}`} tabIndex={-1} aria-hidden="true">
        {productImages.length > 0 ? productImages.map((image) => (
          <img key={image.id} src={image.src} alt="" loading="lazy" onError={fallback} />
        )) : cover ? (
          <img src={resolveImg(cover) || cover} alt="" loading="lazy" onError={fallback} />
        ) : store.logo ? (
          <img className="home-store-media-blur" src={resolveImg(store.logo) || store.logo} alt="" loading="lazy" />
        ) : (
          <span className="home-store-media-empty"><Storefront size={28} /></span>
        )}
      </Link>
      <Link to={to} className="home-store-main">
        <div className="home-store-logo">
          {store.logo ? <img src={resolveImg(store.logo) || store.logo} alt={`${store.name} logo`} /> : <span>{initials}</span>}
        </div>
        <div className="home-store-copy">
          <h3>{store.name}</h3>
          <p>{place}</p>
        </div>
      </Link>
      <div className="home-store-foot">
        <span className="home-store-count">{count === 0 ? 'No products yet' : count === 1 ? '1 product' : `${count} products`}</span>
        <Link to={to} className="home-store-view-products">
          View products <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
});

export default Home;
