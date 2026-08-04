import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Bell, Menu, X, Heart } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import axios from '../../lib/axios';
import LanguageSwitcher from '../LanguageSwitcher';
import './Header.css';

const Header = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { getItemCount } = useCartStore();
  const { getCount: getWishlistCount } = useWishlistStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const cartCount = getItemCount();
  const wishlistCount = getWishlistCount();

  // Poll notification unread count when authenticated
  useEffect(() => {
    if (!isAuthenticated) { setUnreadCount(0); return; }
    const fetchUnread = async () => {
      try {
        const res = await axios.get('/notifications/unread/count');
        setUnreadCount(res.data?.count ?? 0);
      } catch { }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Top Bar */}
      <div className="topbar">
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
            <Link to="/wishlist" className="topbar-icon-button" title="Wishlist">
              <Heart size={16} />
              {wishlistCount > 0 && <span className="topbar-count-badge">{wishlistCount}</span>}
            </Link>
            <span className="topbar-divider">|</span>
            {isAuthenticated ? (
              <Link to="/notifications" className="topbar-icon-button" title="Notifications">
                <Bell size={16} />
                {unreadCount > 0 && <span className="topbar-count-badge">{unreadCount}</span>}
              </Link>
            ) : (
              <button className="topbar-icon-button">
                <Bell size={16} />
              </button>
            )}
            <span className="topbar-divider">|</span>
            <LanguageSwitcher variant="topbar" />
            <span className="topbar-divider">|</span>
            <div className="account-hover">
              {isAuthenticated ? (
                <Link to="/profile" className="topbar-link account-trigger account-trigger-user">
                  {user?.profilePhoto ? (
                    <img src={user.profilePhoto} alt="" className="account-avatar" />
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
                      <h4>Your Lists</h4>
                      <Link to="/wishlist">Wishlist</Link>
                      <Link to="/products">Browse Products</Link>
                    </div>
                    <div className="account-dropdown-col">
                      <h4>Your Account</h4>
                      <Link to="/profile">Account</Link>
                      <Link to="/orders">Orders</Link>
                      {isAuthenticated && <Link to="/notifications">Notifications</Link>}
                      <Link to="/cart">Cart</Link>
                      {isAuthenticated && user?.role === 'SELLER' && (
                        <Link to="/seller">Seller Dashboard</Link>
                      )}
                      {isAuthenticated && (user?.role === 'MUNICIPAL_ADMIN' || user?.role === 'SUPER_ADMIN') && (
                        <Link to="/admin">Admin Panel</Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="header">
        <div className="header-container">
          {/* Logo */}
          <Link to="/" className="header-logo">
            <img src="/brand-icon.png" alt="Emoorm" className="header-logo-icon" />
            <span className="header-logo-text">emoorm</span>
          </Link>

          {/* Search Bar + Cart (Centered) */}
          <div className="header-center">
            <form onSubmit={handleSearch} className="header-search">
              <input
                type="text"
                placeholder="Organic Products"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="header-search-input"
              />
              <button type="button" className="header-search-camera">
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

            <Link to="/cart" className="header-cart">
              <ShoppingCart size={24} />
              {cartCount > 0 && <span className="header-cart-badge">{cartCount}</span>}
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="header-mobile-toggle"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

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
    </>
  );
};

export default Header;
