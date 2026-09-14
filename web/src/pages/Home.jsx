import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CaretLeft as ChevronLeft, CaretRight as ChevronRight, ShoppingCart, Star } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/ProductImage';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useCartStore from '../store/cartStore';
import './Home.css';

const Home = () => {
  const [currentIndex, setCurrentIndex] = useState(1); // Start at 1 (first real slide)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionRef = useRef(null);

  const fallbackBanners = [
    { id: 'fallback-1', imageUrl: '/assets/banners/banner-qoute.png', linkUrl: null, title: 'Emoorm' },
    { id: 'fallback-2', imageUrl: '/assets/banners/buy-now-qoute.png', linkUrl: null, title: 'Buy now' },
    { id: 'fallback-3', imageUrl: '/assets/banners/discover-mindoro.png', linkUrl: null, title: 'Discover Mindoro' },
  ];
  const [bannerData, setBannerData] = useState(fallbackBanners);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/banners');
        const list = Array.isArray(res.data) ? res.data : [];
        if (!cancelled && list.length > 0) {
          setBannerData(list.map((b) => ({
            id: b.id,
            imageUrl: resolveImg(b.imageUrl) || b.imageUrl,
            linkUrl: b.linkUrl || null,
            title: b.title || 'Banner',
          })));
        }
      } catch {
        // keep fallback banners
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const banners = bannerData.map((b) => b.imageUrl);

  // Create extended slides array: [last, ...real slides, first]
  const extendedSlides = banners.length > 0
    ? [banners[banners.length - 1], ...banners, banners[0]]
    : [];

  // Auto-advance carousel
  useEffect(() => {
    const timer = setInterval(() => {
      handleNext();
    }, 5000);
    return () => clearInterval(timer);
  }, [currentIndex]);

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
  const [apiCategories, setApiCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          axios.get('/categories'),
          axios.get('/products', { params: { pageSize: 8, sortBy: 'createdAt', sortOrder: 'desc' } }),
        ]);
        setApiCategories(catRes.data || []);
        setFeaturedProducts(prodRes.data || []);
      } catch (err) {
        console.error('Failed to load home data:', err);
      }
    };
    fetchHomeData();
  }, []);

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
              {/* Seller CTA Card */}
              <div className="banner-card banner-card-seller">
                <div className="banner-card-badge-corner">FREE</div>
                <h3 className="banner-card-title">
                  Sell on<br />Emoorm.
                </h3>
                <p className="banner-card-text">Reach buyers across Oriental Mindoro.</p>
                <Link to="/sell" className="banner-card-button">
                  Register
                  <ArrowRight size={16} />
                </Link>
              </div>

              {/* Mobile App Card */}
              <div className="banner-card banner-card-app">
                <div className="banner-card-app-copy">
                  <div className="banner-card-label">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="4" y="2" width="8" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
                    </svg>
                    MOBILE APP
                  </div>
                  <h4 className="banner-card-title-small">
                    Try Emoorm<br />on mobile.
                  </h4>
                  <p className="banner-card-text-small">Scan with your phone camera.</p>
                </div>
                <div className="qr-code">
                  <svg viewBox="0 0 100 100" width="72" height="72">
                    <rect width="100" height="100" fill="white" />
                    <rect x="10" y="10" width="35" height="35" fill="black" />
                    <rect x="55" y="10" width="35" height="35" fill="black" />
                    <rect x="10" y="55" width="35" height="35" fill="black" />
                    <rect x="15" y="15" width="25" height="25" fill="white" />
                    <rect x="60" y="15" width="25" height="25" fill="white" />
                    <rect x="15" y="60" width="25" height="25" fill="white" />
                    <rect x="20" y="20" width="15" height="15" fill="black" />
                    <rect x="65" y="20" width="15" height="15" fill="black" />
                    <rect x="20" y="65" width="15" height="15" fill="black" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="categories-section">
        <div className="container">
          <h2 className="section-title">Shop by Category</h2>
          <div className="categories-grid">
            {apiCategories.map((cat) => (
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
                          <Star key={i} size={11} weight="fill" color="#f59e0b" />
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
              <Link to="/products" className="products-link">View all products <ArrowRight size={16} /></Link>
            </div>
          )}
        </div>
      </section>

      {/* Stores Section */}
      <section className="stores-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Stores Near You</h2>
          </div>
          <div className="stores-message">
            <p>Discover local sellers and shops in your area</p>
            <Link to="/stores" className="stores-link">
              Browse all stores <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>


    </Layout>
  );
};

export default Home;
