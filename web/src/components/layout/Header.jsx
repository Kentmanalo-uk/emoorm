import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  House as HomeIcon, MagnifyingGlass as Search, ShoppingCart, BellSlash as BellOff, List as Menu, X,
  ChatCircle, Bell, User,
  ShoppingBag, CheckCircle, Package, XCircle, Star, WarningCircle as AlertCircle, Info,
  Clock, TrendUp as TrendingUp, ChatCircleDots, ArrowCounterClockwise, Megaphone, Tag, Question, Scales,
} from '@phosphor-icons/react';
import useAuthStore from '../../store/authStore';
import FeedbackDialog from '../feedback/FeedbackDialog';
import useCartStore from '../../store/cartStore';
import useAccountSwitchStore from '../../store/accountSwitchStore';
import axios from '../../lib/axios';
import { notificationHref } from '../../lib/notificationLink';
import LanguageSwitcher from '../LanguageSwitcher';
import AppLogo from '../AppLogo';
import ImageSearchModal from './ImageSearchModal';
import InstallAppBar from './InstallAppBar';
import './Header.css';
import UserAvatar from '../ui/UserAvatar';
import NotificationPicture from '../NotificationPicture';
import { isBottomNavTab } from '../../lib/navTabs';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { POPULAR_SUGGESTIONS, loadRecent, saveRecent, removeRecentTerm } from '../../lib/buyerSearch';
import { afterSignOutPath } from '../../lib/afterSignOut';
import { pollWhileVisible } from '../../lib/visiblePoll';

const NOTIF_TYPE = {
  ORDER_RECEIVED: { Icon: ShoppingBag, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'New order' },
  ORDER_CONFIRMED: { Icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Order confirmed' },
  ORDER_READY: { Icon: Package, color: 'var(--t-orange-500, #f97316)', bg: 'var(--t-orange-100, #ffedd5)', label: 'Ready for pickup' },
  ORDER_COMPLETED: { Icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Order completed' },
  ORDER_CANCELLED: { Icon: XCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Order cancelled' },
  PRODUCT_APPROVED: { Icon: Star, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Product approved' },
  PRODUCT_SUSPENDED: { Icon: AlertCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Product suspended' },
  SELLER_APPROVED: { Icon: Star, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Seller approved' },
  SELLER_SUSPENDED: { Icon: XCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Seller suspended' },
  REPORT_SUBMITTED: { Icon: AlertCircle, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Report submitted' },
  REPORT_RESOLVED: { Icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Report resolved' },
  SYSTEM_ANNOUNCEMENT: { Icon: Info, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Announcement' },
  STORE_MESSAGE: { Icon: ChatCircleDots, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'Message' },
  SUPPORT_MESSAGE: { Icon: ChatCircleDots, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Municipal admin' },
  SUPPORT_RESOLVED: { Icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Municipal admin' },
  STORE_NEW_PRODUCT: { Icon: Tag, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'New product' },
  STORE_PROMOTION: { Icon: Star, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Promotion' },
  STORE_ANNOUNCEMENT: { Icon: Megaphone, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Shop news' },
  RETURN_REQUESTED: { Icon: ArrowCounterClockwise, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Return' },
  RETURN_APPROVED: { Icon: ArrowCounterClockwise, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Return approved' },
  RETURN_REJECTED: { Icon: ArrowCounterClockwise, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Return rejected' },
  RETURN_AWAITING_SHIPMENT: { Icon: ArrowCounterClockwise, color: 'var(--t-orange-500, #f97316)', bg: 'var(--t-orange-100, #ffedd5)', label: 'Return' },
  RETURN_RECEIVED: { Icon: ArrowCounterClockwise, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'Return received' },
  RETURN_REFUNDED: { Icon: ArrowCounterClockwise, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Refunded' },
  RETURN_CANCELLED: { Icon: ArrowCounterClockwise, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Return cancelled' },
  RETURN_CLOSED: { Icon: ArrowCounterClockwise, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Return closed' },
  LOW_STOCK: { Icon: AlertCircle, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Low stock' },
  PRICE_DROP: { Icon: Tag, color: 'var(--t-primary-500, #10b981)', bg: 'var(--t-primary-100, #d1fae5)', label: 'On sale' },
  PRODUCT_QUESTION: { Icon: Question, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'Question' },
  PRODUCT_ANSWER: { Icon: ChatCircleDots, color: 'var(--t-primary-500, #10b981)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Answer' },
  RETURN_DISPUTED: { Icon: Scales, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Return dispute' },
  RETURN_DISPUTE_RESOLVED: { Icon: Scales, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'Dispute decided' },
  DEFAULT: { Icon: Info, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Notification' },
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

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const startAccountSwitch = useAccountSwitchStore((s) => s.start);
  const { getItemCount } = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');
  // Platform feedback lives in a dialog rather than a page: it is a one-way
  // note, so navigating away from what you were doing to send it is wrong.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Chats with a message from a shop not read yet (the Messages tab's badge).
  const [unreadChats, setUnreadChats] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState([]);
  const [headerHidden, setHeaderHidden] = useState(false);
  // At the very top of the page: phones drop the header's shadow there, so it
  // runs into the search suggestions under it (Home).
  const [atTop, setAtTop] = useState(() => window.scrollY < 4);
  const lastScrollY = useRef(window.scrollY);
  const searchWrapRef = useRef(null);

  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecent);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  const cartCount = getItemCount();
  const isCartPage = location.pathname === '/cart';
  // Phones: the bottom navigation belongs to the five tab pages; every other
  // page has its own back button and gets the full height.
  const isTabPage = isBottomNavTab(location.pathname);
  const isPhone = usePhoneLayout();
  // Before the page shows, so it is laid out (and scrolled back) with it.
  useLayoutEffect(() => {
    document.body.classList.toggle('no-bottom-nav', !isTabPage);
    return () => document.body.classList.remove('no-bottom-nav');
  }, [isTabPage]);

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
        setAtTop(y < 4);

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
      setUnreadChats(0);
      setRecentNotifs([]);
      return;
    }
    const fetchAll = async () => {
      try {
        const [countRes, listRes, chatRes] = await Promise.all([
          axios.get('/notifications/unread/count', { params: { audience: 'BUYER' }, quiet: true }),
          axios.get('/notifications', { params: { page: 1, pageSize: 5, audience: 'BUYER' }, quiet: true }),
          axios.get('/messages/unread-count', { quiet: true }).catch(() => null),
        ]);
        setUnreadCount(countRes.data?.count ?? 0);
        setRecentNotifs(listRes.data || []);
        if (chatRes) setUnreadChats(chatRes.data?.count ?? 0);
      } catch { /* silent */ }
    };
    fetchAll();
    const interval = pollWhileVisible(fetchAll, 5 * 60 * 1000);
    // A new one just popped up (NotificationWatcher): count it now.
    window.addEventListener('emoorm:notifications', fetchAll);
    return () => {
      interval();
      window.removeEventListener('emoorm:notifications', fetchAll);
    };
  }, [isAuthenticated]);

  // Opening a tab (reading chats there, say) refreshes the chat badge.
  useEffect(() => {
    if (!isAuthenticated || !isTabPage) return;
    axios.get('/messages/unread-count', { quiet: true })
      .then((res) => setUnreadChats(res.data?.count ?? 0))
      .catch(() => {});
  }, [isAuthenticated, isTabPage, location.pathname, location.search]);

  // The bell preview is a shortcut, not a dead list: a row marks itself read
  // and goes wherever the notification points.
  const openNotif = (n) => {
    if (!n.isRead) {
      setRecentNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      axios.put(`/notifications/${n.id}/read`).catch(() => { /* the next poll will correct it */ });
    }
    const href = notificationHref(n);
    navigate(href || '/notifications');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      if (isPhone) navigate('/search');
      return;
    }
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
    setRecentSearches(removeRecentTerm(term));
  };

  const handleLogout = () => {
    logout();
    navigate(afterSignOutPath('/login'), { replace: true });
  };

  const handleImageFileSelected = (file) => {
    setImageModalOpen(false);
    navigate('/search/image', { state: { file } });
  };

  // Rotating placeholder — swap every 3s with a small fade.
  useEffect(() => {
    const interval = pollWhileVisible(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_SUGGESTIONS.length);
        setPlaceholderVisible(true);
      }, 220);
    }, 3000);
    return () => interval();
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

  // Seller links play the account-switch transition. Modified clicks
  // (new tab, etc.) keep the browser's default behaviour.
  const enterSeller = (path) => (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startAccountSwitch('seller', path);
  };

  return (
    <>
      {/* Top Bar */}
      <nav
        aria-label="Quick links"
        className="topbar"
        style={{ transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)' }}
      >
        <div className="topbar-container">
          <div className="topbar-left">
            {isAuthenticated && (user?.role === 'MUNICIPAL_ADMIN' || user?.role === 'SUPER_ADMIN') ? (
              <Link to="/admin" className="topbar-link topbar-link-sell">ADMIN PANEL</Link>
            ) : isAuthenticated && user?.role === 'SELLER' ? (
              <Link to="/seller" className="topbar-link topbar-link-sell" onClick={enterSeller('/seller')}>SELLER DASHBOARD</Link>
            ) : (
              <Link to="/sell" className="topbar-link topbar-link-sell">SELL ON EMOORM</Link>
            )}
            <span className="topbar-divider">|</span>
            <Link to="/help" className="topbar-link">HELP &amp; SUPPORT</Link>
            <span className="topbar-divider">|</span>
            <button
              type="button"
              className="topbar-link topbar-link-button"
              onClick={() => setFeedbackOpen(true)}
            >
              FEEDBACK
            </button>
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
                          <BellOff size={28} weight="fill" />
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
                                className={`notif-dropdown-row is-linkable ${!n.isRead ? 'is-unread' : ''}`}
                                role="link"
                                tabIndex={0}
                                onClick={() => openNotif(n)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openNotif(n);
                                  }
                                }}
                              >
                                {/* The product, the person or the shop, or the kind's icon. */}
                                <NotificationPicture
                                  picture={n.picture}
                                  Icon={Icon}
                                  color={cfg.color}
                                  bg={cfg.bg}
                                  size={34}
                                  iconWeight="regular"
                                  className="notif-dropdown-picture"
                                />
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
                  <UserAvatar
                    src={user?.profilePhoto}
                    name={user?.fullName || 'U'}
                    alt=""
                    imgClassName="account-avatar"
                    fallbackClassName="account-avatar account-avatar-fallback"
                  />
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
                          <Link to="/seller" onClick={enterSeller('/seller')}>Seller Center</Link>
                          <Link to="/seller/products" onClick={enterSeller('/seller/products')}>My Products</Link>
                          <Link to="/seller/orders" onClick={enterSeller('/seller/orders')}>Store Orders</Link>
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
                      <Link to="/help">Help &amp; Support</Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Header */}
      <header
        className={`header ${location.pathname === '/' ? 'is-home' : ''} ${isCartPage ? 'is-cart' : ''}${atTop ? ' is-at-top' : ''}`}
        style={{
          transform: headerHidden
            ? 'translateY(calc(-1 * var(--header-hide-offset)))'
            : 'translateY(0)',
          top: 'var(--topbar-height)',
        }}
      >
        <div className="header-container">
          <div className={isCartPage ? 'cart-header-context' : undefined}>
            <Link to="/" className="header-logo" aria-label="Emoorm home">
              <AppLogo className="header-logo-icon" alt="" />
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
                    aria-label="Search products"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    // Phones search on their own page (SearchStart), which opens
                    // the keyboard once. This box is read-only there, so tapping
                    // it never starts a keyboard of its own: opening one here and
                    // closing it on the way out made Android drop the search
                    // page's keyboard too (the close landing after its open).
                    readOnly={isPhone}
                    onFocus={() => {
                      if (isPhone) {
                        navigate('/search');
                        return;
                      }
                      setSearchFocused(true);
                    }}
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
                    <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    <path d="M7 5L8 3H12L13 5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="submit" className="header-search-button" aria-label="Search">
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

            <Link to="/cart" className="header-cart" aria-label={cartCount > 0 ? `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : 'Cart'}>
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
                aria-label="Search products"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="header-search-input"
              />
              <button type="submit" className="header-search-button" aria-label="Search">
                <Search size={20} />
              </button>
            </form>
          </div>
          <div className="header-mobile-links">
            <Link to="/sell" className="header-mobile-link">Sell on Emoorm</Link>
            <Link to="/help" className="header-mobile-link">Help &amp; Support</Link>
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

      {isTabPage && <InstallAppBar />}
      {isTabPage && <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link className={location.pathname === '/' ? 'is-active' : ''} to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>
          <HomeIcon size={21} weight={location.pathname === '/' ? 'fill' : 'light'} />
          <span>Home</span>
        </Link>
        <Link className={location.pathname === '/cart' ? 'is-active' : ''} to="/cart" aria-current={location.pathname === '/cart' ? 'page' : undefined}>
          <span className="mobile-bottom-icon-wrap">
            <ShoppingCart size={21} weight={location.pathname === '/cart' ? 'fill' : 'light'} />
            {cartCount > 0 && <b aria-label={`${cartCount} in cart`}>{cartCount > 99 ? '99+' : cartCount}</b>}
          </span>
          <span>Cart</span>
        </Link>
        <Link className={location.pathname.startsWith('/messages') ? 'is-active' : ''} to="/messages" aria-current={location.pathname.startsWith('/messages') ? 'page' : undefined}>
          <span className="mobile-bottom-icon-wrap">
            <ChatCircle size={21} weight={location.pathname.startsWith('/messages') ? 'fill' : 'light'} />
            {unreadChats > 0 && <b aria-label={`${unreadChats} unread chats`}>{unreadChats > 99 ? '99+' : unreadChats}</b>}
          </span>
          <span>Messages</span>
        </Link>
        <Link className={location.pathname.startsWith('/notifications') ? 'is-active' : ''} to="/notifications" aria-current={location.pathname.startsWith('/notifications') ? 'page' : undefined}>
          <span className="mobile-bottom-icon-wrap">
            <Bell size={21} weight={location.pathname.startsWith('/notifications') ? 'fill' : 'light'} />
            {unreadCount > 0 && <b aria-label={`${unreadCount} unread notifications`}>{unreadCount > 99 ? '99+' : unreadCount}</b>}
          </span>
          <span>Notifications</span>
        </Link>
        <Link className={location.pathname.startsWith('/profile') ? 'is-active' : ''} to="/profile" aria-current={location.pathname.startsWith('/profile') ? 'page' : undefined}>
          <User size={21} weight={location.pathname.startsWith('/profile') ? 'fill' : 'light'} />
          <span>Profile</span>
        </Link>
      </nav>}

      <ImageSearchModal
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onFile={handleImageFileSelected}
      />
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}

    </>
  );
};

export default Header;
