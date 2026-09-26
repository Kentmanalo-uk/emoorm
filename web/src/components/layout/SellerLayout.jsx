import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour as LayoutGrid, ShoppingBag, ChatText as MessageSquare, Package, Star, ChartPie as PieChart,
  Wallet, Storefront as StoreIcon, CaretDown as ChevronDown, CaretRight as ChevronRight, CaretLeft as ChevronLeft, Bell, SignOut as LogOut,
  ArrowCounterClockwise as ReturnsIcon, Headset, ArrowsLeftRight, List, X,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import useAccountSwitchStore from '../../store/accountSwitchStore';
import useSidebarCollapse from '../../hooks/useSidebarCollapse';
import { useCompactLayout, useMobileNav } from '../../hooks/useMobileNav';
import LanguageSwitcher from '../LanguageSwitcher';
import ShellSearch from './ShellSearch';
import NavBadge from './NavBadge';
import useAttention from '../../hooks/useAttention';
import { sellerSearchSources } from '../../lib/shellSearchSources';
import AppLogo from '../AppLogo';
import SellerCenterGuide from '../seller/SellerCenterGuide';
import ConfirmDialog from '../ui/ConfirmDialog';
import AppRail from './AppRail';
import './SellerLayout.css';
import './SellerShellMobile.css';
import UserAvatar from '../ui/UserAvatar';

/**
 * Persistent shell for /seller/* routes.
 * Guards SELLER role, renders sidebar + topbar + <Outlet />.
 */
export default function SellerLayout() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [store, setStore] = useState(null);
  const [storedCollapsed, toggleCollapsed] = useSidebarCollapse();
  const isCompact = useCompactLayout();
  // The drawer on small screens always shows full labels.
  const collapsed = storedCollapsed && !isCompact;
  const mobileNav = useMobileNav(location.pathname);
  const [productsOpen, setProductsOpen] = useState(
    location.pathname.startsWith('/seller/products')
  );
  const [shopOpen, setShopOpen] = useState(
    location.pathname.startsWith('/seller/store')
    || location.pathname.startsWith('/seller/settings')
    || location.pathname === '/seller/shop-profile'
  );
  const [unreadCount, setUnreadCount] = useState(0);

  // New orders, returns to review, unread messages and low stock, counted
  // once on the server so the sidebar can point at the work. The endpoint is
  // seller-only, and a SUPER_ADMIN can open the Seller Center too, so it is
  // skipped for them rather than left to 403.
  const { byLink: waiting } = useAttention(user?.role === 'SELLER' ? '/stores/my/attention' : null);
  const badge = (path) => <NavBadge {...(waiting[path] || {})} />;
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const accountRef = useRef(null);
  const startAccountSwitch = useAccountSwitchStore((s) => s.start);
  const rememberShop = useAccountSwitchStore((s) => s.setShop);

  // Hooks run on every render, so the sign-in and role gates come after
  // them (below). Returning early above an effect changed the hook count
  // between renders, which React reports as a render error the moment the
  // session ends while this layout is mounted.
  const allowed = isAuthenticated && (user?.role === 'SELLER' || user?.role === 'SUPER_ADMIN');

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/stores/my/store');
        if (!cancelled) setStore(res.data);
      } catch {
        /* no store yet */
      }
      try {
        const n = await axios.get('/notifications/unread/count', { params: { audience: 'SELLER' } });
        if (!cancelled) setUnreadCount(n.data?.count ?? 0);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [allowed]);

  // Keep the switch animation's shop logo in sync (also after profile edits).
  useEffect(() => {
    if (store) rememberShop(store);
  }, [store, rememberShop]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  if (!isAuthenticated) return <Navigate to="/login?redirect=/seller" replace />;
  if (!allowed) return <Navigate to="/sell" replace />;

  const switchToPersonal = () => {
    setAccountOpen(false);
    startAccountSwitch('personal', '/profile');
  };

  const handleLogout = () => {
    setLogoutOpen(false);
    logout();
    navigate('/login');
  };

  const shopName = store?.name || 'My Shop';
  const shopInitial = shopName.trim().charAt(0).toUpperCase();
  const personalName = user?.fullName || user?.email || 'Personal account';
  const personalInitial = personalName.trim().charAt(0).toUpperCase();
  const shopAvatar = store?.logo ? (
    <img src={resolveImg(store.logo)} alt="" className="sc-user-avatar" />
  ) : (
    <span className="sc-user-avatar sc-user-avatar--fallback">{shopInitial}</span>
  );

  const crumbs = buildCrumbs(location.pathname);

  return (
    <div className={`sc-shell ${collapsed ? 'is-collapsed' : ''}${mobileNav.open ? ' is-nav-open' : ''}`}>
      <div className="sc-nav-backdrop" onClick={mobileNav.hide} aria-hidden="true" />
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sc-sidebar" aria-label="Seller navigation">
        <div className="sc-sidebar-inner">
          <div className="sc-brand-row">
            <Link to="/seller" className="sc-brand">
              <AppLogo className="sc-brand-logo" />
              <span className="sc-brand-text">
                <strong>Emoorm</strong>
                <span>Seller Center</span>
              </span>
            </Link>
            <button
              type="button"
              className="sc-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
            <button type="button" className="sc-drawer-close" onClick={mobileNav.hide} aria-label="Close menu">
              <X size={18} weight="bold" />
            </button>
          </div>

          <nav className="sc-nav">
            <NavLink to="/seller" end className={navCls} title="Dashboard">
              <LayoutGrid size={17} weight="fill" /> <span>Dashboard</span>
            </NavLink>
            <NavLink to="/seller/orders" className={navCls} title="My Orders">
              <ShoppingBag size={17} weight="fill" /> <span>My Orders</span>{badge('/seller/orders')}
            </NavLink>
            <NavLink to="/seller/returns" className={navCls} title="Returns & refunds">
              <ReturnsIcon size={17} weight="fill" /> <span>Returns & refunds</span>{badge('/seller/returns')}
            </NavLink>
            <NavLink to="/seller/messages" className={navCls} title="Messages">
              <MessageSquare size={17} weight="fill" /> <span>Messages</span>{badge('/seller/messages')}
            </NavLink>
            <NavLink to="/seller/support" className={navCls} title="Admin messages">
              <Headset size={17} weight="fill" /> <span>Admin</span>{badge('/seller/support')}
            </NavLink>

            {/* Products group */}
            <button
              type="button"
              className={`sc-nav-item sc-nav-group ${productsOpen && !collapsed ? 'is-open' : ''}`}
              onClick={() => collapsed ? navigate('/seller/products') : setProductsOpen((v) => !v)}
              aria-expanded={productsOpen && !collapsed}
              title="Products"
            >
              <Package size={17} weight="fill" />
              <span>Products</span>
              <ChevronDown size={15} className="sc-nav-chevron" />
            </button>
            <div className={`sc-subnav-wrap${productsOpen ? ' is-open' : ''}`}>
              <div className="sc-subnav">
                <NavLink to="/seller/products" end className={subNavCls}>
                  All Products{badge('/seller/products')}
                </NavLink>
                <NavLink to="/seller/products/new" className={subNavCls}>
                  Add New
                </NavLink>
              </div>
            </div>

            <NavLink to="/seller/notifications" className={navCls} title="Notifications">
              <Bell size={17} weight="fill" /> <span>Notifications</span>
              <NavBadge count={unreadCount} label="unread" />
            </NavLink>
            <NavLink to="/seller/reviews" className={navCls} title="Reviews">
              <Star size={17} weight="fill" /> <span>Reviews</span>
            </NavLink>
            <NavLink to="/seller/analytics" className={navCls} title="Analytics">
              <PieChart size={17} weight="fill" /> <span>Analytics</span>
            </NavLink>
            <NavLink to="/seller/finance" className={navCls} title="Finance">
              <Wallet size={17} weight="fill" /> <span>Finance</span>
            </NavLink>

            {/* Shop group */}
            <button
              type="button"
              className={`sc-nav-item sc-nav-group ${shopOpen && !collapsed ? 'is-open' : ''}`}
              onClick={() => collapsed ? navigate('/seller/store') : setShopOpen((v) => !v)}
              aria-expanded={shopOpen && !collapsed}
              title="My Shop"
            >
              <StoreIcon size={17} weight="fill" />
              <span>My Shop</span>
              <ChevronDown size={15} className="sc-nav-chevron" />
            </button>
            <div className={`sc-subnav-wrap${shopOpen ? ' is-open' : ''}`}>
              <div className="sc-subnav">
                <NavLink to="/seller/store" className={subNavCls}>
                  Shop Profile
                </NavLink>
                <NavLink to="/seller/fulfillment" className={subNavCls}>
                  Fulfillment & Payment
                </NavLink>
                <NavLink to="/seller/settings" className={subNavCls}>
                  Settings
                </NavLink>
                {store?.slug && (
                  <a
                    href={`/store/${store.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sc-subnav-link"
                  >
                    View Storefront
                  </a>
                )}
              </div>
            </div>
          </nav>

          <div className={`sc-account${accountOpen ? ' is-open' : ''}`} ref={accountRef}>
            <div className="sc-account-menu" role="menu" aria-label="Account" aria-hidden={!accountOpen}>
              <div className="sc-account-menu-head">
                {shopAvatar}
                <span className="sc-account-menu-meta">
                  <strong>{shopName}</strong>
                  <span>Seller account</span>
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                className="sc-account-switch"
                tabIndex={accountOpen ? 0 : -1}
                onClick={switchToPersonal}
              >
                <UserAvatar
                  src={user?.profilePhoto}
                  name={personalInitial}
                  alt=""
                  imgClassName="sc-account-switch-avatar"
                  fallbackClassName="sc-account-switch-avatar sc-account-switch-avatar--fallback"
                />
                <span className="sc-account-menu-meta">
                  <strong className="sc-account-switch-label">Switch to Personal Account</strong>
                  <span>{personalName}</span>
                </span>
                <ArrowsLeftRight size={15} weight="bold" className="sc-account-switch-icon" />
              </button>
            </div>

            <button
              type="button"
              className="sc-user-card"
              title={shopName}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((open) => !open)}
            >
              {shopAvatar}
              <span className="sc-user-meta">
                <strong>{shopName}</strong>
                <span>Seller account</span>
              </span>
              <ChevronRight size={14} className="sc-user-caret" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="sc-main">
        <header className="sc-topbar">
          <button
            type="button"
            className="sc-menu-btn"
            onClick={mobileNav.toggle}
            aria-label="Open menu"
            aria-expanded={mobileNav.open}
          >
            <List size={22} weight="bold" />
          </button>
          <span className="sc-mobile-title">{crumbs[crumbs.length - 1]?.label}</span>
          {/* The breadcrumb trail only ever repeated the page you were already
              looking at, so the space now carries a search box instead. It is
              hidden on the mobile shell, which shows the page title. */}
          <ShellSearch
            className="sc-search"
            sources={sellerSearchSources}
            placeholder="Search your products and orders"
            ariaLabel="Search the Seller Center"
            scope="seller"
          />

          {/* Shown on small screens; the right rail takes over on desktop. */}
          <div className="sc-topbar-actions">
            <LanguageSwitcher variant="shell" />
            <Link to="/seller/notifications" className="sc-icon-btn" title="Seller notifications">
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="sc-icon-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <button
              type="button"
              className="sc-icon-btn"
              onClick={() => setLogoutOpen(true)}
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="sc-content">
          {store && store.isApproved === false && (
            <div className="sc-private-banner" role="status">
              <strong>Your shop is private while your application is reviewed.</strong>
              <span>
                Add products and set up delivery and payments now. Buyers will see your shop
                as soon as an admin approves it.
              </span>
            </div>
          )}
          <Outlet context={{ store, setStore }} />
        </main>
        <SellerCenterGuide store={store} setStore={setStore} />
      </div>

      <AppRail unreadCount={unreadCount} onLogout={handleLogout} />

      {/* Phone tab bar */}
      <nav className="sc-tabbar" aria-label="Seller sections">
        <NavLink to="/seller" end className={tabCls}>
          <LayoutGrid size={22} weight="fill" /><span>Dashboard</span>
        </NavLink>
        <NavLink to="/seller/orders" className={tabCls}>
          <ShoppingBag size={22} weight="fill" /><span>Orders</span>
        </NavLink>
        <NavLink to="/seller/products" className={tabCls}>
          <Package size={22} weight="fill" /><span>Products</span>
        </NavLink>
        <NavLink to="/seller/messages" className={tabCls}>
          <MessageSquare size={22} weight="fill" /><span>Messages</span>
        </NavLink>
        <button type="button" className={`sc-tab${mobileNav.open ? ' is-active' : ''}`} onClick={mobileNav.toggle}>
          <List size={22} weight="bold" /><span>Menu</span>
        </button>
      </nav>

      <ConfirmDialog
        open={logoutOpen}
        title="Sign out?"
        message="You will need to sign in again to manage your shop."
        confirmLabel="Sign out"
        danger
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function navCls({ isActive }) {
  return `sc-nav-item ${isActive ? 'sc-nav-item--active' : ''}`;
}

function subNavCls({ isActive }) {
  return `sc-subnav-link ${isActive ? 'sc-subnav-link--active' : ''}`;
}

function tabCls({ isActive }) {
  return `sc-tab${isActive ? ' is-active' : ''}`;
}

const LABELS = {
  '/seller': 'Dashboard',
  '/seller/orders': 'My Orders',
  '/seller/returns': 'Returns & refunds',
  '/seller/messages': 'Messages',
  '/seller/support': 'Admin Messages',
  '/seller/products': 'Products',
  '/seller/products/new': 'New Product',
  '/seller/reviews': 'Reviews',
  '/seller/analytics': 'Analytics',
  '/seller/finance': 'Finance',
  '/seller/store': 'Shop Profile',
  '/seller/fulfillment': 'Fulfillment & Payment',
  '/seller/settings': 'Settings',
};

function buildCrumbs(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/seller';
  const crumbs = [{ to: '/seller', label: 'Seller Center' }];

  if (clean === '/seller') {
    crumbs.push({ to: '/seller', label: 'Dashboard' });
    return crumbs;
  }

  // Handle nested paths: /seller/products/new
  const parts = clean.split('/').filter(Boolean); // ['seller', 'products', 'new']
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += '/' + parts[i];
    if (i === 0) continue; // skip 'seller' root
    const label = LABELS[acc] || capitalize(parts[i]);
    crumbs.push({ to: acc, label });
  }
  return crumbs;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
