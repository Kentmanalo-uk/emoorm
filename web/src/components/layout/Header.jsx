import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  House as HomeIcon, MagnifyingGlass as Search, ShoppingCart, BellSlash as BellOff, List as Menu, X,
  ChatCircle, Bell, User,
  ShoppingBag, CheckCircle, Package, XCircle, Star, WarningCircle as AlertCircle, Info,
  Clock, TrendUp as TrendingUp,
} from '@phosphor-icons/react';
import useAuthStore from '../../store/authStore';
import useCartStore from '../../store/cartStore';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import LanguageSwitcher from '../LanguageSwitcher';
import AppLogo from '../AppLogo';
import ImageSearchModal from './ImageSearchModal';
import './Header.css';

const NOTIF_TYPE = {
  ORDER_RECEIVED: { Icon: ShoppingBag, color: '#3b82f6', bg: '#dbeafe', label: 'New order' },
  ORDER_CONFIRMED: { Icon: CheckCircle, color: '#059669', bg: '#d1fae5', label: 'Order confirmed' },
  ORDER_READY: { Icon: Package, color: '#f97316', bg: '#ffedd5', label: 'Ready for pickup' },
  ORDER_COMPLETED: { Icon: CheckCircle, color: '#059669', bg: '#d1fae5', label: 'Order completed' },
  ORDER_CANCELLED: { Icon: XCircle, color: '#ef4444', bg: '#fee2e2', label: 'Order cancelled' },
  PRODUCT_APPROVED: { Icon: Star, color: '#f59e0b', bg: '#fef3c7', label: 'Product approved' },
  PRODUCT_SUSPENDED: { Icon: AlertCircle, color: '#ef4444', bg: '#fee2e2', label: 'Product suspended' },
  SELLER_APPROVED: { Icon: Star, color: '#059669', bg: '#d1fae5', label: 'Seller approved' },
  SELLER_SUSPENDED: { Icon: XCircle, color: '#ef4444', bg: '#fee2e2', label: 'Seller suspended' },
  REPORT_SUBMITTED: { Icon: AlertCircle, color: '#f59e0b', bg: '#fef3c7', label: 'Report submitted' },
  REPORT_RESOLVED: { Icon: CheckCircle, color: '#059669', bg: '#d1fae5', label: 'Report resolved' },
  SYSTEM_ANNOUNCEMENT: { Icon: Info, color: '#6b7280', bg: '#f3f4f6', label: 'Announcement' },
  DEFAULT: { Icon: Info, color: '#6b7280', bg: '#f3f4f6', label: 'Notification' },
};

function notifCfg(type) {
  return NOTIF_TYPE[type] || NOTIF_TYPE.DEFAULT;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const PLACEHOLDER_SUGGESTIONS = [
  'Organic Products',
  'Fresh Vegetables',
  'Native Delicacies',
  'Handicrafts',
  'Local Coffee',
  'Dried Fish',
  'Coconut Oil',
];

const POPULAR_SUGGESTIONS = [
  'Organic Honey',
  'Banana Chips',
  'Calamansi',
  'Native Bag',
  'Coconut Oil',
];

const RECENT_KEY = 'emoorm_recent_searches';

const loadRecent = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
};

const saveRecent = (query) => {
  const q = query.trim();
  if (!q) return [];
  try {
    const cur = loadRecent().filter((s) => s.toLowerCase() !== q.toLowerCase());
    const next = [q, ...cur].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
};

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { getItemCount } = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState([]);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(window.scrollY);
  const searchWrapRef = useRef(null);

  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecent);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  const cartCount = getItemCount();
  const isCartPage = location.pathname === '/cart';

  useEffect(() => {
    if (!isCartPage) return;
    setSearchQuery(new URLSearchParams(location.search).get('cartSearch') || '');
  }, [isCartPage, location.search]);

  // Hide-on-scroll header. Forces both bars visible near the top, hides them on
  // downward scroll after a 6px delta, reveals on upward scroll after 6px delta.
  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastScrollY.current;
        lastScrollY.current = y;

        if (y < 40) {
          setHeaderHidden(false);
        } else if (delta > 6) {
          setHeaderHidden(true);
        } else if (delta < -6) {
          setHeaderHidden(false);
        }

        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Poll unread count + recent notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setRecentNotifs([]);
      return;
    }
    const fetchAll = async () => {
      try {
        const [countRes, listRes] = await Promise.all([
          axios.get('/notifications/unread/count', { params: { audience: 'BUYER' } }),
          axios.get('/notifications', { params: { page: 1, pageSize: 5, audience: 'BUYER' } }),
        ]);
        setUnreadCount(countRes.data?.count ?? 0);
        setRecentNotifs(listRes.data || []);
      } catch { /* silent */ }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setRecentSearches(saveRecent(q));
    setSearchFocused(false);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleCartSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    const params = new URLSearchParams(location.search);
    if (value.trim()) params.set('cartSearch', value);
    else params.delete('cartSearch');
    navigate({ pathname: '/cart', search: params.toString() }, { replace: true });
  };

  const handleCartSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(location.search);
    if (searchQuery.trim()) params.set('cartSearch', searchQuery.trim());
    else params.delete('cartSearch');
    navigate({ pathname: '/cart', search: params.toString() }, { replace: true });
  };

  const runSuggestion = (term) => {
    setSearchQuery(term);
    setRecentSearches(saveRecent(term));
    setSearchFocused(false);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const removeRecent = (e, term) => {
    e.stopPropagation();
    const next = recentSearches.filter((s) => s !== term);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* silent */ }
    setRecentSearches(next);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleImageFileSelected = (file) => {
    setImageModalOpen(false);
    navigate('/search/image', { state: { file } });
  };

  // Rotating placeholder — swap every 3s with a small fade.
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_SUGGESTIONS.length);
        setPlaceholderVisible(true);
      }, 220);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Close suggestions dropdown on outside click.
  useEffect(() => {
    if (!searchFocused) return undefined;
    const onDocClick = (e) => {
      if (!searchWrapRef.current?.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [searchFocused]);

  const filteredRecents = searchQuery.trim()
    ? recentSearches.filter((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
    : recentSearches;

  const filteredPopular = searchQuery.trim()
    ? POPULAR_SUGGESTIONS.filter((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
    : POPULAR_SUGGESTIONS;

  const showSuggestions =
    searchFocused && (filteredRecents.length > 0 || filteredPopular.length > 0);

  return (
    <>
      {/* Top Bar */}
      <div
        className="topbar"
        style={{ transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)' }}
      >
        <div className="topbar-container">
          <div className="topbar-left">
            <Link to="/feedback" className="topbar-link topbar-link-feedback">FEEDBACK</Link>
            <span className="topbar-divider">|</span>
            {isAuthenticated && (user?.role === 'MUNICIPAL_ADMIN' || user?.role === 'SUPER_ADMIN') ? (
              <Link to="/admin" className="topbar-link topbar-link-sell">ADMIN PANEL</Link>
            ) : isAuthenticated && user?.role === 'SELLER' ? (
              <Link to="/seller" className="topbar-link topbar-link-sell">SELLER DASHBOARD</Link>
            ) : (
              <Link to="/sell" className="topbar-link topbar-link-sell">SELL ON EMOORM</Link>
            )}
            <span className="topbar-divider">|</span>
            <Link to="/customer-care" className="topbar-link">CUSTOMER CARE</Link>
          </div>
          <div className="topbar-right">
            <div className="notif-hover">
              {isAuthenticated ? (
                <Link to="/notifications" className="topbar-link notif-trigger" title="Notifications">
                  <span className="notif-trigger-label">NOTIFICATIONS</span>
                  {unreadCount > 0 && (
                    <span className="notif-trigger-badge">{unreadCount}</span>
                  )}
                </Link>
              ) : (
                <Link to="/login" className="topbar-link notif-trigger" title="Notifications">
                  <span className="notif-trigger-label">NOTIFICATIONS</span>
                </Link>
              )}

              <div className="notif-dropdown" role="menu">
                <div className="notif-dropdown-arrow" aria-hidden="true" />
                <div className="notif-dropdown-inner">
                  {isAuthenticated ? (
                    <>
                      <div className="notif-dropdown-head">
                        <h3>Notifications</h3>
                        {unreadCount > 0 && (
                          <span className="notif-dropdown-pill">{unreadCount} new</span>
                        )}
                      </div>

                      {recentNotifs.length === 0 ? (
                        <div className="notif-dropdown-empty">
                          <BellOff size={28} />
                          <p>You're all caught up.</p>
                        </div>
                      ) : (
                        <ul className="notif-dropdown-list">
                          {recentNotifs.slice(0, 5).map((n) => {
                            const cfg = notifCfg(n.type);
                            const Icon = cfg.Icon;
                            return (
                              <li
                                key={n.id}
                                className={`notif-dropdown-row ${!n.isRead ? 'is-unread' : ''}`}
                              >
                                <span
                                  className="notif-dropdown-icon"
                                  style={{ background: cfg.bg, color: cfg.color }}
                                >
                                  <Icon size={14} />
                                </span>
                                <div className="notif-dropdown-body">
                                  <p className="notif-dropdown-title">
                                    {n.title || cfg.label}
                                  </p>
                                  {n.message && (
                                    <p className="notif-dropdown-msg">{n.message}</p>
                                  )}
                                  <span className="notif-dropdown-time">
                                    {timeAgo(n.createdAt)}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <Link to="/notifications" className="notif-dropdown-viewall">
                        View all notifications
                      </Link>
                    </>
                  ) : (
                    <div className="notif-dropdown-guest">
                      <h3>Stay in the loop</h3>
                      <p>Sign in to see order updates and important alerts.</p>
                      <Link to="/login" className="notif-dropdown-signin-btn">Sign in</Link>
                      <p className="notif-dropdown-newcustomer">
                        New customer? <Link to="/register">Start here.</Link>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <span className="topbar-divider">|</span>
            <LanguageSwitcher variant="topbar" />
            <span className="topbar-divider">|</span>
            <div className="account-hover">
              {isAuthenticated ? (
                <Link to="/profile" className="topbar-link account-trigger account-trigger-user">
                  {user?.profilePhoto ? (
                    <img src={resolveImg(user.profilePhoto)} alt="" className="account-avatar" />
                  ) : (
                    <span className="account-avatar account-avatar-fallback">
                      {(user?.fullName || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="account-name">{(user?.fullName || 'My Account').toUpperCase()}</span>
                </Link>
              ) : (
                <>
                  <Link to="/login" className="topbar-link account-trigger">SIGN IN</Link>
                  <Link to="/register" className="topbar-link topbar-link-signup account-trigger">SIGN UP</Link>
                </>
              )}

              <div className="account-dropdown" role="menu">
                <div className="account-dropdown-arrow" aria-hidden="true" />
                <div className="account-dropdown-inner">
                  {isAuthenticated ? (
                    <div className="account-dropdown-header">
                      <p className="account-dropdown-greet">Hello, {user?.fullName?.split(' ')[0] || 'friend'}</p>
                      <button
                        onClick={handleLogout}
                        className="account-dropdown-signin"
                        type="button"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="account-dropdown-header">
                      <Link to="/login" className="account-dropdown-signin">Sign in</Link>
                      <p className="account-dropdown-newcustomer">
                        New customer? <Link to="/register">Start here.</Link>
                      </p>
                    </div>
                  )}

                  <div className="account-dropdown-columns">
                    <div className="account-dropdown-col">
                      <h4>Your Account</h4>
                      <Link to="/profile">Overview</Link>
                      <Link to="/profile/orders">My Orders</Link>
                      <Link to="/profile/addresses">Address</Link>
                      <Link to="/profile/messages">Messages</Link>
                      <Link to="/profile/reviews">My Reviews</Link>
                      <Link to="/notifications">Notifications</Link>
                      <Link to="/profile/settings">Settings</Link>
                    </div>
                    <div className="account-dropdown-col">
                      <h4>Your Lists</h4>
                      <Link to="/wishlist">Wishlist</Link>
                      <Link to="/profile/followed-stores">Followed Stores</Link>
                      <Link to="/cart">Shopping Cart</Link>
                      {isAuthenticated && user?.role === 'SELLER' && (
                        <>
                          <h4 className="account-dropdown-col-sub">For Sellers</h4>
                          <Link to="/seller">Seller Center</Link>
                          <Link to="/seller/products">My Products</Link>
                          <Link to="/seller/orders">Store Orders</Link>
                        </>
                      )}
                      {isAuthenticated && (user?.role === 'MUNICIPAL_ADMIN' || user?.role === 'SUPER_ADMIN') && (
                        <>
                          <h4 className="account-dropdown-col-sub">Administration</h4>
                          <Link to="/admin">Admin Panel</Link>
                          <Link to="/admin/sellers">Applications</Link>
                          <Link to="/admin/reports">Reports</Link>
                        </>
                      )}
                    </div>
                    <div className="account-dropdown-col">
                      <h4>Explore</h4>
                      <Link to="/products">Browse Products</Link>
                      <Link to="/stores">Browse Stores</Link>
                      {(!isAuthenticated || user?.role === 'BUYER') && (
                        <Link to="/sell">Sell on Emoorm</Link>
                      )}
                      <Link to="/help">Help Center</Link>
                      <Link to="/customer-care">Customer Care</Link>
                      <Link to="/feedback">Send Feedback</Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header
        className={`header ${location.pathname === '/' ? 'is-home' : ''} ${isCartPage ? 'is-cart' : ''}`}
        style={{
          transform: headerHidden
            ? 'translateY(calc(-1 * var(--header-hide-offset)))'
            : 'translateY(0)',
          top: 'var(--topbar-height)',
        }}
      >
        <div className="header-container">
          <div className={isCartPage ? 'cart-header-context' : undefined}>
            <Link to="/" className="header-logo">
              <AppLogo className="header-logo-icon" />
              <span className="header-logo-text">emoorm</span>
            </Link>
            {isCartPage && <><span className="cart-header-divider" /><span className="cart-header-title">Shopping Cart</span></>}
          </div>

          {/* Search Bar + Cart (Centered) */}
          {!isCartPage && <div className="header-center">
            <div className="header-search-wrap" ref={searchWrapRef}>
              <form onSubmit={handleSearch} className="header-search">
                <div className="header-search-input-wrap">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    className="header-search-input"
                  />
                  {!searchQuery && !searchFocused && (
                    <span
                      className={`header-search-placeholder ${placeholderVisible ? 'is-visible' : ''}`}
                      aria-hidden="true"
                    >
                      {PLACEHOLDER_SUGGESTIONS[placeholderIdx]}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="header-search-camera"
                  onClick={() => setImageModalOpen(true)}
                  title="Search by image"
                  aria-label="Search by image"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M7 5L8 3H12L13 5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                <button type="submit" className="header-search-button">
                  <Search size={20} />
                </button>
              </form>

              {showSuggestions && (
                <div className="header-search-suggest" role="listbox">
                  {filteredRecents.length > 0 && (
                    <div className="hss-group">
                      <div className="hss-group-title">Recent</div>
                      {filteredRecents.map((term) => (
                        <button
                          type="button"
                          key={`r-${term}`}
                          className="hss-row"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => runSuggestion(term)}
                        >
                          <Clock size={14} className="hss-row-icon" />
                          <span className="hss-row-text">{term}</span>
                          <span
                            className="hss-row-remove"
                            onClick={(e) => removeRecent(e, term)}
                            role="button"
                            tabIndex={-1}
                            aria-label={`Remove ${term}`}
                          >
                            <X size={12} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredPopular.length > 0 && (
                    <div className="hss-group">
                      <div className="hss-group-title">Popular</div>
                      {filteredPopular.map((term) => (
                        <button
                          type="button"
                          key={`p-${term}`}
                          className="hss-row"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => runSuggestion(term)}
                        >
                          <TrendingUp size={14} className="hss-row-icon" />
                          <span className="hss-row-text">{term}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Link to="/cart" className="header-cart">
              <ShoppingCart size={24} />
              {cartCount > 0 && <span className="header-cart-badge">{cartCount}</span>}
            </Link>
          </div>}

          {isCartPage && (
            <form className="cart-header-search" onSubmit={handleCartSearch} role="search">
              <input
                type="search"
                value={searchQuery}
                onChange={handleCartSearchChange}
                placeholder="Search in cart"
                aria-label="Search in cart"
              />
              <button type="submit" aria-label="Search in cart"><Search size={19} /></button>
            </form>
          )}

          {/* Mobile Menu Toggle */}
          <button
            className="header-mobile-toggle"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Spacer to offset fixed header */}
      <div className={`header-spacer ${location.pathname === '/' ? 'is-home' : ''} ${isCartPage ? 'is-cart' : ''}`} />

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="header-mobile-menu">
          <div className="header-mobile-search">
            <form onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="header-search-input"
              />
              <button type="submit" className="header-search-button">
                <Search size={20} />
              </button>
            </form>
          </div>
          <div className="header-mobile-links">
            <Link to="/feedback" className="header-mobile-link">Feedback</Link>
            <Link to="/sell" className="header-mobile-link">Sell on Emoorm</Link>
            <Link to="/customer-care" className="header-mobile-link">Customer Care</Link>
            {isAuthenticated ? (
              <button onClick={handleLogout} className="header-mobile-link">Sign Out</button>
            ) : (
              <>
                <Link to="/login" className="header-mobile-link">Sign In</Link>
                <Link to="/register" className="header-mobile-link">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link className={location.pathname === '/' ? 'is-active' : ''} to="/">
          <HomeIcon size={21} weight={location.pathname === '/' ? 'fill' : 'regular'} />
          <span>Home</span>
        </Link>
        <Link className={location.pathname === '/cart' ? 'is-active' : ''} to="/cart">
          <span className="mobile-bottom-icon-wrap">
            <ShoppingCart size={21} weight={location.pathname === '/cart' ? 'fill' : 'regular'} />
            {cartCount > 0 && <b>{cartCount > 99 ? '99+' : cartCount}</b>}
          </span>
          <span>Cart</span>
        </Link>
        <Link className={location.pathname.startsWith('/messages') ? 'is-active' : ''} to="/messages">
          <ChatCircle size={21} weight={location.pathname.startsWith('/messages') ? 'fill' : 'regular'} />
          <span>Messages</span>
        </Link>
        <Link className={location.pathname.startsWith('/notifications') ? 'is-active' : ''} to="/notifications">
          <Bell size={21} weight={location.pathname.startsWith('/notifications') ? 'fill' : 'regular'} />
          <span>Notifications</span>
        </Link>
        <Link className={location.pathname.startsWith('/profile') ? 'is-active' : ''} to="/profile">
          <User size={21} weight={location.pathname.startsWith('/profile') ? 'fill' : 'regular'} />
          <span>Profile</span>
        </Link>
      </nav>

      <ImageSearchModal
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onFile={handleImageFileSelected}
      />
    </>
  );
};

export default Header;
