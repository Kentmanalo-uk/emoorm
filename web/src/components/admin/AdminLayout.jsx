import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour as LayoutGrid, Users, Package, Flag, ChartPie as PieChart,
  CaretDown as ChevronDown, CaretRight as ChevronRight, CaretLeft as ChevronLeft, Bell, SignOut as LogOut, Storefront as StoreIcon,
  EnvelopeSimple, FileText, Gear as SettingsIcon, Image as ImageIcon, Ticket, ChatsCircle,
  Star, ArrowCounterClockwise, List, X, ChatCircleDots,
  House, Receipt, UserCircle, SquaresFour, Truck, DeviceMobile, UsersThree,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import useSidebarCollapse from '../../hooks/useSidebarCollapse';
import { useCompactLayout, useMobileNav, usePhoneLayout } from '../../hooks/useMobileNav';
import LanguageSwitcher from '../LanguageSwitcher';
import AppLogo from '../AppLogo';
import AppRail from '../layout/AppRail';
import NavBadge from '../layout/NavBadge';
import useAttention from '../../hooks/useAttention';
import ShellSearch from '../layout/ShellSearch';
import { adminSearchSources } from '../../lib/shellSearchSources';
// The admin shell on phones is drawn with the Seller Center's app styles
// (headers, tab bar, cards). They used to arrive with the Seller Center's
// code; it now loads only for sellers, so the admin shell brings its own.
import '../layout/SellerLayout.css';
import '../layout/SellerShellMobile.css';
import '../layout/SellerPhoneFit.css';
import '../../pages/SellerSetup.css';
import '../layout/SellerMobile.css';
import '../../pages/SellerApp.css';
// ...and every Seller Center page's styles, which the admin pages share.
import '../../pages/SellerDashboard.css';
import '../../pages/SellerStore.css';
import '../../pages/SellerProducts.css';
import '../../pages/SellerOrders.css';
import '../../pages/SellerAssistant.css';
import '../../pages/SellerShopHome.css';
import '../../pages/SellerFulfillment.css';
import '../../pages/SellerSettings.css';
import '../../pages/SellerReturns.css';
import './AdminLayout.css';
import './AdminShellMobile.css';
import UserAvatar from '../ui/UserAvatar';
import ConfirmDialog from '../ui/ConfirmDialog';
import { AdminShellContext } from './adminShell';
import useTableCardLabels from '../../hooks/useTableCardLabels';
import './AdminPhone.css';
// Every admin page's styles, after the shell's (the order they always had):
// the pages share classes across their stylesheets.
import '../../pages/AdminDashboard.css';
import '../../pages/AdminSellers.css';
import '../../pages/AdminNotifications.css';
import '../../pages/AdminMessages.css';
import '../../pages/AdminFeedback.css';
import '../../pages/AdminBanners.css';
import '../../pages/AdminCouriers.css';
import '../../pages/AdminJuniorAdmins.css';
import '../../pages/AdminSettings.css';
import '../../pages/AdminSupport.css';
import '../../pages/AdminModeration.css';
import { afterSignOutPath } from '../../lib/afterSignOut';
import PageMenu from '../layout/PageMenu';

/**
 * Persistent shell for /admin/* pages — mirrors SellerLayout look & feel.
 * Content is rendered via `children` (existing admin pages don't use <Outlet />).
 */
export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [storedCollapsed, toggleCollapsed] = useSidebarCollapse();
  const isCompact = useCompactLayout();
  // The drawer on small screens always shows full labels.
  const collapsed = storedCollapsed && !isCompact;
  const mobileNav = useMobileNav(location.pathname);
  const isPhone = usePhoneLayout();
  const [logoutOpen, setLogoutOpen] = useState(false);
  // Phones: every table's rows become labelled cards (AdminPhone.css).
  const contentRef = useRef(null);
  useTableCardLabels(isPhone, contentRef);
  // Phones: pop-ups (detail panels, forms, dialogs) open as bottom sheets.
  // Some render outside the shell, so the flag sits on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('admin-phone', isPhone);
    return () => document.documentElement.classList.remove('admin-phone');
  }, [isPhone]);
  const [reviewsOpen, setReviewsOpen] = useState(
    location.pathname.startsWith('/admin/sellers') ||
    location.pathname.startsWith('/admin/all-sellers') ||
    location.pathname.startsWith('/admin/buyers') ||
    location.pathname.startsWith('/admin/products') ||
    location.pathname.startsWith('/admin/orders') ||
    location.pathname.startsWith('/admin/reports') ||
    location.pathname.startsWith('/admin/reviews') ||
    location.pathname.startsWith('/admin/returns')
  );
  const [systemOpen, setSystemOpen] = useState(
    location.pathname.startsWith('/admin/users') ||
    location.pathname.startsWith('/admin/categories') ||
    location.pathname.startsWith('/admin/municipalities')
  );
  const [unreadCount, setUnreadCount] = useState(0);
  // Unread messages between this admin and the super admin — the one thing
  // the Messages page has that nothing else in the shell would surface.
  const [messageUnread, setMessageUnread] = useState(0);
  // Feedback nobody has read yet. Super admin only — municipal admins have no
  // feedback page to send them to.
  const [feedbackNew, setFeedbackNew] = useState(0);

  // What is waiting on this admin, keyed by the route it lives at, so the
  // sidebar can say where the work is without opening every page.
  const { byLink: waiting } = useAttention('/moderation/attention');
  const badge = (path) => <NavBadge {...(waiting[path] || {})} />;
  const [municipalityName, setMunicipalityName] = useState(user?.municipality?.name || '');
  const [municipalityLogo, setMunicipalityLogo] = useState(user?.municipality?.logo || '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const n = await axios.get('/notifications/unread/count', { params: { audience: 'ADMIN' } });
        if (!cancelled) setUnreadCount(n.data?.count ?? 0);
      } catch {
        /* ignore */
      }
      try {
        const m = await axios.get('/admin-messages/unread-count');
        if (!cancelled) setMessageUnread(m.data?.count ?? 0);
      } catch {
        /* ignore */
      }
      if (isSuperAdmin) {
        try {
          const f = await axios.get('/feedback/unread-count');
          if (!cancelled) setFeedbackNew(f.data?.count ?? 0);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  // A new notification just popped up (NotificationWatcher): count it now.
  useEffect(() => {
    const refresh = () => {
      axios.get('/notifications/unread/count', { params: { audience: 'ADMIN' } })
        .then((n) => setUnreadCount(n.data?.count ?? 0))
        .catch(() => { /* the next page counts again */ });
    };
    window.addEventListener('emoorm:notifications', refresh);
    return () => window.removeEventListener('emoorm:notifications', refresh);
  }, []);

  useEffect(() => {
    if (isSuperAdmin || !user?.id) return;
    let cancelled = false;
    axios.get('/auth/profile')
      .then((response) => {
        const profile = response.data;
        if (cancelled || !profile) return;
        updateUser(profile);
        setMunicipalityName(profile.municipality?.name || '');
        setMunicipalityLogo(profile.municipality?.logo || '');
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [isSuperAdmin, updateUser, user?.id]);

  // The admin guard notices the sign-out first; it is told where to go.
  const handleLogout = () => {
    const to = afterSignOutPath('/login');
    logout(to);
    navigate(to, { replace: true });
  };

  const initial = (user?.fullName || user?.email || 'A').trim().charAt(0).toUpperCase();
  const shortName = user?.fullName
    ? user.fullName.length > 14 ? user.fullName.slice(0, 14) + '…' : user.fullName
    : 'Admin';
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Municipal Admin';
  const assignedMunicipalityName = municipalityName || user?.municipality?.name || '';
  const centerTitle = isSuperAdmin
    ? 'Super Admin'
    : assignedMunicipalityName ? `${assignedMunicipalityName} Admin` : 'Admin';

  const crumbs = buildCrumbs(location.pathname);

  // Phones: the seller app's shape. Five tabs; Home and Me draw their own
  // header, the other tabs a title with round buttons, and every other page
  // a back arrow with its title (and no tab bar).
  const cleanPath = location.pathname.replace(/\/$/, '') || '/admin';
  const isTabRoot = PHONE_TABS.includes(cleanPath);
  const ownHeader = PHONE_OWN_HEADER.includes(cleanPath);
  const phoneTitle = PHONE_TITLES[cleanPath] || crumbs[crumbs.length - 1]?.label || 'Admin';
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else if (cleanPath.startsWith('/admin/notifications/')) navigate('/admin/notifications');
    else navigate('/admin/menu');
  };
  const count = (path) => waiting[path]?.count || 0;
  // The Tools tab counts what waits in the sections it opens (Orders and
  // Support have tabs of their own).
  const toolsWaiting = Object.entries(waiting || {})
    .filter(([path]) => path !== '/admin/orders' && path !== '/admin/support')
    .reduce((sum, [, item]) => sum + (Number(item?.count) || 0), 0);

  const shell = useMemo(() => ({
    waiting,
    unreadCount,
    messageUnread,
    feedbackNew,
    isSuperAdmin,
    roleLabel,
    centerTitle,
    municipalityName: assignedMunicipalityName,
    municipalityLogo,
    requestLogout: () => setLogoutOpen(true),
  }), [waiting, unreadCount, messageUnread, feedbackNew, isSuperAdmin, roleLabel, centerTitle, assignedMunicipalityName, municipalityLogo]);

  return (
    <AdminShellContext.Provider value={shell}>
    <div className={`ac-shell ${collapsed ? 'is-collapsed' : ''}${mobileNav.open ? ' is-nav-open' : ''}${isPhone ? ' is-phone' : ''}${isPhone && !isTabRoot ? ' is-subpage' : ''}`}>
      <div className="ac-nav-backdrop" onClick={mobileNav.hide} aria-hidden="true" />
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="ac-sidebar" aria-label="Admin navigation">
        <div className="ac-sidebar-inner">
          <div className="ac-brand-row">
            <Link to="/admin" className="ac-brand">
              {!isSuperAdmin ? (
                <span className="ac-brand-logo-stack">
                  <AppLogo className="ac-brand-logo ac-brand-logo-base" alt="" />
                  {municipalityLogo ? (
                    <img src={resolveImg(municipalityLogo)} alt={assignedMunicipalityName} className="ac-brand-logo ac-brand-logo-badge" />
                  ) : (
                    <span className="ac-brand-logo-badge ac-brand-logo-placeholder" aria-label={`${assignedMunicipalityName} logo`}>
                      {assignedMunicipalityName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
              ) : (
                <AppLogo className="ac-brand-logo" alt="" />
              )}
              <span className="ac-brand-text">
                <strong>Emoorm</strong>
                <span>{centerTitle}</span>
              </span>
            </Link>
            <button
              type="button"
              className="ac-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
            <button type="button" className="ac-drawer-close" onClick={mobileNav.hide} aria-label="Close menu">
              <X size={18} weight="bold" />
            </button>
          </div>

          <nav className="ac-nav">
            <NavLink to="/admin" end className={navCls} title="Dashboard">
              <LayoutGrid size={17} weight="fill" /> <span>Dashboard</span>
            </NavLink>

            {isSuperAdmin ? (
              <>
                <button
                  type="button"
                  className={`ac-nav-item ac-nav-group ${reviewsOpen && !collapsed ? 'is-open' : ''}`}
                  onClick={() => collapsed ? navigate('/admin/sellers') : setReviewsOpen((v) => !v)}
                  aria-expanded={reviewsOpen && !collapsed}
                  title="Marketplace"
                >
                  <Flag size={17} weight="fill" />
                  <span>Marketplace</span>
                  <ChevronDown size={15} className="ac-nav-chevron" />
                </button>
                <div className={`ac-subnav-wrap${reviewsOpen ? ' is-open' : ''}`}>
                  <div className="ac-subnav">
                    <NavLink to="/admin/sellers" className={subNavCls}>Seller Applications{badge('/admin/sellers')}</NavLink>
                    <NavLink to="/admin/all-sellers" className={subNavCls}>All Sellers</NavLink>
                    <NavLink to="/admin/buyers" className={subNavCls}>All Buyers</NavLink>
                    <NavLink to="/admin/products" className={subNavCls}>Products{badge('/admin/products')}</NavLink>
                    <NavLink to="/admin/orders" className={subNavCls}>Orders{badge('/admin/orders')}</NavLink>
                    <NavLink to="/admin/reviews" className={subNavCls}>Reviews</NavLink>
                    <NavLink to="/admin/returns" className={subNavCls}>Returns{badge('/admin/returns')}</NavLink>
                    <NavLink to="/admin/reports" className={subNavCls}>Reports{badge('/admin/reports')}</NavLink>
                  </div>
                </div>
              </>
            ) : (
              <>
                <NavLink to="/admin/sellers" className={navCls} title="Seller Applications">
                  <Flag size={17} weight="fill" /> <span>Seller Applications</span>{badge('/admin/sellers')}
                </NavLink>
                <NavLink to="/admin/all-sellers" className={navCls} title="Sellers">
                  <StoreIcon size={17} weight="fill" /> <span>Sellers</span>
                </NavLink>
                <NavLink to="/admin/buyers" className={navCls} title="Buyers">
                  <Users size={17} weight="fill" /> <span>Buyers</span>
                </NavLink>
                <NavLink to="/admin/products" className={navCls} title="Products">
                  <Package size={17} weight="fill" /> <span>Products</span>{badge('/admin/products')}
                </NavLink>
                <NavLink to="/admin/orders" className={navCls} title="Orders">
                  <FileText size={17} weight="fill" /> <span>Orders</span>{badge('/admin/orders')}
                </NavLink>
                <NavLink to="/admin/reviews" className={navCls} title="Reviews">
                  <Star size={17} weight="fill" /> <span>Reviews</span>
                </NavLink>
                <NavLink to="/admin/returns" className={navCls} title="Returns">
                  <ArrowCounterClockwise size={17} weight="fill" /> <span>Returns</span>{badge('/admin/returns')}
                </NavLink>
                <NavLink to="/admin/reports" className={navCls} title="Reports">
                  <Flag size={17} weight="fill" /> <span>Reports</span>{badge('/admin/reports')}
                </NavLink>
              </>
            )}

            <NavLink to="/admin/support" className={navCls} title="Buyer Support">
              <ChatsCircle size={17} weight="fill" /> <span>Buyer Support</span>{badge('/admin/support')}
            </NavLink>

            {/* Admin-to-admin messaging; announcements live here as a tab. */}
            <NavLink to="/admin/messages" className={navCls} title="Messages">
              <EnvelopeSimple size={17} weight="fill" /> <span>Messages</span>
              <NavBadge count={messageUnread} label="unread" />
            </NavLink>

            {isSuperAdmin && (
              <NavLink to="/admin/feedback" className={navCls} title="Feedback">
                <ChatCircleDots size={17} weight="fill" /> <span>Feedback</span>
                <NavBadge count={feedbackNew} label="new" />
              </NavLink>
            )}

            <NavLink to="/admin/notifications" className={navCls} title="Notifications">
              <Bell size={17} weight="fill" /> <span>Notifications</span>
              <NavBadge count={unreadCount} label="unread" />
            </NavLink>

            {isSuperAdmin && (
              <>
                {/* System group */}
                <button
                  type="button"
                  className={`ac-nav-item ac-nav-group ${systemOpen && !collapsed ? 'is-open' : ''}`}
                  onClick={() => collapsed ? navigate('/admin/users') : setSystemOpen((v) => !v)}
                  aria-expanded={systemOpen && !collapsed}
                  title="System"
                >
                  <StoreIcon size={17} weight="fill" />
                  <span>System</span>
                  <ChevronDown size={15} className="ac-nav-chevron" />
                </button>
                <div className={`ac-subnav-wrap${systemOpen ? ' is-open' : ''}`}>
                  <div className="ac-subnav">
                    <NavLink to="/admin/users" className={subNavCls}>
                      All Users
                    </NavLink>
                    <NavLink to="/admin/categories" className={subNavCls}>
                      Categories
                    </NavLink>
                    <NavLink to="/admin/municipalities" className={subNavCls}>
                      Municipalities
                    </NavLink>
                    <NavLink to="/admin/junior-admins" className={subNavCls}>
                      Municipal Admins
                    </NavLink>
                  </div>
                </div>

                <NavLink to="/admin/banners" className={navCls} title="Banners">
                  <ImageIcon size={17} weight="fill" /> <span>Banners</span>
                </NavLink>

                <NavLink to="/admin/couriers" className={navCls} title="Couriers">
                  <Truck size={17} weight="fill" /> <span>Couriers</span>
                </NavLink>

                <NavLink to="/admin/vouchers" className={navCls} title="Vouchers">
                  <Ticket size={17} weight="fill" /> <span>Vouchers</span>
                </NavLink>

                <NavLink to="/admin/app-users" className={navCls} title="App users">
                  <DeviceMobile size={17} weight="fill" /> <span>App users</span>
                </NavLink>
              </>
            )}

            {!isSuperAdmin && (
              <NavLink to="/admin/team" className={navCls} title="Admin team">
                <UsersThree size={17} weight="fill" /> <span>Admin team</span>
              </NavLink>
            )}

            <NavLink to="/admin/audit-logs" className={navCls} title="Audit Logs">
              <FileText size={17} weight="fill" /> <span>Audit Logs</span>
            </NavLink>

            <NavLink to="/admin/analytics" className={navCls} title="Analytics">
              <PieChart size={17} weight="fill" /> <span>Analytics</span>
            </NavLink>

            <NavLink to="/admin/settings" className={navCls} title="Settings">
              <SettingsIcon size={17} weight="fill" /> <span>Settings</span>
            </NavLink>
          </nav>

          <Link to="/profile" className="ac-user-card" title="View profile">
            <UserAvatar
              src={user?.profilePhoto}
              name={initial}
              alt=""
              imgClassName="ac-user-avatar"
              fallbackClassName="ac-user-avatar ac-user-avatar--fallback"
            />
            <span className="ac-user-meta">
              <strong>{shortName}</strong>
              <span>{roleLabel}</span>
            </span>
            <ChevronRight size={14} className="ac-user-caret" />
          </Link>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="ac-main">
        <header className="ac-topbar">
          <button
            type="button"
            className="ac-menu-btn"
            onClick={mobileNav.toggle}
            aria-label="Open menu"
            aria-expanded={mobileNav.open}
          >
            <List size={22} weight="bold" />
          </button>
          <span className="ac-mobile-title">{crumbs[crumbs.length - 1]?.label}</span>
          {/* Replaces the breadcrumb trail: searching stores, products and
              people is far more use in this bar than a restatement of the
              current page. Hidden on the mobile shell, same as the crumbs. */}
          <ShellSearch
            className="ac-search"
            sources={adminSearchSources}
            placeholder="Search stores, products and people"
            ariaLabel="Search the admin panel"
            scope="admin"
          />

          <div className="ac-topbar-actions">
            <LanguageSwitcher variant="shell" />
            <Link to="/admin/notifications" className="ac-icon-btn" title="Notifications">
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="ac-icon-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <button
              type="button"
              className="ac-icon-btn"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {isPhone && isTabRoot && !ownHeader && (
          <header className="scm-head acm-head">
            <h1 className="scm-title">{phoneTitle}</h1>
            <div className="scm-actions">
              <Link to="/admin/messages" className="scm-icon" aria-label="Messages" title="Messages">
                <EnvelopeSimple size={20} />
                {messageUnread > 0 && <span className="scm-badge">{messageUnread > 9 ? '9+' : messageUnread}</span>}
              </Link>
              <Link to="/admin/notifications" className="scm-icon" aria-label="Notifications" title="Notifications">
                <Bell size={20} />
                {unreadCount > 0 && <span className="scm-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </Link>
              <PageMenu area="admin" />
            </div>
          </header>
        )}
        {isPhone && !isTabRoot && (
          <header className="scm-backbar acm-backbar">
            <button type="button" className="scm-back" onClick={goBack} aria-label="Back">
              <ChevronLeft size={22} weight="bold" />
            </button>
            <h1 className="scm-backtitle">{phoneTitle}</h1>
            <PageMenu area="admin" />
          </header>
        )}

        <main className="ac-content" ref={contentRef}>{children}</main>
      </div>

      <AppRail
        unreadCount={unreadCount}
        onLogout={handleLogout}
        notificationsTo="/admin/notifications"
        audience="ADMIN"
        signOutMessage="You will need to sign in again to open the admin panel."
      />

      {/* Phones: the app tab bar (hidden on pages opened from it). */}
      {isPhone && (
        <nav className={`sc-tabbar sc-tabbar--app acm-tabbar${isTabRoot ? '' : ' is-hidden'}`} aria-label="Admin sections">
          <NavLink to="/admin" end className={tabCls}>
            {({ isActive }) => <><House size={24} weight={isActive ? 'fill' : 'light'} /><span>Home</span></>}
          </NavLink>
          <NavLink to="/admin/tools" end className={tabCls}>
            {({ isActive }) => (
              <>
                <span className="sc-tab-icon">
                  <SquaresFour size={24} weight={isActive ? 'fill' : 'light'} />
                  {toolsWaiting > 0 && <b className="sc-tab-badge">{toolsWaiting > 99 ? '99+' : toolsWaiting}</b>}
                </span>
                <span>Tools</span>
              </>
            )}
          </NavLink>
          <NavLink to="/admin/orders" end className={tabCls}>
            {({ isActive }) => (
              <>
                <span className="sc-tab-icon">
                  <Receipt size={24} weight={isActive ? 'fill' : 'light'} />
                  {count('/admin/orders') > 0 && <b className="sc-tab-badge">{count('/admin/orders') > 99 ? '99+' : count('/admin/orders')}</b>}
                </span>
                <span>Orders</span>
              </>
            )}
          </NavLink>
          <NavLink to="/admin/support" end className={tabCls}>
            {({ isActive }) => (
              <>
                <span className="sc-tab-icon">
                  <ChatsCircle size={24} weight={isActive ? 'fill' : 'light'} />
                  {count('/admin/support') > 0 && <b className="sc-tab-badge">{count('/admin/support') > 99 ? '99+' : count('/admin/support')}</b>}
                </span>
                <span>Support</span>
              </>
            )}
          </NavLink>
          <NavLink to="/admin/menu" end className={tabCls}>
            {({ isActive }) => <><UserCircle size={24} weight={isActive ? 'fill' : 'light'} /><span>Me</span></>}
          </NavLink>
        </nav>
      )}

      <ConfirmDialog
        open={logoutOpen}
        title="Sign out?"
        message="You will need to sign in again to open the admin panel."
        confirmLabel="Sign out"
        danger
        onConfirm={() => { setLogoutOpen(false); handleLogout(); }}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
    </AdminShellContext.Provider>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function navCls({ isActive }) {
  return `ac-nav-item ${isActive ? 'ac-nav-item--active' : ''}`;
}

function subNavCls({ isActive }) {
  return `ac-subnav-link ${isActive ? 'ac-subnav-link--active' : ''}`;
}

function tabCls({ isActive }) {
  return `sc-tab${isActive ? ' is-active' : ''}`;
}

/** Phones: the tab bar's pages; Home and Me draw their own header. */
const PHONE_TABS = ['/admin', '/admin/tools', '/admin/orders', '/admin/support', '/admin/menu'];
const PHONE_OWN_HEADER = ['/admin', '/admin/menu'];
/** Phones: shorter titles for the bar than the desktop crumbs. */
const PHONE_TITLES = {
  '/admin/tools': 'Tools',
  '/admin/products': 'Products',
  '/admin/orders': 'Orders',
  '/admin/support': 'Buyer support',
  '/admin/reports': 'Reports',
  '/admin/menu': 'Me',
  '/admin/notifications': 'Notifications',
};

const LABELS = {
  '/admin': 'Dashboard',
  '/admin/sellers': 'Seller Applications',
  '/admin/all-sellers': 'All Sellers',
  '/admin/buyers': 'All Buyers',
  '/admin/products': 'Products',
  '/admin/orders': 'Orders / Activity',
  '/admin/reports': 'Reports / Issues',
  '/admin/users': 'All Users',
  '/admin/categories': 'Categories',
  '/admin/municipalities': 'Municipalities',
  '/admin/analytics': 'Analytics',
  '/admin/messages': 'Messages',
  '/admin/feedback': 'Feedback',
  '/admin/support': 'Buyer Support',
  '/admin/notifications': 'Notifications',
  '/admin/reviews': 'Reviews',
  '/admin/returns': 'Returns',
  '/admin/banners': 'Banners',
  '/admin/couriers': 'Couriers',
  '/admin/vouchers': 'Vouchers',
  '/admin/app-users': 'App users',
  '/admin/team': 'Admin team',
  '/admin/junior-admins': 'Municipal Admins',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/settings': 'Settings',
  '/admin/menu': 'Me',
  '/admin/tools': 'Tools',
};

function buildCrumbs(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/admin';
  const crumbs = [{ to: '/admin', label: 'Admin Panel' }];

  if (clean === '/admin') {
    return [{ to: '/admin', label: 'Dashboard' }];
  }

  const parts = clean.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += '/' + parts[i];
    if (i === 0) continue;
    const label = LABELS[acc] || capitalize(parts[i]);
    crumbs.push({ to: acc, label });
  }
  return crumbs;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
