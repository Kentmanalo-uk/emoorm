import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import {
  ArrowRight, Star, Menu, X, ChevronDown,
  ShoppingBag, Package, Bell, Store, BarChart2,
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import Footer from '../components/layout/Footer';
import './Sell.css';

const BENEFITS = [
  { title: 'Free to open a shop', desc: 'No fees. Keep more of what you earn.' },
  { title: 'Reach local buyers', desc: 'Buyers across Oriental Mindoro looking for fresh, local products.' },
  { title: 'You control delivery', desc: 'Set your own area and schedule.' },
  { title: 'Direct messaging', desc: 'Chat with buyers in real time to confirm orders.' },
  { title: 'Track performance', desc: 'Sales, reviews, and earnings in one dashboard.' },
  { title: 'Verified & trusted', desc: "Gov't ID verification builds buyer confidence." },
];

const STEPS = [
  { n: '1', title: 'Create a seller account', desc: 'Sign up with your name and email.' },
  { n: '2', title: 'Register your shop', desc: 'Store name, location, and valid ID.' },
  { n: '3', title: 'List your products', desc: 'Photos, prices, descriptions.' },
  { n: '4', title: 'Start earning', desc: 'Buyers find you and you deliver.' },
];

const NAV_HOW = [
  { n: '1', title: 'Create a seller account', desc: 'Sign up in minutes with your name and email.' },
  { n: '2', title: 'Register your shop', desc: 'Set your store name, location, and upload your valid ID.' },
  { n: '3', title: 'List your products', desc: 'Add photos, prices, and descriptions of what you sell.' },
  { n: '4', title: 'Start earning', desc: 'Buyers find you, place orders, and you deliver directly.' },
];

const NAV_BENEFITS = [
  { title: 'Free to open a shop', desc: 'No monthly fees. Keep more of what you earn.' },
  { title: 'Reach local buyers', desc: 'Connect with buyers across Oriental Mindoro.' },
  { title: 'You control delivery', desc: 'Set your own area, schedule, and delivery rules.' },
  { title: 'Direct messaging', desc: 'Chat with buyers in real time to confirm orders.' },
  { title: 'Track performance', desc: 'See sales, reviews, and earnings at a glance.' },
  { title: 'Verified & trusted', desc: "Gov't ID verification builds buyer confidence." },
];

const CATEGORIES = [
  'Vegetables', 'Fruits', 'Seafood', 'Rice & Grains', 'Meat & Poultry',
  'Dairy', 'Handicrafts', 'Wellness Products', 'Delicacies',
  'Beverages', 'Condiments & Sauces', 'Seedlings & Plants',
];

function AuthDropdown({ label, variant, onClick, to, title, subtitle, items }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const scheduleClose = () => { timer.current = setTimeout(() => setOpen(false), 140); };
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  return (
    <div
      className="sell-auth-wrap"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        className={variant === 'primary' ? 'sell-nav-btn-primary' : 'sell-nav-btn-ghost'}
        onClick={onClick}
      >
        {label}
      </button>
      <div className={`sell-auth-drop ${open ? 'sell-auth-drop--open' : ''}`}>
        <div className="sell-auth-drop-head">
          <p className="sell-auth-drop-title">{title}</p>
          <p className="sell-auth-drop-sub">{subtitle}</p>
        </div>
        <ul className="sell-auth-drop-list">
          {items.map(item => (
            <li key={item.label}>
              <Link to={`${to}?redirect=${encodeURIComponent(item.target)}`} className="sell-auth-drop-item">
                <span className="sell-auth-drop-icon">{item.icon}</span>
                <span className="sell-auth-drop-label">{item.label}</span>
                <ArrowRight size={14} className="sell-auth-drop-arrow" />
              </Link>
            </li>
          ))}
        </ul>
        <button className="sell-auth-drop-cta" onClick={onClick}>
          {label} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

const NAV_LINKS = ['How it works', 'Benefits', 'Categories'];

export default function Sell() {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeNav, setActiveNav] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isAuthenticated && user?.role === 'SELLER') {
    return <Navigate to="/seller" replace />;
  }

  const isPending = isAuthenticated && user?.sellerApplicationStatus === 'PENDING';
  const ctaLabel = isPending ? 'Application Pending' : isAuthenticated ? 'Apply to sell' : 'Start selling';

  const handleCTA = () => {
    if (isPending) return;
    navigate(isAuthenticated ? '/seller/apply' : '/register?redirect=/seller/apply');
  };

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    let visible = true;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const dy = y - lastY;
      if (y <= 40) {
        if (!visible) { visible = true; setHeaderVisible(true); }
      } else if (dy > 6 && visible) {
        visible = false; setHeaderVisible(false);
      } else if (dy < -6 && !visible) {
        visible = true; setHeaderVisible(true);
      }
      lastY = y;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="sell-page">

      {/* Sticky header — topbar slides out first on scroll down */}
      <div
        className="sell-sticky"
        style={{ transform: headerVisible ? 'translateY(0)' : 'translateY(-40px)' }}
      >
        <div className="sell-topbar">
          <Star size={13} fill="white" color="white" />
          Free to join. Built for Oriental Mindoro sellers.
        </div>

        <header className="sell-header" onMouseLeave={() => setActiveNav(null)}>
          <div className="sell-header-inner">
            <Link to="/" className="sell-logo">
              <img src="/brand-icon.png" alt="Emoorm" className="sell-logo-img" />
              <span className="sell-logo-text">emoorm</span>
            </Link>

            <nav className="sell-nav-links">
              {NAV_LINKS.map(label => (
                <a
                  key={label}
                  href={`#${label.toLowerCase().replace(/ /g, '-')}`}
                  className={`sell-nav-link ${activeNav === label ? 'sell-nav-link--active' : ''}`}
                  onMouseEnter={() => setActiveNav(label)}
                >
                  {label}
                  <ChevronDown
                    size={14}
                    style={{ transform: activeNav === label ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 200ms' }}
                  />
                </a>
              ))}
            </nav>

            <div className="sell-header-actions">
              {isAuthenticated ? (
                <button className="sell-nav-btn-primary" onClick={handleCTA} disabled={isPending}>
                  {ctaLabel}
                </button>
              ) : (
                <>
                  <AuthDropdown
                    label="Log in"
                    variant="ghost"
                    onClick={() => navigate('/login?redirect=/seller/apply')}
                    to="/login"
                    title="Your Emoorm shopper account"
                    subtitle="Sign in to access your account."
                    items={[
                      { icon: <ShoppingBag size={16} />, label: 'Browse stores', target: '/products' },
                      { icon: <Package size={16} />, label: 'My orders', target: '/profile/orders' },
                      { icon: <Bell size={16} />, label: 'Notifications', target: '/profile' },
                    ]}
                  />
                  <AuthDropdown
                    label="Start selling"
                    variant="primary"
                    onClick={handleCTA}
                    to="/register"
                    title="Your Emoorm seller account"
                    subtitle="Create an account to open your shop."
                    items={[
                      { icon: <Store size={16} />, label: 'Set up storefront', target: '/seller/apply' },
                      { icon: <Package size={16} />, label: 'Manage products', target: '/seller/products' },
                      { icon: <BarChart2 size={16} />, label: 'Sales & analytics', target: '/seller' },
                    ]}
                  />
                </>
              )}
              <button className="sell-mobile-toggle" onClick={() => setMobileOpen(v => !v)}>
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Mega dropdown — grid-template-rows animation */}
          <div className="sell-mega-wrap" style={{ gridTemplateRows: activeNav ? '1fr' : '0fr' }}>
            <div className="sell-mega-inner">
              {activeNav === 'How it works' && (
                <div className="sell-mega-content">
                  <p className="sell-mega-label">Getting started</p>
                  <div className="sell-mega-how-grid">
                    {NAV_HOW.map(item => (
                      <a key={item.n} href="#how-it-works" className="sell-mega-item">
                        <span className="sell-mega-n">{item.n}</span>
                        <div>
                          <p className="sell-mega-item-title">{item.title}</p>
                          <p className="sell-mega-item-desc">{item.desc}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {activeNav === 'Benefits' && (
                <div className="sell-mega-content">
                  <p className="sell-mega-label">Why Emoorm</p>
                  <div className="sell-mega-benefits-grid">
                    {NAV_BENEFITS.map(item => (
                      <a key={item.title} href="#benefits" className="sell-mega-item sell-mega-item--plain">
                        <p className="sell-mega-item-title">{item.title}</p>
                        <p className="sell-mega-item-desc">{item.desc}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {activeNav === 'Categories' && (
                <div className="sell-mega-content">
                  <p className="sell-mega-label">What you can sell</p>
                  <div className="sell-mega-chips">
                    {CATEGORIES.map(cat => (
                      <Link key={cat} to={`/products?search=${encodeURIComponent(cat)}`} className="sell-mega-chip">
                        {cat}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sell-mobile-menu">
          {NAV_LINKS.map(label => (
            <a key={label} href={`#${label.toLowerCase().replace(/ /g, '-')}`} className="sell-mobile-link" onClick={() => setMobileOpen(false)}>
              {label}
            </a>
          ))}
          {!isAuthenticated && (
            <button className="sell-mobile-link" onClick={() => { setMobileOpen(false); navigate('/login'); }}>
              Log in
            </button>
          )}
        </div>
      )}

      {/* Hero */}
      <section className="sell-hero">
        <div className="sell-container">
          <div className="sell-hero-layout">
            <div className="sell-hero-copy">
              <h1 className="sell-hero-h1">
                Start Selling<br />
                <span className="sell-hero-accent">in Emoorm</span>
              </h1>
              <p className="sell-hero-sub">Join local farmers and agri-entrepreneurs.</p>
              <div className="sell-hero-btns">
                <button className="sell-hero-btn-primary" onClick={handleCTA} disabled={isPending}>
                  {ctaLabel} <ArrowRight size={16} />
                </button>
                {!isAuthenticated && (
                  <button className="sell-hero-btn-ghost" onClick={() => navigate('/login?redirect=/seller/apply')}>
                    Already a seller? Log in
                  </button>
                )}
              </div>
              {isPending && (
                <p className="sell-hero-pending">Your application is under review (1–2 business days).</p>
              )}
            </div>

            <div className="sell-hero-imgs">
              <div className="sell-hero-img-main">
                <img src="https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80" alt="Fresh vegetables" />
              </div>
              <div className="sell-hero-img-side">
                <img src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=80" alt="Fresh fruits" />
                <img src="https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80" alt="Root vegetables" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="sell-section sell-section--gray">
        <div className="sell-container sell-container--narrow">
          <div className="sell-section-head">
            <h2>Why sell on Emoorm?</h2>
          </div>
          <div className="sell-benefits-grid">
            {BENEFITS.map(b => (
              <div key={b.title} className="sell-benefit-card">
                <p className="sell-benefit-title">{b.title}</p>
                <p className="sell-benefit-desc">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="sell-section">
        <div className="sell-container sell-container--narrow">
          <div className="sell-section-head">
            <h2>How it works</h2>
            <p>Up and running in under 10 minutes.</p>
          </div>
          <div className="sell-steps">
            {STEPS.map(s => (
              <div key={s.n} className="sell-step-card">
                <span className="sell-step-n">{s.n}</span>
                <div>
                  <p className="sell-step-title">{s.title}</p>
                  <p className="sell-step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="sell-section sell-section--gray">
        <div className="sell-container sell-container--narrow sell-container--center">
          <div className="sell-section-head">
            <h2>What can you sell?</h2>
            <p>Local, fresh, and made in Oriental Mindoro.</p>
          </div>
          <div className="sell-cat-chips">
            {CATEGORIES.map(cat => (
              <span key={cat} className="sell-cat-chip">{cat}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="sell-final-cta">
        <div className="sell-container sell-final-inner">
          <h2>Ready to start selling?</h2>
          <p>Free, local, and built for you.</p>
          <div className="sell-final-btns">
            <button className="sell-final-btn" onClick={handleCTA} disabled={isPending}>
              {isPending ? 'Application Pending' : 'Start selling'} <ArrowRight size={16} />
            </button>
            {!isAuthenticated && (
              <button
                className="sell-final-btn-ghost"
                onClick={() => navigate('/login?redirect=/seller/apply')}
              >
                Already a seller? Log in
              </button>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
