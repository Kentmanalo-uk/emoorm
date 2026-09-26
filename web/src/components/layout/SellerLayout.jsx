import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Link, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour as LayoutGrid, ShoppingBag, ChatText as MessageSquare, Package, Star, ChartPie as PieChart,
  Wallet, Storefront as StoreIcon, CaretDown as ChevronDown, CaretRight as ChevronRight, CaretLeft as ChevronLeft, Bell, SignOut as LogOut,
  ArrowCounterClockwise as ReturnsIcon, Headset, ArrowsLeftRight, List, X, ListChecks, ArrowLeft,
  CaretLeft, Plus, LockSimple, House, ChatCircleDots, Megaphone, User as UserIcon, Check,
} from '@phosphor-icons/react';
import { SHOP_TEMPLATES } from '../../lib/shopTemplates';
import axios from '../../lib/axios';
import { fetchSellerSetup } from '../../lib/sellerSetup';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import useAccountSwitchStore from '../../store/accountSwitchStore';
import useSidebarCollapse from '../../hooks/useSidebarCollapse';
import { useCompactLayout, useMobileNav, usePhoneLayout } from '../../hooks/useMobileNav';
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
import './SellerPhoneFit.css';
import '../../pages/SellerSetup.css';
import './SellerMobile.css';
import '../../pages/SellerApp.css';
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
  const isPhone = usePhoneLayout();
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
  // Phone Chat header: "with Buyers ▾" menu.
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
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

  // The new-shop checklist (Shop setup). Re-read on every page change until
  // it is complete, so the sidebar's progress follows what the seller just
  // saved; once complete it stops asking.
  const [setup, setSetup] = useState(null);
  const refreshSetup = useCallback(async () => {
    try {
      const next = await fetchSellerSetup();
      setSetup(next);
      return next;
    } catch {
      return null;
    }
  }, []);
  const setupComplete = setup?.complete === true;
  useEffect(() => {
    if (!store?.id || user?.role !== 'SELLER' || setupComplete) return;
    refreshSetup();
  }, [store?.id, user?.role, location.pathname, setupComplete, refreshSetup]);

  // A link like /seller/fulfillment#delivery-fee opens that card: the page
  // loads its data first, so wait for the card to appear, then bring it into
  // view and flash it.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return undefined;
    let tries = 0;
    let flashTimer;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      tries += 1;
      if (!el && tries < 30) return;
      window.clearInterval(timer);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('sc-flash');
      flashTimer = window.setTimeout(() => el.classList.remove('sc-flash'), 1800);
    }, 100);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(flashTimer);
    };
  }, [location.pathname, location.hash]);

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

  // Phones work like a seller app: four tabs (Home, Chat, Marketing, Me) on
  // the bottom bar, Home and Me drawing their own shop header, and every
  // other page a back arrow with its title (and no tab bar).
  const cleanPath = location.pathname.replace(/\/$/, '') || '/seller';
  const editingProduct = cleanPath === '/seller/products' && new URLSearchParams(location.search).has('edit');
  const isTabRoot = PHONE_TABS.includes(cleanPath) && !editingProduct;
  const ownHeader = PHONE_OWN_HEADER.includes(cleanPath);
  const templateKey = cleanPath.startsWith('/seller/decorate/templates/') ? cleanPath.split('/').pop() : null;
  const phoneTitle = editingProduct
    ? 'Edit product'
    : templateKey
      ? (SHOP_TEMPLATES.find((t) => t.key === templateKey)?.name || 'Template')
      : PHONE_TITLES[cleanPath] || crumbs[crumbs.length - 1]?.label || 'Seller Center';
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else if (cleanPath.startsWith('/seller/decorate/templates/')) navigate('/seller/decorate/templates');
    else if (/^\/seller\/(products|orders|returns|reviews|analytics|finance)/.test(cleanPath)) navigate('/seller');
    else navigate('/seller/menu');
  };
  const chatUnread = waiting['/seller/messages']?.count || 0;

  return (
    <div className={`sc-shell ${collapsed ? 'is-collapsed' : ''}${mobileNav.open ? ' is-nav-open' : ''}${isPhone && !isTabRoot ? ' is-subpage' : ''}`}>
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
            {setup && !setup.complete && (
              <NavLink to="/seller/setup" className={navCls} title="Shop setup">
                <ListChecks size={17} weight="fill" /> <span>Shop setup</span>
                <span className="sc-nav-progress" aria-label={`${setup.doneCount} of ${setup.total} done`}>
                  {setup.doneCount}/{setup.total}
                </span>
              </NavLink>
            )}
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
        {isPhone && isTabRoot && !ownHeader && (
          <header className="scm-head">
            {cleanPath === '/seller/messages' ? (
              // "Chat  [Buyers ▾]": who the list is with — buyers here, or
              // the municipal admin (its own page).
              <div className="scm-chat-title">
                <h1 className="scm-title">Chat</h1>
                <button
                  type="button"
                  className="scm-chat-switch"
                  aria-haspopup="menu"
                  aria-expanded={chatMenuOpen}
                  aria-label="Chatting with buyers. Change"
                  onClick={() => setChatMenuOpen((v) => !v)}
                >
                  Buyers <ChevronDown size={13} weight="bold" />
                </button>
                {chatMenuOpen && (
                  <>
                    <button type="button" className="scm-chat-scrim" aria-label="Close" onClick={() => setChatMenuOpen(false)} />
                    <div className="scm-chat-menu" role="menu">
                      <button type="button" role="menuitem" className="is-on" onClick={() => setChatMenuOpen(false)}>
                        <ChatCircleDots size={19} weight="fill" />
                        <span>Buyers</span>
                        <Check size={16} weight="bold" />
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setChatMenuOpen(false); navigate('/seller/support'); }}>
                        <Headset size={19} weight="fill" />
                        <span>Municipal admin</span>
                        {waiting['/seller/support']?.count > 0 && <b>{waiting['/seller/support'].count}</b>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <h1 className="scm-title">{phoneTitle}</h1>
            )}
            <div className="scm-actions">
              <Link to="/seller/notifications" className="scm-icon" aria-label="Notifications">
                <Bell size={20} />
                {unreadCount > 0 && <span className="scm-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </Link>
            </div>
          </header>
        )}
        {isPhone && !isTabRoot && (
          <header className="scm-backbar">
            <button type="button" className="scm-back" onClick={goBack} aria-label="Back">
              <CaretLeft size={22} weight="bold" />
            </button>
            <h1 className="scm-backtitle">{phoneTitle}</h1>
            {cleanPath === '/seller/products' && !editingProduct && (
              <Link to="/seller/products/new" state={{ fromList: true }} className="scm-icon scm-icon--bar" aria-label="Add product">
                <Plus size={20} weight="bold" />
              </Link>
            )}
          </header>
        )}
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
          {location.state?.fromSetup && location.pathname !== '/seller/setup' && (
            <Link to="/seller/setup" className="sc-back-setup">
              <ArrowLeft size={15} weight="bold" />
              <span>Back to shop setup</span>
              {setup && <em>{setup.doneCount} of {setup.total} done</em>}
            </Link>
          )}
          {store && store.isApproved === false && location.pathname !== '/seller/setup' && !(isPhone && ownHeader) && (
            isPhone ? (
              // Phones: one short line that opens Shop setup, not a paragraph.
              <Link to="/seller/setup" className="scm-private" role="status">
                <LockSimple size={15} weight="fill" />
                <span>Private until approved</span>
                <ChevronRight size={14} weight="bold" />
              </Link>
            ) : (
              <div className="sc-private-banner" role="status">
                <strong>Your shop is private while your application is reviewed.</strong>
                <span>
                  Add products and set up delivery and payments now. Buyers will see your shop
                  as soon as an admin approves it.
                </span>
              </div>
            )
          )}
          <Outlet
            context={{
              store,
              setStore,
              setup,
              refreshSetup,
              unreadCount,
              waiting,
              requestLogout: () => setLogoutOpen(true),
              switchToPersonal,
            }}
          />
        </main>
        <SellerCenterGuide store={store} setStore={setStore} />
      </div>

      <AppRail unreadCount={unreadCount} onLogout={handleLogout} />

      {/* Phone tab bar */}
      <nav className={`sc-tabbar sc-tabbar--app${isPhone && !isTabRoot ? ' is-hidden' : ''}`} aria-label="Seller sections">
        <NavLink to="/seller" end className={tabCls}>
          {({ isActive }) => <><House size={24} weight={isActive ? 'fill' : 'regular'} /><span>Home</span></>}
        </NavLink>
        <NavLink to="/seller/messages" className={tabCls}>
          {({ isActive }) => (
            <>
              <span className="sc-tab-icon">
                <ChatCircleDots size={24} weight={isActive ? 'fill' : 'regular'} />
                {chatUnread > 0 && <b className="sc-tab-badge">{chatUnread > 9 ? '9+' : chatUnread}</b>}
              </span>
              <span>Chat</span>
            </>
          )}
        </NavLink>
        <NavLink to="/seller/marketing" className={tabCls}>
          {({ isActive }) => <><Megaphone size={24} weight={isActive ? 'fill' : 'regular'} /><span>Marketing</span></>}
        </NavLink>
        <NavLink to="/seller/menu" className={tabCls}>
          {({ isActive }) => <><UserIcon size={24} weight={isActive ? 'fill' : 'regular'} /><span>Me</span></>}
        </NavLink>
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
  '/seller/products/new': 'Add Product',
  '/seller/setup': 'Shop setup',
  '/seller/verification': 'Verify identity',
  '/seller/menu': 'Menu',
  '/seller/marketing': 'Marketing',
  '/seller/decorate': 'Decorate my shop',
  '/seller/reviews': 'Reviews',
  '/seller/analytics': 'Analytics',
  '/seller/finance': 'Finance',
  '/seller/store': 'Shop Profile',
  '/seller/fulfillment': 'Fulfillment & Payment',
  '/seller/settings': 'Settings',
};

/** Phone: the four tabs on the bottom bar. */
const PHONE_TABS = ['/seller', '/seller/messages', '/seller/marketing', '/seller/menu'];

/** Phone: tabs whose page draws its own shop header (Home, Me). */
const PHONE_OWN_HEADER = ['/seller', '/seller/menu'];

/** Phone header titles: short, plain names. */
const PHONE_TITLES = {
  '/seller/orders': 'My orders',
  '/seller/products': 'My products',
  '/seller/products/new': 'Add product',
  '/seller/messages': 'Chat',
  '/seller/marketing': 'Marketing',
  '/seller/menu': 'Me',
  '/seller/decorate': 'Decorate my shop',
  '/seller/decorate/templates': 'Choose a template',
  '/seller/returns': 'Returns & refunds',
  '/seller/support': 'Admin messages',
  '/seller/notifications': 'Notifications',
  '/seller/reviews': 'Reviews',
  '/seller/analytics': 'Analytics',
  '/seller/finance': 'Finance',
  '/seller/store': 'Shop profile',
  '/seller/fulfillment': 'Delivery & payment',
  '/seller/settings': 'Settings',
  '/seller/setup': 'Shop setup',
  '/seller/verification': 'Verify identity',
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
