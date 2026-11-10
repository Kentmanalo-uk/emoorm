import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour as LayoutGrid, ChartPie as PieChart,
  CaretRight as ChevronRight, CaretLeft as ChevronLeft, Bell, SignOut as LogOut, Storefront as StoreIcon,
  EnvelopeSimple, Gear as SettingsIcon, Image as ImageIcon, Ticket, ChatsCircle,
  Star, List, X, House, Receipt, UserCircle, SquaresFour, UsersThree, PaperPlaneTilt,
  MapPin, CaretDown, ClipboardText, Megaphone, Plus, ArrowSquareOut, Tag, Globe,
} from '../../lib/icons';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import useSidebarCollapse from '../../hooks/useSidebarCollapse';
import { useCompactLayout, useMobileNav, usePhoneLayout } from '../../hooks/useMobileNav';
import LanguageSwitcher from '../LanguageSwitcher';
import AppLogo from '../AppLogo';
import AppRail from '../layout/AppRail';
import { CardLinks } from '../layout/HeadCards';
import { useHeadCard, useArrowAt } from '../../hooks/useHeadCard';
import useHoverMenu from '../../hooks/useHoverMenu';
import NavBadge from '../layout/NavBadge';
import {
  useAdminAttention, useAdminShellData, useFlagsPending, useRefreshAdminShell, waitingByLink,
} from '../../hooks/useAdminShellData';
import ShellSearch from '../layout/ShellSearch';
import ToolStrip from '../layout/ToolStrip';
import useAppSettings from '../../hooks/useAppSettings';
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
// Computers only (769px and wider): one look for every admin page. Phones
// never match these sheets.
import './desktop/AdminDesktop.css';
import './desktop/overview.css';
import './desktop/tables.css';
import './desktop/moderation.css';
// The business-suite look shared with the Seller Center, last so it wins.
import '../layout/suite.css';
import './desktop/conversations.css';
// The Seller Center's desktop header pieces ("+ Create", the header buttons,
// the account menu), then the admin's own plain shell over the suite's.
import '../layout/SellerDesk.css';
import './desktop/AdminShellDesk.css';
import { afterSignOutPath } from '../../lib/afterSignOut';
import PageMenu from '../layout/PageMenu';

/**
 * Persistent shell for /admin/* pages — mirrors SellerLayout look & feel.
 * Content is rendered via `children` (existing admin pages don't use <Outlet />).
 */
export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { settings: appSettings } = useAppSettings();
  const invitesOn = appSettings.referralSettings?.enabled === true;

  const [storedCollapsed, toggleCollapsed] = useSidebarCollapse();
  const isCompact = useCompactLayout();
  // The drawer on small screens always shows full labels.
  const collapsed = storedCollapsed && !isCompact;
  const mobileNav = useMobileNav(location.pathname);
  const isPhone = usePhoneLayout();
  const [logoutOpen, setLogoutOpen] = useState(false);

  // The menu's groups: the one holding the open page starts open, and opens
  // when a page in it is reached some other way (a link, the search).
  const [openGroups, setOpenGroups] = useState(() => new Set([adminGroupOf(location.pathname)].filter(Boolean)));
  const [groupPath, setGroupPath] = useState(location.pathname);
  if (groupPath !== location.pathname) {
    setGroupPath(location.pathname);
    const here = adminGroupOf(location.pathname);
    if (here && !openGroups.has(here)) setOpenGroups(new Set([...openGroups, here]));
  }
  const toggleGroup = (id) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Computers: the account menu at the header's right end.
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  // The account menu opens on hover, like the other header cards.
  const accountHover = useHoverMenu(setAccountOpen);
  useArrowAt(accountRef, accountOpen);
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);
  // Phones: every table's rows become labelled cards (AdminPhone.css).
  const contentRef = useRef(null);
  useTableCardLabels(isPhone, contentRef);
  // Phones: pop-ups (detail panels, forms, dialogs) open as bottom sheets.
  // Some render outside the shell, so the flag sits on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('admin-phone', isPhone);
    return () => document.documentElement.classList.remove('admin-phone');
  }, [isPhone]);
  // The shell's counts live in the shared query cache (useAdminShellData), so
  // the next page shows them at once instead of blanking every badge while it
  // asks for all of them again. A municipal admin's profile is read there too,
  // which keeps the municipality's name and logo below up to date.
  const {
    // The bell's count and the rail's newest notifications.
    notifications,
    unreadCount,
    // Unread messages between this admin and the super admin — the one thing
    // the Messages page has that nothing else in the shell would surface.
    messageUnread,
    // Feedback nobody has read yet. Super admin only — municipal admins have no
    // feedback page to send them to.
    feedbackNew,
  } = useAdminShellData(isSuperAdmin);
  const refreshShell = useRefreshAdminShell();

  // What is waiting on this admin, keyed by the route it lives at, so the
  // sidebar can say where the work is without opening every page.
  const { data: attention } = useAdminAttention();
  // Unusual-activity flags are counted on their own (the ML engine), then
  // joined in so the menu, the Tools tab and the group badge all carry them.
  const flagsPending = useFlagsPending();
  const waiting = useMemo(() => ({
    ...waitingByLink(attention),
    ...(flagsPending > 0 ? { '/admin/flags': { count: flagsPending, severity: 'low', label: 'flags waiting' } } : {}),
  }), [attention, flagsPending]);
  const badge = (path) => <NavBadge {...(waiting[path] || {})} />;
  const municipalityName = user?.municipality?.name || '';
  const municipalityLogo = user?.municipality?.logo || '';

  // A new notification just popped up (NotificationWatcher): count it now,
  // with the messages and the work it is most likely about.
  useEffect(() => {
    const recount = () => ['notifications', 'messages', 'attention'].forEach((kind) => refreshShell(kind));
    window.addEventListener('emoorm:notifications', recount);
    return () => window.removeEventListener('emoorm:notifications', recount);
  }, [refreshShell]);

  // Leaving a page whose actions change one of the counts reads that count
  // again, as every page change used to. Pages that say so the moment they
  // act (useRefreshAdminShell) update the badge sooner still.
  useEffect(() => {
    const kinds = REREAD_ON_LEAVE
      .filter(([path]) => location.pathname.startsWith(path))
      .map(([, kind]) => kind);
    if (kinds.length === 0) return undefined;
    return () => kinds.forEach((kind) => refreshShell(kind));
  }, [location.pathname, refreshShell]);

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
  const group = { openGroups, toggleGroup, collapsed, path: location.pathname };

  // Computers: the admin's account at the header's right end: their
  // profile, Settings, the public site, and signing out.
  const account = (
    <div className={`sc-account sc-account--head${accountOpen ? ' is-open' : ''}`} ref={accountRef} {...accountHover.hoverProps}>
      <div className="sc-account-menu" role="menu" aria-label="Account" aria-hidden={!accountOpen} inert={!accountOpen}>
        <div className="sc-account-menu-head">
          <UserAvatar
            src={user?.profilePhoto}
            person={user}
            name={initial}
            alt=""
            imgClassName="sc-user-avatar"
            fallbackClassName="sc-user-avatar sc-user-avatar--fallback"
          />
          <span className="sc-account-menu-meta">
            <strong>{user?.fullName || user?.email || 'Admin'}</strong>
            <span>{isSuperAdmin ? roleLabel : `${roleLabel}${assignedMunicipalityName ? ` · ${assignedMunicipalityName}` : ''}`}</span>
          </span>
        </div>
        <Link to="/admin/settings?tab=profile" role="menuitem" tabIndex={accountOpen ? 0 : -1} className="sc-account-item" onClick={() => setAccountOpen(false)}>
          <UserCircle size={16} /> My profile
        </Link>
        <Link to="/admin/settings" role="menuitem" tabIndex={accountOpen ? 0 : -1} className="sc-account-item" onClick={() => setAccountOpen(false)}>
          <SettingsIcon size={16} /> Settings
        </Link>
        <a href="/" target="_blank" rel="noopener noreferrer" role="menuitem" tabIndex={accountOpen ? 0 : -1} className="sc-account-item" onClick={() => setAccountOpen(false)}>
          <ArrowSquareOut size={16} /> Open the site
        </a>
        <button
          type="button"
          role="menuitem"
          tabIndex={accountOpen ? 0 : -1}
          className="sc-account-item sc-account-item--out"
          onClick={() => { setAccountOpen(false); setLogoutOpen(true); }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
      <button
        type="button"
        className="sc-user-card"
        title={user?.fullName || 'Account'}
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        onClick={() => setAccountOpen((open) => (accountHover.hovering() ? true : !open))}
      >
        <UserAvatar
          src={user?.profilePhoto}
          person={user}
          name={initial}
          alt=""
          imgClassName="sc-user-avatar"
          fallbackClassName="sc-user-avatar sc-user-avatar--fallback"
        />
        <span className="sc-user-meta">
          <strong>{shortName}</strong>
          <span>{roleLabel}</span>
        </span>
        <CaretDown size={14} className="sc-user-caret" />
      </button>
    </div>
  );

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

          {/* Whose panel this is: every town, or the admin's own. */}
          <span className="ac-scope" title={isSuperAdmin ? 'You see every municipality' : `You manage ${assignedMunicipalityName || 'your municipality'}`}>
            {isSuperAdmin ? <Globe size={13} weight="fill" /> : <MapPin size={13} weight="fill" />}
            <span>{isSuperAdmin ? 'All municipalities' : (assignedMunicipalityName || 'Your municipality')}</span>
          </span>

          {/* The menu in groups, the way the Seller Center keeps it: what is
              waiting first, then the people, the content, the messages, the
              storefront and the platform. A closed group carries its pages'
              waiting count; collapsed to icons, a group goes to its first
              page. */}
          <nav className="ac-nav">
            <NavLink to="/admin" end className={navCls} title="Dashboard">
              <LayoutGrid size={17} weight="fill" /> <span>Dashboard</span>
            </NavLink>

            <AdminNavGroup id="review" icon={ClipboardText} label="To review" first="/admin/sellers" {...group} badge={mergeAll(REVIEW_PAGES.map((p) => waiting[p]))}>
              <NavLink to="/admin/sellers" className={subNavCls}>Seller applications{badge('/admin/sellers')}</NavLink>
              <NavLink to="/admin/products" className={subNavCls}>Products{badge('/admin/products')}</NavLink>
              <NavLink to="/admin/returns" className={subNavCls}>Returns{badge('/admin/returns')}</NavLink>
              <NavLink to="/admin/reports" className={subNavCls}>Reports{badge('/admin/reports')}</NavLink>
              <NavLink to="/admin/flags" className={subNavCls}>Unusual activity{badge('/admin/flags')}</NavLink>
            </AdminNavGroup>

            <NavLink to="/admin/orders" className={navCls} title="Orders">
              <Receipt size={17} weight="fill" /> <span>Orders</span>{badge('/admin/orders')}
            </NavLink>
            <NavLink to="/admin/support" className={navCls} title="Support">
              <ChatsCircle size={17} weight="fill" /> <span>Support</span>{badge('/admin/support')}
            </NavLink>

            <AdminNavGroup id="people" icon={UsersThree} label="People & stores" first="/admin/all-sellers" {...group} badge={waiting['/admin/team']}>
              <NavLink to="/admin/all-sellers" className={subNavCls}>Sellers</NavLink>
              <NavLink to="/admin/buyers" className={subNavCls}>Buyers</NavLink>
              {isSuperAdmin && <NavLink to="/admin/users" className={subNavCls}>All users</NavLink>}
              {isSuperAdmin && <NavLink to="/admin/junior-admins" className={subNavCls}>Municipal admins</NavLink>}
              {!isSuperAdmin && <NavLink to="/admin/team" className={subNavCls}>Admin team{badge('/admin/team')}</NavLink>}
            </AdminNavGroup>

            <AdminNavGroup id="content" icon={Star} label="Content" first="/admin/reviews" {...group}>
              <NavLink to="/admin/reviews" className={subNavCls}>Reviews</NavLink>
              <NavLink to="/admin/photo-designs" className={subNavCls}>Photo designs</NavLink>
              {/* The super admin always (the switch lives there); a town's admin once invites are on. */}
              {(isSuperAdmin || invitesOn) && <NavLink to="/admin/invites" className={subNavCls}>Invites</NavLink>}
            </AdminNavGroup>

            <AdminNavGroup
              id="talk"
              icon={EnvelopeSimple}
              label="Messages"
              first="/admin/messages"
              {...group}
              badge={{ count: (messageUnread || 0) + (unreadCount || 0) + (isSuperAdmin ? feedbackNew || 0 : 0) }}
            >
              {/* Admin-to-admin messaging; announcements live there as a tab. */}
              <NavLink to="/admin/messages" className={subNavCls}>Messages<NavBadge count={messageUnread} label="unread" /></NavLink>
              {/* Emails to many people: everyone, or a town's people for a municipal admin. */}
              <NavLink to="/admin/email" className={subNavCls}>Email</NavLink>
              <NavLink to="/admin/notifications" className={subNavCls}>Notifications<NavBadge count={unreadCount} label="unread" /></NavLink>
              {isSuperAdmin && <NavLink to="/admin/feedback" className={subNavCls}>Feedback<NavBadge count={feedbackNew} label="new" /></NavLink>}
            </AdminNavGroup>

            {isSuperAdmin && (
              <AdminNavGroup id="storefront" icon={StoreIcon} label="Storefront" first="/admin/banners" {...group}>
                <NavLink to="/admin/banners" className={subNavCls}>Banners</NavLink>
                <NavLink to="/admin/vouchers" className={subNavCls}>Vouchers</NavLink>
                <NavLink to="/admin/couriers" className={subNavCls}>Couriers</NavLink>
                <NavLink to="/admin/categories" className={subNavCls}>Categories</NavLink>
              </AdminNavGroup>
            )}

            <AdminNavGroup
              id="platform"
              icon={PieChart}
              label={isSuperAdmin ? 'Platform' : 'Town office'}
              first={isSuperAdmin ? '/admin/municipalities' : '/admin/analytics'}
              {...group}
            >
              {isSuperAdmin && <NavLink to="/admin/municipalities" className={subNavCls}>Municipalities</NavLink>}
              {isSuperAdmin && <NavLink to="/admin/app-users" className={subNavCls}>App users</NavLink>}
              <NavLink to="/admin/analytics" className={subNavCls}>Analytics</NavLink>
              {isSuperAdmin && <NavLink to="/admin/ml" className={subNavCls}>ML engine</NavLink>}
              <NavLink to="/admin/audit-logs" className={subNavCls}>Audit log</NavLink>
              <NavLink to="/admin/settings" className={subNavCls}>Settings</NavLink>
            </AdminNavGroup>
          </nav>

          {/* Smaller screens: the admin's card at the foot of the drawer (the
              header has the account menu on computers). An admin's profile is
              a tab of Settings: /profile is a buyer page, which the admin
              guard would send straight back to /admin. */}
          {isCompact && (
            <Link to="/admin/settings?tab=profile" className="ac-user-card" title="View profile">
              <UserAvatar
                src={user?.profilePhoto}
                person={user}
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
          )}
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

          {/* Computers: one white bar, as in the Seller Center: make
              something, messages, notifications and language, the account. */}
          {!isCompact && (
            <div className="sc-head-actions">
              <AdminCreateMenu isSuperAdmin={isSuperAdmin} />
              <Link
                to="/admin/messages"
                className="sc-head-btn"
                title="Messages"
                aria-label={messageUnread > 0 ? `Messages, ${messageUnread} unread` : 'Messages'}
              >
                <EnvelopeSimple size={21} />
                {messageUnread > 0 && <span className="sc-head-badge" aria-hidden="true">{messageUnread > 9 ? '9+' : messageUnread}</span>}
              </Link>
              <AppRail
                placement="bar"
                unreadCount={unreadCount}
                notifications={notifications}
                onRead={() => refreshShell('notifications')}
                onLogout={handleLogout}
                notificationsTo="/admin/notifications"
                audience="ADMIN"
                signOutMessage="You will need to sign in again to open the admin panel."
              />
              <span className="sc-head-rule" aria-hidden="true" />
              {account}
            </div>
          )}

          {/* Smaller screens: the buttons that were always here. */}
          {isCompact && (
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
                onClick={() => setLogoutOpen(true)}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            </div>
          )}
        </header>

        {/* Tablets keep the strip of related pages; computers have the
            grouped menu and "+ Create" instead. */}
        {!isPhone && isCompact && <ToolStrip area="admin" role={user?.role} />}

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

      {/* The rail down the right edge: smaller screens only (computers have
          it in the header). */}
      {isCompact && (
        <AppRail
          unreadCount={unreadCount}
          notifications={notifications}
          onRead={() => refreshShell('notifications')}
          onLogout={handleLogout}
          notificationsTo="/admin/notifications"
          audience="ADMIN"
          signOutMessage="You will need to sign in again to open the admin panel."
        />
      )}

      {/* Phones: the app tab bar (hidden on pages opened from it). */}
      {isPhone && (
        <nav className={`sc-tabbar sc-tabbar--app acm-tabbar${isTabRoot ? '' : ' is-hidden'}`} aria-label="Admin sections">
          <NavLink to="/admin" end className={tabCls}>
            {({ isActive }) => <><House size={21} weight={isActive ? 'fill' : 'light'} /><span>Home</span></>}
          </NavLink>
          <NavLink to="/admin/tools" end className={tabCls}>
            {({ isActive }) => (
              <>
                <span className="sc-tab-icon">
                  <SquaresFour size={21} weight={isActive ? 'fill' : 'light'} />
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
                  <Receipt size={21} weight={isActive ? 'fill' : 'light'} />
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
                  <ChatsCircle size={21} weight={isActive ? 'fill' : 'light'} />
                  {count('/admin/support') > 0 && <b className="sc-tab-badge">{count('/admin/support') > 99 ? '99+' : count('/admin/support')}</b>}
                </span>
                <span>Support</span>
              </>
            )}
          </NavLink>
          <NavLink to="/admin/menu" end className={tabCls}>
            {({ isActive }) => <><UserCircle size={21} weight={isActive ? 'fill' : 'light'} /><span>Me</span></>}
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
  return `ac-subnav-link${isActive ? ' ac-subnav-link--active' : ''}`;
}

/** The menu's groups and the pages in each (which group holds a page). */
const ADMIN_NAV_GROUPS = {
  review: ['/admin/sellers', '/admin/products', '/admin/returns', '/admin/reports', '/admin/flags'],
  people: ['/admin/all-sellers', '/admin/buyers', '/admin/users', '/admin/junior-admins', '/admin/team'],
  content: ['/admin/reviews', '/admin/photo-designs', '/admin/invites'],
  talk: ['/admin/messages', '/admin/email', '/admin/notifications', '/admin/feedback'],
  storefront: ['/admin/banners', '/admin/vouchers', '/admin/couriers', '/admin/categories'],
  platform: ['/admin/municipalities', '/admin/app-users', '/admin/analytics', '/admin/ml', '/admin/audit-logs', '/admin/settings'],
};
const REVIEW_PAGES = ADMIN_NAV_GROUPS.review;

function adminGroupOf(pathname) {
  return Object.keys(ADMIN_NAV_GROUPS)
    .find((id) => ADMIN_NAV_GROUPS[id].some((p) => pathname === p || pathname.startsWith(`${p}/`)));
}

const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };

/** Several queues as one badge: the counts added, the most urgent kept. */
function mergeAll(list) {
  return list.reduce((acc, w) => {
    const count = (acc.count || 0) + (w?.count || 0);
    const severity = (SEVERITY_RANK[w?.severity] || 0) > (SEVERITY_RANK[acc.severity] || 0) ? w.severity : acc.severity;
    return { ...acc, ...w, count, severity };
  }, { count: 0 });
}

/**
 * A group in the menu: its row opens and closes its pages (collapsed to
 * icons, it goes to `first`). Closed, it carries its pages' waiting count.
 */
function AdminNavGroup({
  id, icon: Icon, label, first, openGroups, toggleGroup, collapsed, path, badge: waiting, children,
}) {
  const navigate = useNavigate();
  const open = openGroups.has(id) && !collapsed;
  const here = adminGroupOf(path) === id;
  return (
    <>
      <button
        type="button"
        className={`ac-nav-item ac-nav-group${open ? ' is-open' : ''}${here ? ' is-here' : ''}`}
        onClick={() => (collapsed ? navigate(first) : toggleGroup(id))}
        aria-expanded={open}
        title={label}
      >
        <Icon size={17} weight="fill" />
        <span>{label}</span>
        {!open && waiting?.count > 0 && <NavBadge {...waiting} />}
        <CaretDown size={15} className="ac-nav-chevron" />
      </button>
      <div className={`ac-subnav-wrap${open ? ' is-open' : ''}`}>
        <div className="ac-subnav">{children}</div>
      </div>
    </>
  );
}

/** "+ Create": what an admin makes most, each a link to the page that does it. */
const ADMIN_CREATE = [
  { label: 'Announcement', note: 'News for sellers and buyers', to: '/admin/messages?tab=announcements', icon: Megaphone, tone: 'blue' },
  { label: 'Email', note: 'A message to many people', to: '/admin/email', icon: PaperPlaneTilt, tone: 'violet' },
  { label: 'Banner', note: 'A picture on the Home page', to: '/admin/banners/new', icon: ImageIcon, tone: 'teal', superOnly: true },
  { label: 'Voucher', note: 'A discount code', to: '/admin/vouchers/new', icon: Ticket, tone: 'rose', superOnly: true },
  { label: 'Category', note: 'A new aisle for products', to: '/admin/categories/new', icon: Tag, tone: 'amber', superOnly: true },
];

function AdminCreateMenu({ isSuperAdmin }) {
  const { open, ref, hoverProps, dismiss, toggle } = useHeadCard();
  const items = ADMIN_CREATE.filter((c) => isSuperAdmin || !c.superOnly);
  return (
    <div className={`sc-create hc${open ? ' is-open' : ''}`} ref={ref} {...hoverProps}>
      <button type="button" className="sc-create-btn" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <Plus size={16} weight="bold" /> Create <CaretDown size={13} weight="bold" className="sc-create-caret" />
      </button>
      <div className="hc-pop sc-create-menu" role="menu" aria-label="Create" aria-hidden={!open} inert={!open}>
        <CardLinks items={items} onPick={dismiss} />
      </div>
    </div>
  );
}

function tabCls({ isActive }) {
  return `sc-tab${isActive ? ' is-active' : ''}`;
}

/**
 * Pages whose own actions change one of the shell's counts, and that count.
 * Leaving one reads the count again (the pages do not report it themselves).
 */
const REREAD_ON_LEAVE = [
  ['/admin/notifications', 'notifications'],
  ['/admin/messages', 'messages'],
  ['/admin/feedback', 'feedback'],
  ['/admin/support', 'attention'],
  // Reading the team's chats clears the Admin team badge.
  ['/admin/team', 'attention'],
  // Marking a flag changes the Unusual activity badge.
  ['/admin/flags', 'flags'],
  // The municipality's page (its logo) and the admin's own profile.
  ['/admin/settings', 'profile'],
];

/** Phones: the tab bar's pages; Home and Me draw their own header. */
const PHONE_TABS = ['/admin', '/admin/tools', '/admin/orders', '/admin/support', '/admin/menu'];
const PHONE_OWN_HEADER = ['/admin', '/admin/menu'];
/** Phones: shorter titles for the bar than the desktop crumbs. */
const PHONE_TITLES = {
  '/admin/tools': 'Tools',
  '/admin/products': 'Products',
  '/admin/orders': 'Orders',
  '/admin/support': 'Support',
  '/admin/reports': 'Reports',
  '/admin/menu': 'Me',
  '/admin/notifications': 'Notifications',
};

const LABELS = {
  '/admin': 'Dashboard',
  '/admin/sellers': 'Seller applications',
  '/admin/all-sellers': 'Sellers',
  '/admin/buyers': 'Buyers',
  '/admin/products': 'Products',
  '/admin/orders': 'Orders',
  '/admin/reports': 'Reports',
  '/admin/flags': 'Unusual activity',
  '/admin/users': 'All users',
  '/admin/categories': 'Categories',
  '/admin/municipalities': 'Municipalities',
  '/admin/analytics': 'Analytics',
  '/admin/messages': 'Messages',
  '/admin/email': 'Email',
  '/admin/feedback': 'Feedback',
  '/admin/support': 'Support',
  '/admin/notifications': 'Notifications',
  '/admin/reviews': 'Reviews',
  '/admin/photo-designs': 'Photo designs',
  '/admin/invites': 'Invites',
  '/admin/returns': 'Returns',
  '/admin/banners': 'Banners',
  '/admin/couriers': 'Couriers',
  '/admin/vouchers': 'Vouchers',
  '/admin/app-users': 'App users',
  '/admin/team': 'Admin team',
  '/admin/junior-admins': 'Municipal admins',
  '/admin/audit-logs': 'Audit log',
  '/admin/ml': 'ML engine',
  '/admin/settings': 'Settings',
  '/admin/menu': 'Me',
  '/admin/tools': 'Tools',
};

const ID_PART = /^[0-9a-f]{8}-[0-9a-f-]{27,}$|^c[a-z0-9]{20,}$/i;
const FORM_PARTS = { new: 'New', edit: 'Edit' };
// What a list's form page makes: "New voucher", "Edit banner".
const ONE_OF = {
  banners: 'banner', vouchers: 'voucher', couriers: 'courier', categories: 'category', municipalities: 'municipality',
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
    // A form's own page: "New" / "Edit"; the record's id is not a crumb.
    if (ID_PART.test(parts[i])) continue;
    const form = FORM_PARTS[parts[i]] && `${FORM_PARTS[parts[i]]}${ONE_OF[parts[1]] ? ` ${ONE_OF[parts[1]]}` : ''}`;
    const label = LABELS[acc] || form || capitalize(parts[i]);
    crumbs.push({ to: acc, label });
  }
  return crumbs;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
