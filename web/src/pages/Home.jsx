import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CaretLeft as ChevronLeft, CaretRight as ChevronRight, ShoppingCart, Star, Storefront, X } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import StoreLocationMap from '../components/maps/StoreLocationMap';
import ChatDock from '../components/chat/ChatDock';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import './Home.css';
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';

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
  const [currentIndex, setCurrentIndex] = useState(1); // Start at 1 (first real slide)
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fallbackBanners = [
    { id: 'fallback-1', imageUrl: '/assets/banners/banner-qoute.png', linkUrl: null, title: 'Emoorm' },
    { id: 'fallback-2', imageUrl: '/assets/banners/buy-now-qoute.png', linkUrl: null, title: 'Buy now' },
    { id: 'fallback-3', imageUrl: '/assets/banners/discover-mindoro.png', linkUrl: null, title: 'Discover Mindoro' },
  ];
  const [bannerData, setBannerData] = useState(fallbackBanners);
  const [sideBanners, setSideBanners] = useState({ top: null, bottom: null });
  const [sideBannersReady, setSideBannersReady] = useState(false);
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
          if (carousel.length > 0) setBannerData(carousel.map(mapBanner));
          setSideBanners({ top: top ? mapBanner(top) : null, bottom: bottom ? mapBanner(bottom) : null });
          if (popup) {
            const mappedPopup = mapBanner(popup);
            const sessionKey = `emoorm.promotion-popup.${mappedPopup.id}.${mappedPopup.updatedAt || ''}`;
            if (sessionStorage.getItem(sessionKey) !== 'seen') {
              setPromotionPopup(mappedPopup);
              setPopupOpen(true);
              sessionStorage.setItem(sessionKey, 'seen');
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

  useEffect(() => {
    if (!popupOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPopupOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [popupOpen]);

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

  const { addItem } = useCartStore();
  const { user } = useAuthStore();

  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [exploreProducts, setExploreProducts] = useState([]);
  // One batch fills 5 rows of the grid at the current width; fixed per visit so pages line up.
  const [exploreBatch] = useState(() => EXPLORE_ROWS * exploreColumns());
  const [explorePage, setExplorePage] = useState(1);
  const [exploreHasMore, setExploreHasMore] = useState(false);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [nearbyStores, setNearbyStores] = useState([]);
  const [mappedStores, setMappedStores] = useState([]);
  const { municipalities } = useMunicipalities();
  const { categories: sharedCategories } = useCategories();

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const [suggestedRes, exploreRes, storesRes, mappedStoresRes] = await Promise.all([
          axios.get('/products', { params: { pageSize: 6, sortBy: 'createdAt', sortOrder: 'desc' } }),
          axios.get('/products', { params: { ...EXPLORE_QUERY, page: 1, pageSize: exploreBatch } }),
          axios.get('/stores', {
            params: {
              pageSize: 6,
              municipalityId: user?.municipalityId || undefined,
            },
          }),
          axios.get('/stores', { params: { pageSize: 100 } }),
        ]);
        setFeaturedProducts(suggestedRes.data || []);
        setExploreProducts(exploreRes.data || []);
        setExplorePage(1);
        setExploreHasMore(Boolean(exploreRes.pagination?.hasNext));
        setNearbyStores(storesRes.data || []);
        setMappedStores((mappedStoresRes.data || []).filter((store) => store.latitude != null && store.longitude != null));
      } catch (err) {
        console.error('Failed to load home data:', err);
      }
    };
    fetchHomeData();
  }, [user?.municipalityId, exploreBatch]);

  const loadMoreExplore = async () => {
    setExploreLoading(true);
    try {
      const nextPage = explorePage + 1;
      const res = await axios.get('/products', {
        params: { ...EXPLORE_QUERY, page: nextPage, pageSize: exploreBatch },
      });
      setExploreProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(res.data || []).filter((p) => !seen.has(p.id))];
      });
      setExplorePage(nextPage);
      setExploreHasMore(Boolean(res.pagination?.hasNext));
    } catch (err) {
      toast.error(err.message || 'Failed to load more products');
    } finally {
      setExploreLoading(false);
    }
  };

  const handleAddToCart = (e, product) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      addItem(product, 1);
      toast.success(`${product.name} added to cart!`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Layout>
      {popupOpen && promotionPopup && (
        <PromotionPopup banner={promotionPopup} onClose={() => setPopupOpen(false)} />
      )}
      {/* Banner Section */}
      <section className="banner-section">
        <div className="container">
          <div className="banner-grid">
            {/* Left: Carousel */}
            <div className="banner-carousel">
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
              <button className="banner-control banner-control-prev" onClick={handlePrev}>
                <ChevronLeft size={20} />
              </button>
              <button className="banner-control banner-control-next" onClick={handleNext}>
                <ChevronRight size={20} />
              </button>

              {/* Carousel Dots */}
              <div className="banner-dots">
                {banners.map((_, index) => (
                  <button
                    key={index}
                    className={`banner-dot ${getRealIndex() === index ? 'banner-dot-active' : ''}`}
                    onClick={() => goToSlide(index)}
                  />
                ))}
              </div>
            </div>

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

      {/* Categories Section */}
      <section className="categories-section">
        <div className="container">
          <h2 className="section-title">Shop by Category</h2>
          <div className="categories-grid">
            {sharedCategories.map((cat) => (
              <Link
                to={`/products?category=${cat.id}`}
                key={cat.id}
                className="category-card"
              >
                <div className="category-image">
                  <img src={resolveImg(cat.image) || `/categories/${cat.slug}.png`} alt={cat.name} />
                </div>
                <span className="category-name">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products Section */}
      <section className="products-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Suggested for You</h2>
          </div>
          {featuredProducts.length > 0 ? (
            <div className="products-grid">
              {featuredProducts.map((product) => (
                <Link key={product.id} to={`/product/${product.slug}`} className="product-card">
                  <div className="product-image">
                    <ProductImage src={product.images?.[0]} alt={product.name} />
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
                    <span className="product-name">{product.name}</span>
                    <span className="product-price">₱{Number(product.price).toFixed(2)}</span>
                    <div className="product-rating-row">
                      <div className="product-stars">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Star key={i} size={11} weight="fill" color="var(--t-warning-500, #f59e0b)" />
                        ))}
                      </div>
                      <span className="product-review-count">({product.reviewCount ?? 0})</span>
                    </div>
                  </div>
                </Link>
              ))}
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
            <h2 className="section-title">Stores Near You</h2>
            <Link to="/stores" className="section-arrow-link" aria-label="View all stores" title="View all stores"><ArrowRight size={19} /></Link>
          </div>
          {nearbyStores.length > 0 ? (
            <div className="home-stores-grid">
              {nearbyStores.map((store) => <HomeStoreCard key={store.id} store={store} />)}
            </div>
          ) : (
            <div className="stores-message">
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
            <h2 className="section-title">Explore Municipals</h2>
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
            <div className="municipalities-empty">Municipality showcases are coming soon.</div>
          )}
        </div>
      </section>

      {/* Discover Stores Map */}
      <section className="stores-section discover-stores-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Discover Stores</h2>
            <Link to="/stores" className="section-arrow-link" aria-label="Browse all stores" title="Browse all stores"><ArrowRight size={19} /></Link>
          </div>
          <StoreLocationMap stores={mappedStores} height={440} lockToPhilippines />
          {mappedStores.length === 0 && (
            <div className="discover-stores-empty">No sellers have pinned their store location yet.</div>
          )}
        </div>
      </section>

      {/* Explore Products Section */}
      <section className="products-section home-explore-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Explore Products</h2>
            <Link to="/products" className="section-arrow-link" aria-label="View all products" title="View all products"><ArrowRight size={19} /></Link>
          </div>
          {exploreProducts.length > 0 && (
            <div className="products-grid home-explore-grid">
              {exploreProducts.map((product) => <HomeProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />)}
            </div>
          )}
          {exploreHasMore && (
            <div className="home-load-more">
              <button
                type="button"
                className="home-load-more-btn"
                onClick={loadMoreExplore}
                disabled={exploreLoading}
              >
                {exploreLoading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </section>

      <ChatDock />
    </Layout>
  );
};

/** Placeholder with the card's shape while banners (or their images) load. */
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

  return (
    <div
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

function HomeProductCard({ product, onAddToCart }) {
  return (
    <Link to={`/product/${product.slug}`} className="product-card">
      <div className="product-image">
        <ProductImage src={product.images?.[0]} alt={product.name} />
        <button type="button" className="product-cart-fab" onClick={(e) => onAddToCart(e, product)} aria-label="Add to cart">
          <ShoppingCart size={16} />
        </button>
      </div>
      <div className="product-info">
        <span className="product-name">{product.name}</span>
        <span className="product-price">₱{Number(product.price).toFixed(2)}</span>
        <div className="product-rating-row">
          <div className="product-stars">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={11} weight="fill" color="var(--t-warning-500, #f59e0b)" />)}</div>
          <span className="product-review-count">({product.reviewCount ?? 0})</span>
        </div>
      </div>
    </Link>
  );
}

function HomeStoreCard({ store }) {
  const initials = store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const productImages = (store.products || [])
    .map((product) => {
      const image = Array.isArray(product.images) ? product.images[0] : product.images;
      return image ? { id: product.id, name: product.name, src: resolveImg(image) || image } : null;
    })
    .filter(Boolean);

  return (
    <article className="home-store-card">
      <Link to={`/store/${store.slug}`} className="home-store-main">
        <div className="home-store-logo">
          {store.logo ? <img src={resolveImg(store.logo) || store.logo} alt={`${store.name} logo`} /> : <span>{initials}</span>}
        </div>
        <div className="home-store-copy">
          <h3>{store.name}</h3>
          <p>{[store.pickupAddress, store.municipality?.name].filter(Boolean).join(', ') || 'Oriental Mindoro'}</p>
        </div>
      </Link>
      <div className="home-store-products">
        <div className="home-store-product-stack" aria-label="Recent products">
          {productImages.length > 0 ? productImages.map((image) => (
            <img key={image.id} src={image.src} alt={image.name} />
          )) : (
            <span className="home-store-product-empty"><Storefront size={18} /></span>
          )}
        </div>
        <Link to={`/store/${store.slug}`} className="home-store-view-products">
          View products <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}

export default Home;
