import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import {
  ArrowRight, Star, List as Menu, X, CaretDown as ChevronDown,
  Storefront, Users, Truck, ChatCircleDots, ChartLineUp, SealCheck,
  IdentificationCard, Camera, Package,  Plus, Minus, Money,
} from '@phosphor-icons/react';
import useAuthStore from '../store/authStore';
import Footer from '../components/layout/Footer';
import AppLogo from '../components/AppLogo';
import EmptyArt from '../components/ui/EmptyArt';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import './Sell.css';

const BENEFITS = [
  { icon: Storefront, title: 'Free to open a shop', desc: 'No listing fees and no commission. What the buyer pays is what you earn.' },
  { icon: Users, title: 'Reach local buyers', desc: 'Shoppers across all 15 towns and cities of Oriental Mindoro, looking for what you make.' },
  { icon: Truck, title: 'You control delivery', desc: 'Choose the barangays you serve, or let buyers pick up from your shop.' },
  { icon: ChatCircleDots, title: 'Talk to your buyers', desc: 'Message them before and after the order to confirm details.' },
  { icon: ChartLineUp, title: 'See how you are doing', desc: 'Orders, earnings, reviews and low stock in one dashboard.' },
  { icon: SealCheck, title: 'Verified and trusted', desc: 'A verified ID badge on your shop tells buyers who they are buying from.' },
];

/* The tools a seller gets, shown with the same illustrations the app uses. */
const TOOLS = [
  { art: 'products', title: 'List what you sell', desc: 'Add photos, prices, stock and variations. Update them any time from the Seller Center.' },
  { art: 'delivery', title: 'Fulfil your way', desc: 'Deliver to the areas you choose, offer pickup, or do both. You set the rules.' },
  { art: 'payments', title: 'Get paid directly', desc: 'Cash on delivery, GCash or QR Ph. Emoorm never holds your money.' },
  { art: 'analytics', title: 'Know your numbers', desc: 'Track earnings by period, see your best sellers and export your records.' },
];

/* What an application actually asks for, so nobody is surprised. */
const REQUIREMENTS = [
  { icon: IdentificationCard, title: 'A valid government ID', desc: 'Used once to verify who you are. Your ID is never shown to buyers.' },
  { icon: Storefront, title: 'Your shop details', desc: 'Shop name, the municipality you operate in, and how you want to fulfil orders.' },
  { icon: Camera, title: 'Photos of your products', desc: 'Clear photos and honest descriptions. You can add more listings any time.' },
];

/* Answers match how the platform actually works — see the site footer. */
const FAQS = [
  {
    q: 'How much does it cost to sell?',
    a: 'Nothing. Opening a shop and listing products is free, and Emoorm takes no commission on your sales.',
  },
  {
    q: 'How do I get paid?',
    a: 'Buyers pay you directly. Depending on what you accept, that is cash on delivery, GCash, or QR Ph. Emoorm does not process or hold payments, so there is no payout waiting period.',
  },
  {
    q: 'How long does approval take?',
    a: 'Applications are reviewed by a municipal or platform administrator, usually within 1 to 2 business days. You will be notified once your shop is live.',
  },
  {
    q: 'Do I have to deliver?',
    a: 'No. You choose the municipalities and barangays you deliver to, and you can offer store pickup instead of or alongside delivery.',
  },
  {
    q: 'What about returns?',
    a: 'A buyer can request a return within 7 days if an item arrives damaged, incorrect, incomplete or not as described, unless your own return policy says otherwise. You review each request.',
  },
  {
    q: 'Can I sell and buy with the same account?',
    a: 'Yes. Your account switches between your personal profile and your Seller Center, and your buyer activity stays private.',
  },
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

/* Stands in only until the live catalogue answers. */
const CATEGORIES = [
  { name: 'Vegetables' }, { name: 'Fruits' }, { name: 'Seafood' },
  { name: 'Livestock' }, { name: 'Handicrafts' }, { name: 'Dried Goods' },
  { name: 'Local Delicacies' }, { name: 'Processed Foods' }, { name: 'Beverages' },
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
        <div className="sell-auth-drop-pointer" aria-hidden="true" />
        <div className="sell-auth-drop-inner">
          <div className="sell-auth-drop-head">
            <p className="sell-auth-drop-title">{title}</p>
            <button className="sell-auth-drop-cta" onClick={onClick}>{label}</button>
            <p className="sell-auth-drop-sub">{subtitle}</p>
          </div>
          <div className="sell-auth-drop-links">
            <h4>{variant === 'primary' ? 'Seller tools' : 'Your account'}</h4>
            {items.map(item => (
              <Link key={item.label} to={`${to}?redirect=${encodeURIComponent(item.target)}`}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
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
  const [openFaq, setOpenFaq] = useState(0);

  // The categories a seller can actually list under come from the catalogue,
  // not a hardcoded list that can promise something the platform does not have.
  const [categories, setCategories] = useState(CATEGORIES);
  useEffect(() => {
    let cancelled = false;
    axios.get('/categories')
      .then((res) => {
        const live = (res.data || []).filter((c) => c?.name);
        if (!cancelled && live.length) setCategories(live);
      })
      .catch(() => { /* the shipped list stands in */ });
    return () => { cancelled = true; };
  }, []);

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

  // Sellers already have a shop, so this page is not for them. The check sits
  // below every hook: returning above one changes the hook count between
  // renders, which React reports as a render error the moment a visitor signs
  // in as a seller while this page is mounted.
  if (isAuthenticated && user?.role === 'SELLER') {
    return <Navigate to="/seller" replace />;
  }

  return (
    <div className="sell-page">

      {/* Sticky header — topbar slides out first on scroll down */}
      <div
        className="sell-sticky"
        style={{ transform: headerVisible ? 'translateY(0)' : 'translateY(-40px)' }}
      >
        <div className="sell-topbar">
          <Star size={13} weight="fill" color="white" />
          Free to join. Built for Oriental Mindoro sellers.
        </div>

        <header className="sell-header" onMouseLeave={() => setActiveNav(null)}>
          <div className="sell-header-inner">
            <Link to="/" className="sell-logo">
              <AppLogo className="sell-logo-img" />
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
                      { label: 'Browse stores', target: '/products' },
                      { label: 'My orders', target: '/profile/orders' },
                      { label: 'Notifications', target: '/profile' },
                    ]}
                  />
                  <AuthDropdown
                    label="Start selling"
                    variant="primary"
                    onClick={() => navigate('/register?redirect=/seller/apply')}
                    to="/register"
                    title="Your Emoorm seller account"
                    subtitle="Create an account to open your shop."
                    items={[
                      { label: 'Set up storefront', target: '/seller/apply' },
                      { label: 'Manage products', target: '/seller/products' },
                      { label: 'Sales & analytics', target: '/seller' },
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
        <span className="sell-hero-glow" aria-hidden="true" />
        <div className="sell-container">
          <div className="sell-hero-layout">
            <div className="sell-hero-copy">
              <h1 className="sell-hero-h1">
                Start Selling<br />
                <span className="sell-hero-accent">in Emoorm</span>
              </h1>
              <p className="sell-hero-sub">
                Open a free shop and sell to buyers across Oriental Mindoro. Farmers,
                fisherfolk, artisans and home cooks are already here.
              </p>
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

            {/* The collage is deliberately off-grid: the tall frame sits
                lower than the stacked pair, and both cards break its edges. */}
            <div className="sell-hero-media">
              <div className="sell-hero-imgs">
                <div className="sell-hero-img-main">
                  <img src="https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80" alt="Fresh vegetables" />
                </div>
                <div className="sell-hero-img-side">
                  <img src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=80" alt="Fresh fruits" />
                  <img src="https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80" alt="Root vegetables" />
                </div>
              </div>

              {/* A glimpse of the Seller Center, so the hero shows the product. */}
              <div className="sell-hero-badge" aria-hidden="true">
                <span className="sell-hero-badge-icon"><Storefront size={30} weight="fill" /></span>
                <span>
                  <strong>Your Seller Center</strong>
                  Orders, earnings and messages in one place
                </span>
              </div>

              <div className="sell-hero-chip" aria-hidden="true">
                <span className="sell-hero-chip-icon"><Money size={28} weight="fill" /></span>
                <span>
                  <strong>Paid directly</strong>
                  Cash, GCash or QR Ph
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      {/* Benefits — heading held on the left while staggered cards pass it */}
      <section id="benefits" className="sell-section sell-section--gray sell-screen">
        <div className="sell-container sell-split">
          <div className="sell-split-aside">
            <h2 className="sell-h2">
              Built for Oriental Mindoro,<br />
              <span className="sell-h2-muted">not a marketplace that happens to reach it.</span>
            </h2>
            <p className="sell-lede">
              Every shop here is run by someone local. Buyers know who grew, caught
              or made what they are buying.
            </p>
          </div>

          <div className="sell-benefits-grid">
            {BENEFITS.map(({ title, desc }) => (
              <div key={title} className="sell-benefit-card">
                <p className="sell-benefit-title">{title}</p>
                <p className="sell-benefit-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      {/* How it works — a descending walk, heading pinned to the top left */}
      <section id="how-it-works" className="sell-section sell-screen sell-steps-section">
        <span className="sell-steps-ghost" aria-hidden="true">01 — 04</span>
        <div className="sell-container">
          <div className="sell-steps-head">
            <h2 className="sell-h2">How it works</h2>
            <p className="sell-lede">Four steps, about ten minutes, and no paperwork to post.</p>
          </div>
          <ol className="sell-steps">
            {STEPS.map(s => (
              <li key={s.n} className="sell-step-card">
                <span className="sell-step-n">{s.n}</span>
                <p className="sell-step-title">{s.title}</p>
                <p className="sell-step-desc">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What you get — the Seller Center, in the app's own illustrations */}
      {/* Tools — a layered stack of screens on the left, the list on the right */}
      <section id="tools" className="sell-section sell-section--gray sell-screen sell-tools-section">
        <div className="sell-container sell-split sell-split--reverse">
          <div className="sell-tools-stack" aria-hidden="true">
            <div className="sell-stack-card sell-stack-card--back"><EmptyArt name="revenue" size={110} /></div>
            <div className="sell-stack-card sell-stack-card--mid"><EmptyArt name="stores" size={120} /></div>
            <div className="sell-stack-card sell-stack-card--front"><EmptyArt name="analytics" size={140} /></div>
          </div>

          <div className="sell-split-main">
            <h2 className="sell-h2">Everything you need to run your shop</h2>
            <p className="sell-lede">No spreadsheets, no separate apps, nothing to install.</p>
            <ul className="sell-tools-list">
              {TOOLS.map(t => (
                <li key={t.title} className="sell-tool-row">
                  <span className="sell-tool-art"><EmptyArt name={t.art} size={52} /></span>
                  <span>
                    <strong className="sell-tool-title">{t.title}</strong>
                    <span className="sell-tool-desc">{t.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Categories */}
      {/* Categories — heading anchored left, the catalogue drifting past it */}
      <section id="categories" className="sell-section sell-screen sell-cats-section">
        <span className="sell-cats-ring" aria-hidden="true" />
        <div className="sell-container sell-cats-layout">
          <div className="sell-cats-head">
            <h2 className="sell-h2">What can<br />you sell?</h2>
            <p className="sell-lede">
              Whatever is local, fresh or made by hand in Oriental Mindoro. Pick a
              category to see what is already on the marketplace.
            </p>
            <Link to="/products" className="sell-text-link">
              Browse the marketplace <ArrowRight size={15} />
            </Link>
          </div>

          <div className="sell-cat-grid">
            {categories.map(cat => (
              <Link
                key={cat.id || cat.name}
                to={cat.slug ? `/products?category=${cat.id}` : `/products?q=${encodeURIComponent(cat.name)}`}
                className="sell-cat-tile"
              >
                <span className="sell-cat-thumb">
                  {cat.image
                    ? <img src={resolveImg(cat.image)} alt="" loading="lazy" />
                    : <Package size={22} weight="fill" />}
                </span>
                <span className="sell-cat-foot">
                  <span className="sell-cat-name">{cat.name}</span>
                  <ArrowRight size={14} className="sell-cat-go" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements — heading to the right, cards stepping down past it */}
      <section id="requirements" className="sell-section sell-section--gray sell-screen sell-req-section">
        <div className="sell-container sell-req-layout">
          <div className="sell-req-cards">
            {REQUIREMENTS.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="sell-req-card">
                <span className="sell-req-step">{i + 1}</span>
                <span className="sell-req-icon"><Icon size={30} weight="fill" /></span>
                <div>
                  <p className="sell-req-title">{title}</p>
                  <p className="sell-req-desc">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="sell-req-head">
            <h2 className="sell-h2">What you need to get started</h2>
            <p className="sell-lede">Three things. The application itself takes about ten minutes.</p>
            <div className="sell-req-art" aria-hidden="true">
              <EmptyArt name="workspace" size={124} />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — heading held at the left while the answers scroll past */}
      <section id="faq" className="sell-section sell-screen sell-faq-section">
        <div className="sell-container sell-split">
          <div className="sell-split-aside">
            <h2 className="sell-h2">Questions<br />sellers ask</h2>
            <p className="sell-lede">
              Still unsure about something? Message customer care and a real person
              will answer.
            </p>
            <Link to="/help" className="sell-text-link">
              Visit the Help Centre <ArrowRight size={15} />
            </Link>
          </div>

          <div className="sell-faq">
            {FAQS.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={f.q} className={`sell-faq-item ${isOpen ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="sell-faq-q"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? -1 : i)}
                  >
                    <span>{f.q}</span>
                    {isOpen ? <Minus size={16} /> : <Plus size={16} />}
                  </button>
                  {/* Kept in the DOM and collapsed with a grid row so the
                      open and close can be animated. */}
                  <div className="sell-faq-a" aria-hidden={!isOpen}>
                    <div className="sell-faq-a-inner">
                      <p>{f.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA — layered rings behind a centred, deliberate close */}
      <section className="sell-final-cta">
        <span className="sell-final-rings" aria-hidden="true" />
        <div className="sell-container sell-final-inner">
          <h2>Ready to start selling?</h2>
          <p>Free to open, no commission, and your buyers are already here.</p>
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
